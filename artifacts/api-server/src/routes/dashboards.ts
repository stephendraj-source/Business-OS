import { Router } from 'express';
import { db, users } from '@workspace/db';
import { dashboardsTable, dashboardShares } from '@workspace/db';
import { userGroups, groupRoles } from '@workspace/db';
import { eq, or, inArray, and } from 'drizzle-orm';

export const dashboardsRouter = Router();

function getAuth(req: any): { userId: number | null; tenantId: number | null; role: string | null } {
  const auth = req.auth;
  if (auth) return { userId: auth.userId, tenantId: auth.tenantId, role: auth.role };
  const h = req.headers['x-user-id'];
  return { userId: h ? parseInt(h as string) : null, tenantId: null, role: null };
}

async function getAccessibleDashboardIds(userId: number | null, tenantId: number | null, role: string | null) {
  if (!userId) return [];
  if (role === 'admin' || role === 'superuser') {
    const query = db.select({ id: dashboardsTable.id }).from(dashboardsTable);
    const all = tenantId
      ? await query.where(eq(dashboardsTable.tenantId, tenantId))
      : await query;
    return all.map(d => d.id);
  }
  const userGroupRows = await db.select({ groupId: userGroups.groupId }).from(userGroups).where(eq(userGroups.userId, userId));
  const groupIds = userGroupRows.map(r => r.groupId);
  const userGroupRoles = groupIds.length > 0
    ? await db.select({ roleId: groupRoles.roleId }).from(groupRoles).where(inArray(groupRoles.groupId, groupIds))
    : [];
  const roleIds = userGroupRoles.map(r => r.roleId);

  const shareConditions = [eq(dashboardShares.sharedWithUserId, userId)];
  if (roleIds.length) shareConditions.push(inArray(dashboardShares.sharedWithRoleId, roleIds));
  if (groupIds.length) shareConditions.push(inArray(dashboardShares.sharedWithGroupId, groupIds));

  const ownedQuery = db.select({ id: dashboardsTable.id }).from(dashboardsTable)
    .where(tenantId
      ? and(eq(dashboardsTable.createdBy, userId), eq(dashboardsTable.tenantId, tenantId))
      : eq(dashboardsTable.createdBy, userId));

  const [owned, shared] = await Promise.all([
    ownedQuery,
    db.select({ dashboardId: dashboardShares.dashboardId }).from(dashboardShares).where(or(...shareConditions)),
  ]);
  return [...new Set([...owned.map(d => d.id), ...shared.map(d => d.dashboardId)])];
}

dashboardsRouter.get('/dashboards', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    if (!userId) return res.json([]);
    const ids = await getAccessibleDashboardIds(userId, tenantId, role);
    if (!ids.length) return res.json([]);
    const dashboards = await db.select().from(dashboardsTable).where(inArray(dashboardsTable.id, ids));
    const sharesRows = await db.select().from(dashboardShares).where(inArray(dashboardShares.dashboardId, ids));
    const result = dashboards.map(d => ({
      ...d,
      isOwner: d.createdBy === userId,
      canEdit: d.createdBy === userId || sharesRows.some(s => s.dashboardId === d.id && s.canEdit && s.sharedWithUserId === userId),
      shares: sharesRows.filter(s => s.dashboardId === d.id),
    }));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

dashboardsRouter.post('/dashboards', async (req, res) => {
  try {
    const { userId, tenantId } = getAuth(req);
    const { name = 'My Dashboard', widgets = [] } = req.body;
    const [row] = await db.insert(dashboardsTable).values({ name, widgets, createdBy: userId, tenantId }).returning();
    res.status(201).json({ ...row, isOwner: true, canEdit: true, shares: [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

dashboardsRouter.patch('/dashboards/:id', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    const id = parseInt(req.params.id);
    const dashboard = await db.select().from(dashboardsTable).where(eq(dashboardsTable.id, id));
    if (!dashboard.length) return res.status(404).json({ error: 'Not found' });
    if (tenantId && dashboard[0].tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    const isOwner = dashboard[0].createdBy === userId;
    const shares = await db.select().from(dashboardShares).where(eq(dashboardShares.dashboardId, id));
    const canEdit = isOwner || role === 'admin' || shares.some(s => s.canEdit && s.sharedWithUserId === userId);
    if (!canEdit) return res.status(403).json({ error: 'No edit access' });
    const { name, widgets } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (widgets !== undefined) updates.widgets = widgets;
    const [updated] = await db.update(dashboardsTable).set(updates).where(eq(dashboardsTable.id, id)).returning();
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

dashboardsRouter.delete('/dashboards/:id', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    const id = parseInt(req.params.id);
    const dashboard = await db.select().from(dashboardsTable).where(eq(dashboardsTable.id, id));
    if (!dashboard.length) return res.status(404).json({ error: 'Not found' });
    if (tenantId && dashboard[0].tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    const isOwner = dashboard[0].createdBy === userId;
    if (!isOwner && role !== 'admin') return res.status(403).json({ error: 'No delete access' });
    await db.delete(dashboardsTable).where(eq(dashboardsTable.id, id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

dashboardsRouter.get('/dashboards/:id/shares', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const shares = await db.select().from(dashboardShares).where(eq(dashboardShares.dashboardId, id));
    res.json(shares);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

dashboardsRouter.put('/dashboards/:id/shares', async (req, res) => {
  try {
    const { userId, tenantId, role } = getAuth(req);
    const id = parseInt(req.params.id);
    const dashboard = await db.select().from(dashboardsTable).where(eq(dashboardsTable.id, id));
    if (!dashboard.length) return res.status(404).json({ error: 'Not found' });
    if (tenantId && dashboard[0].tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    const isOwner = dashboard[0].createdBy === userId;
    if (!isOwner && role !== 'admin') return res.status(403).json({ error: 'No share access' });
    const { shares } = req.body as { shares: { sharedWithUserId?: number; sharedWithRoleId?: number; sharedWithGroupId?: number; canEdit: boolean }[] };
    await db.delete(dashboardShares).where(eq(dashboardShares.dashboardId, id));
    if (shares?.length) {
      await db.insert(dashboardShares).values(shares.map(s => ({ dashboardId: id, ...s })));
    }
    const result = await db.select().from(dashboardShares).where(eq(dashboardShares.dashboardId, id));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
