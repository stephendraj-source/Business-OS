import { Router } from 'express';
import { db, users, groups, roles } from '@workspace/db';
import { customReportsTable, reportShares } from '@workspace/db';
import { eq, or, inArray } from 'drizzle-orm';
import { userGroups, groupRoles } from '@workspace/db';

export const reportsRouter = Router();

function getUserId(req: any): number | null {
  const h = req.headers['x-user-id'];
  return h ? parseInt(h as string) : null;
}

async function getAccessibleReportIds(userId: number | null) {
  if (!userId) return [];
  const user = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (user[0]?.role === 'admin') {
    const all = await db.select({ id: customReportsTable.id }).from(customReportsTable);
    return all.map(r => r.id);
  }
  const userGroupRows = await db.select({ groupId: userGroups.groupId }).from(userGroups).where(eq(userGroups.userId, userId));
  const groupIds = userGroupRows.map(r => r.groupId);
  const userGroupRoles = groupIds.length > 0
    ? await db.select({ roleId: groupRoles.roleId }).from(groupRoles).where(inArray(groupRoles.groupId, groupIds))
    : [];
  const roleIds = userGroupRoles.map(r => r.roleId);

  const shareConditions = [eq(reportShares.sharedWithUserId, userId)];
  if (roleIds.length) shareConditions.push(inArray(reportShares.sharedWithRoleId, roleIds));
  if (groupIds.length) shareConditions.push(inArray(reportShares.sharedWithGroupId, groupIds));

  const [owned, shared] = await Promise.all([
    db.select({ id: customReportsTable.id }).from(customReportsTable).where(eq(customReportsTable.createdBy, userId)),
    db.select({ reportId: reportShares.reportId }).from(reportShares).where(or(...shareConditions)),
  ]);
  return [...new Set([...owned.map(r => r.id), ...shared.map(r => r.reportId)])];
}

reportsRouter.get('/reports', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json([]);
    const ids = await getAccessibleReportIds(userId);
    if (!ids.length) return res.json([]);
    const reports = await db.select().from(customReportsTable).where(inArray(customReportsTable.id, ids));
    const sharesRows = await db.select().from(reportShares).where(inArray(reportShares.reportId, ids));
    const result = reports.map(r => ({
      ...r,
      isOwner: r.createdBy === userId,
      canEdit: r.createdBy === userId || sharesRows.some(s => s.reportId === r.id && s.canEdit &&
        (s.sharedWithUserId === userId)),
      shares: sharesRows.filter(s => s.reportId === r.id),
    }));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reportsRouter.post('/reports', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { title, description = '', type = 'table', fields = [] } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const [row] = await db.insert(customReportsTable).values({ title, description, type, fields, createdBy: userId }).returning();
    res.status(201).json({ ...row, isOwner: true, canEdit: true, shares: [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reportsRouter.patch('/reports/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(req.params.id);
    const report = await db.select().from(customReportsTable).where(eq(customReportsTable.id, id));
    if (!report.length) return res.status(404).json({ error: 'Not found' });
    const isOwner = report[0].createdBy === userId;
    const shares = await db.select().from(reportShares).where(eq(reportShares.reportId, id));
    const canEdit = isOwner || shares.some(s => s.canEdit && s.sharedWithUserId === userId);
    if (!canEdit) return res.status(403).json({ error: 'No edit access' });
    const { title, description, type, fields } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) updates.type = type;
    if (fields !== undefined) updates.fields = fields;
    const [updated] = await db.update(customReportsTable).set(updates).where(eq(customReportsTable.id, id)).returning();
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reportsRouter.delete('/reports/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(req.params.id);
    const report = await db.select().from(customReportsTable).where(eq(customReportsTable.id, id));
    if (!report.length) return res.status(404).json({ error: 'Not found' });
    const isOwner = report[0].createdBy === userId;
    const userRole = userId ? (await db.select({ role: users.role }).from(users).where(eq(users.id, userId)))[0]?.role : null;
    if (!isOwner && userRole !== 'admin') return res.status(403).json({ error: 'No delete access' });
    await db.delete(customReportsTable).where(eq(customReportsTable.id, id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reportsRouter.get('/reports/:id/shares', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const shares = await db.select().from(reportShares).where(eq(reportShares.reportId, id));
    res.json(shares);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reportsRouter.put('/reports/:id/shares', async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(req.params.id);
    const report = await db.select().from(customReportsTable).where(eq(customReportsTable.id, id));
    if (!report.length) return res.status(404).json({ error: 'Not found' });
    const isOwner = report[0].createdBy === userId;
    const userRole = userId ? (await db.select({ role: users.role }).from(users).where(eq(users.id, userId)))[0]?.role : null;
    if (!isOwner && userRole !== 'admin') return res.status(403).json({ error: 'No share access' });
    const { shares } = req.body as { shares: { sharedWithUserId?: number; sharedWithRoleId?: number; sharedWithGroupId?: number; canEdit: boolean }[] };
    await db.delete(reportShares).where(eq(reportShares.reportId, id));
    if (shares?.length) {
      await db.insert(reportShares).values(shares.map(s => ({ reportId: id, ...s })));
    }
    const result = await db.select().from(reportShares).where(eq(reportShares.reportId, id));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
