import { Router } from 'express';
import {
  db, users,
  groups, userGroups,
  roles, groupRoles,
  roleModuleAccess, roleAllowedCategories, roleAllowedProcesses, roleFieldPermissions,
  projects, userProjects,
} from '@workspace/db';
import { eq } from 'drizzle-orm';

export const orgRouter = Router();

function safeUser(u: typeof users.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

// ── Groups ────────────────────────────────────────────────────────────────────

orgRouter.get('/org/groups', async (_req, res) => {
  try {
    const rows = await db.select().from(groups).orderBy(groups.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/groups', async (req, res) => {
  try {
    const { name, description = '', color = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(groups).values({ name, description, color }).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/groups/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color } = req.body;
    const updates: Partial<typeof groups.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;
    const [row] = await db.update(groups).set(updates).where(eq(groups.id, id)).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/groups/:id', async (req, res) => {
  try {
    await db.delete(groups).where(eq(groups.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Members of a group (users)
orgRouter.get('/org/groups/:id/members', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, designation: users.designation })
      .from(userGroups)
      .innerJoin(users, eq(userGroups.userId, users.id))
      .where(eq(userGroups.groupId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/groups/:id/members', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { userIds = [] } = req.body as { userIds?: number[] };
    await db.delete(userGroups).where(eq(userGroups.groupId, id));
    if (userIds.length > 0) {
      await db.insert(userGroups).values(userIds.map(userId => ({ groupId: id, userId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Roles a group belongs to
orgRouter.get('/org/groups/:id/roles', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: roles.id, name: roles.name, color: roles.color, description: roles.description })
      .from(groupRoles)
      .innerJoin(roles, eq(groupRoles.roleId, roles.id))
      .where(eq(groupRoles.groupId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/groups/:id/roles', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { roleIds = [] } = req.body as { roleIds?: number[] };
    await db.delete(groupRoles).where(eq(groupRoles.groupId, id));
    if (roleIds.length > 0) {
      await db.insert(groupRoles).values(roleIds.map(roleId => ({ groupId: id, roleId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Roles ─────────────────────────────────────────────────────────────────────

orgRouter.get('/org/roles', async (_req, res) => {
  try {
    const rows = await db.select().from(roles).orderBy(roles.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/roles', async (req, res) => {
  try {
    const { name, description = '', color = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(roles).values({ name, description, color }).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/roles/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color } = req.body;
    const updates: Partial<typeof roles.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;
    const [row] = await db.update(roles).set(updates).where(eq(roles.id, id)).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/roles/:id', async (req, res) => {
  try {
    await db.delete(roles).where(eq(roles.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Groups that belong to a role
orgRouter.get('/org/roles/:id/groups', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: groups.id, name: groups.name, color: groups.color, description: groups.description })
      .from(groupRoles)
      .innerJoin(groups, eq(groupRoles.groupId, groups.id))
      .where(eq(groupRoles.roleId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/roles/:id/groups', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { groupIds = [] } = req.body as { groupIds?: number[] };
    await db.delete(groupRoles).where(eq(groupRoles.roleId, id));
    if (groupIds.length > 0) {
      await db.insert(groupRoles).values(groupIds.map(groupId => ({ roleId: id, groupId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Role permissions (full detail)
orgRouter.get('/org/roles/:id/permissions', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [modules, categories, procs, fields] = await Promise.all([
      db.select().from(roleModuleAccess).where(eq(roleModuleAccess.roleId, id)),
      db.select().from(roleAllowedCategories).where(eq(roleAllowedCategories.roleId, id)),
      db.select().from(roleAllowedProcesses).where(eq(roleAllowedProcesses.roleId, id)),
      db.select().from(roleFieldPermissions).where(eq(roleFieldPermissions.roleId, id)),
    ]);
    res.json({ modules, categories, processes: procs, fields });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/roles/:id/modules', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { modules } = req.body as { modules: { module: string; hasAccess: boolean }[] };
    await db.delete(roleModuleAccess).where(eq(roleModuleAccess.roleId, id));
    if (modules?.length) {
      await db.insert(roleModuleAccess).values(modules.map(m => ({ roleId: id, module: m.module, hasAccess: m.hasAccess })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/roles/:id/categories', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { categories } = req.body as { categories: string[] };
    await db.delete(roleAllowedCategories).where(eq(roleAllowedCategories.roleId, id));
    if (categories?.length) {
      await db.insert(roleAllowedCategories).values(categories.map(c => ({ roleId: id, category: c })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/roles/:id/processes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { processes } = req.body as { processes: { processId: number; canEdit: boolean }[] };
    await db.delete(roleAllowedProcesses).where(eq(roleAllowedProcesses.roleId, id));
    if (processes?.length) {
      await db.insert(roleAllowedProcesses).values(processes.map(p => ({ roleId: id, processId: p.processId, canEdit: p.canEdit })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/roles/:id/field-permissions', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { permissions } = req.body as { permissions: { catalogueType: string; fieldKey: string; canView: boolean; canEdit: boolean }[] };
    await db.delete(roleFieldPermissions).where(eq(roleFieldPermissions.roleId, id));
    if (permissions?.length) {
      await db.insert(roleFieldPermissions).values(permissions.map(p => ({ roleId: id, catalogueType: p.catalogueType, fieldKey: p.fieldKey, canView: p.canView, canEdit: p.canEdit })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── User Group Memberships ─────────────────────────────────────────────────────

orgRouter.get('/org/users/:id/groups', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: groups.id, name: groups.name, color: groups.color, description: groups.description })
      .from(userGroups)
      .innerJoin(groups, eq(userGroups.groupId, groups.id))
      .where(eq(userGroups.userId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/users/:id/groups', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { groupIds = [] } = req.body as { groupIds?: number[] };
    await db.delete(userGroups).where(eq(userGroups.userId, id));
    if (groupIds.length > 0) {
      await db.insert(userGroups).values(groupIds.map(groupId => ({ userId: id, groupId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Projects ───────────────────────────────────────────────────────────────────

orgRouter.get('/org/projects', async (_req, res) => {
  try {
    const rows = await db.select().from(projects).orderBy(projects.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/projects', async (req, res) => {
  try {
    const { name, description = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(projects).values({ name, description }).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/projects/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description } = req.body;
    const updates: Partial<typeof projects.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    const [row] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/projects/:id', async (req, res) => {
  try {
    await db.delete(projects).where(eq(projects.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Full org tree ──────────────────────────────────────────────────────────────

orgRouter.get('/org/tree', async (_req, res) => {
  try {
    const [allGroups, allRoles, allGroupRoles, allProjects] = await Promise.all([
      db.select().from(groups).orderBy(groups.name),
      db.select().from(roles).orderBy(roles.name),
      db.select().from(groupRoles),
      db.select().from(projects).orderBy(projects.name),
    ]);
    res.json({ groups: allGroups, roles: allRoles, groupRoles: allGroupRoles, projects: allProjects });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
