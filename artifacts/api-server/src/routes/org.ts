import { Router } from 'express';
import {
  db, users, tenants,
  groups, userGroups, groupBusinessUnits, groupRegions,
  roles, groupRoles, userRoles, roleBusinessUnits, roleRegions,
  roleModuleAccess, roleAllowedCategories, roleAllowedProcesses, roleFieldPermissions,
  projects, userProjects,
  businessUnits, userBusinessUnits,
  regions, userRegions,
} from '@workspace/db';
import { eq, sql } from 'drizzle-orm';

export const orgRouter = Router();

const ALL_MODULES = [
  'table', 'tree', 'portfolio', 'process-map', 'governance',
  'workflows', 'ai-agents', 'connectors', 'dashboards',
  'reports', 'audit-logs', 'settings', 'users',
];

function safeUser(u: typeof users.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

function getTenantId(req: any): number | null {
  return req.auth?.tenantId ?? null;
}

// ── Groups ────────────────────────────────────────────────────────────────────

orgRouter.get('/org/groups', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const query = db.select().from(groups);
    const rows = tenantId
      ? await query.where(eq(groups.tenantId, tenantId)).orderBy(groups.name)
      : await query.orderBy(groups.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/groups', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description = '', color = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(groups).values({ name, description, color, tenantId }).returning();
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

orgRouter.get('/org/roles', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const query = db.select().from(roles);
    const rows = tenantId
      ? await query.where(eq(roles.tenantId, tenantId)).orderBy(roles.name)
      : await query.orderBy(roles.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/roles', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description = '', color = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(roles).values({ name, description, color, tenantId }).returning();
    await db.insert(roleModuleAccess).values(
      ALL_MODULES.map(module => ({ roleId: row.id, module, hasAccess: false }))
    );
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
    const id = parseInt(req.params.id);
    const [role] = await db.select({ isSystem: roles.isSystem }).from(roles).where(eq(roles.id, id));
    if (role?.isSystem) return res.status(403).json({ error: 'System roles cannot be deleted.' });
    await db.delete(roles).where(eq(roles.id, id));
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

orgRouter.get('/org/users/:id/roles', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: roles.id, name: roles.name, color: roles.color, description: roles.description })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/users/:id/roles', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { roleIds = [] } = req.body as { roleIds?: number[] };
    await db.delete(userRoles).where(eq(userRoles.userId, id));
    if (roleIds.length > 0) {
      await db.insert(userRoles).values(roleIds.map(roleId => ({ userId: id, roleId })));
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

// ── Business Units ─────────────────────────────────────────────────────────────

orgRouter.get('/org/business-units', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const query = db.select().from(businessUnits);
    const rows = tenantId
      ? await query.where(eq(businessUnits.tenantId, tenantId)).orderBy(businessUnits.name)
      : await query.orderBy(businessUnits.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/business-units', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description = '', color = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(businessUnits).values({ name, description, color, tenantId }).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/business-units/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color } = req.body;
    const updates: Partial<typeof businessUnits.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;
    const [row] = await db.update(businessUnits).set(updates).where(eq(businessUnits.id, id)).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/business-units/:id', async (req, res) => {
  try {
    await db.delete(businessUnits).where(eq(businessUnits.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/business-units/:id/users', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(userBusinessUnits)
      .innerJoin(users, eq(userBusinessUnits.userId, users.id))
      .where(eq(userBusinessUnits.businessUnitId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/business-units/:id/users', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { userIds = [] } = req.body as { userIds?: number[] };
    await db.delete(userBusinessUnits).where(eq(userBusinessUnits.businessUnitId, id));
    if (userIds.length > 0) {
      await db.insert(userBusinessUnits).values(userIds.map(userId => ({ userId, businessUnitId: id })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/business-units/:id/groups', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: groups.id, name: groups.name, color: groups.color, description: groups.description })
      .from(groupBusinessUnits)
      .innerJoin(groups, eq(groupBusinessUnits.groupId, groups.id))
      .where(eq(groupBusinessUnits.businessUnitId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/business-units/:id/groups', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { groupIds = [] } = req.body as { groupIds?: number[] };
    await db.delete(groupBusinessUnits).where(eq(groupBusinessUnits.businessUnitId, id));
    if (groupIds.length > 0) {
      await db.insert(groupBusinessUnits).values(groupIds.map(groupId => ({ groupId, businessUnitId: id })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/business-units/:id/roles', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: roles.id, name: roles.name, color: roles.color, description: roles.description })
      .from(roleBusinessUnits)
      .innerJoin(roles, eq(roleBusinessUnits.roleId, roles.id))
      .where(eq(roleBusinessUnits.businessUnitId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/business-units/:id/roles', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { roleIds = [] } = req.body as { roleIds?: number[] };
    await db.delete(roleBusinessUnits).where(eq(roleBusinessUnits.businessUnitId, id));
    if (roleIds.length > 0) {
      await db.insert(roleBusinessUnits).values(roleIds.map(roleId => ({ roleId, businessUnitId: id })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/users/:id/business-units', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: businessUnits.id, name: businessUnits.name, color: businessUnits.color, description: businessUnits.description })
      .from(userBusinessUnits)
      .innerJoin(businessUnits, eq(userBusinessUnits.businessUnitId, businessUnits.id))
      .where(eq(userBusinessUnits.userId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/users/:id/business-units', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { businessUnitIds = [] } = req.body as { businessUnitIds?: number[] };
    await db.delete(userBusinessUnits).where(eq(userBusinessUnits.userId, id));
    if (businessUnitIds.length > 0) {
      await db.insert(userBusinessUnits).values(businessUnitIds.map(businessUnitId => ({ userId: id, businessUnitId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/groups/:id/business-units', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: businessUnits.id, name: businessUnits.name, color: businessUnits.color, description: businessUnits.description })
      .from(groupBusinessUnits)
      .innerJoin(businessUnits, eq(groupBusinessUnits.businessUnitId, businessUnits.id))
      .where(eq(groupBusinessUnits.groupId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/groups/:id/business-units', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { businessUnitIds = [] } = req.body as { businessUnitIds?: number[] };
    await db.delete(groupBusinessUnits).where(eq(groupBusinessUnits.groupId, id));
    if (businessUnitIds.length > 0) {
      await db.insert(groupBusinessUnits).values(businessUnitIds.map(businessUnitId => ({ groupId: id, businessUnitId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/roles/:id/business-units', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: businessUnits.id, name: businessUnits.name, color: businessUnits.color, description: businessUnits.description })
      .from(roleBusinessUnits)
      .innerJoin(businessUnits, eq(roleBusinessUnits.businessUnitId, businessUnits.id))
      .where(eq(roleBusinessUnits.roleId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/roles/:id/business-units', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { businessUnitIds = [] } = req.body as { businessUnitIds?: number[] };
    await db.delete(roleBusinessUnits).where(eq(roleBusinessUnits.roleId, id));
    if (businessUnitIds.length > 0) {
      await db.insert(roleBusinessUnits).values(businessUnitIds.map(businessUnitId => ({ roleId: id, businessUnitId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Regions ────────────────────────────────────────────────────────────────────

orgRouter.get('/org/regions', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const query = db.select().from(regions);
    const rows = tenantId
      ? await query.where(eq(regions.tenantId, tenantId)).orderBy(regions.name)
      : await query.orderBy(regions.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/regions', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description = '', color = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(regions).values({ name, description, color, tenantId }).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/regions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color } = req.body;
    const updates: Partial<typeof regions.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;
    const [row] = await db.update(regions).set(updates).where(eq(regions.id, id)).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/regions/:id', async (req, res) => {
  try {
    await db.delete(regions).where(eq(regions.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/regions/:id/users', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(userRegions)
      .innerJoin(users, eq(userRegions.userId, users.id))
      .where(eq(userRegions.regionId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/regions/:id/users', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { userIds = [] } = req.body as { userIds?: number[] };
    await db.delete(userRegions).where(eq(userRegions.regionId, id));
    if (userIds.length > 0) {
      await db.insert(userRegions).values(userIds.map(userId => ({ userId, regionId: id })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/regions/:id/groups', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: groups.id, name: groups.name, color: groups.color, description: groups.description })
      .from(groupRegions)
      .innerJoin(groups, eq(groupRegions.groupId, groups.id))
      .where(eq(groupRegions.regionId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/regions/:id/groups', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { groupIds = [] } = req.body as { groupIds?: number[] };
    await db.delete(groupRegions).where(eq(groupRegions.regionId, id));
    if (groupIds.length > 0) {
      await db.insert(groupRegions).values(groupIds.map(groupId => ({ groupId, regionId: id })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/regions/:id/roles', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: roles.id, name: roles.name, color: roles.color, description: roles.description })
      .from(roleRegions)
      .innerJoin(roles, eq(roleRegions.roleId, roles.id))
      .where(eq(roleRegions.regionId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/regions/:id/roles', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { roleIds = [] } = req.body as { roleIds?: number[] };
    await db.delete(roleRegions).where(eq(roleRegions.regionId, id));
    if (roleIds.length > 0) {
      await db.insert(roleRegions).values(roleIds.map(roleId => ({ roleId, regionId: id })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/users/:id/regions', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: regions.id, name: regions.name, color: regions.color, description: regions.description })
      .from(userRegions)
      .innerJoin(regions, eq(userRegions.regionId, regions.id))
      .where(eq(userRegions.userId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/users/:id/regions', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { regionIds = [] } = req.body as { regionIds?: number[] };
    await db.delete(userRegions).where(eq(userRegions.userId, id));
    if (regionIds.length > 0) {
      await db.insert(userRegions).values(regionIds.map(regionId => ({ userId: id, regionId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/groups/:id/regions', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: regions.id, name: regions.name, color: regions.color, description: regions.description })
      .from(groupRegions)
      .innerJoin(regions, eq(groupRegions.regionId, regions.id))
      .where(eq(groupRegions.groupId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/groups/:id/regions', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { regionIds = [] } = req.body as { regionIds?: number[] };
    await db.delete(groupRegions).where(eq(groupRegions.groupId, id));
    if (regionIds.length > 0) {
      await db.insert(groupRegions).values(regionIds.map(regionId => ({ groupId: id, regionId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/roles/:id/regions', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: regions.id, name: regions.name, color: regions.color, description: regions.description })
      .from(roleRegions)
      .innerJoin(regions, eq(roleRegions.regionId, regions.id))
      .where(eq(roleRegions.roleId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/roles/:id/regions', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { regionIds = [] } = req.body as { regionIds?: number[] };
    await db.delete(roleRegions).where(eq(roleRegions.roleId, id));
    if (regionIds.length > 0) {
      await db.insert(roleRegions).values(regionIds.map(regionId => ({ roleId: id, regionId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Organisation Profile ───────────────────────────────────────────────────────

orgRouter.get('/org/profile', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    const { id, name, address, websiteUrl, contact1Name, contact1Phone, contact1Email, contact2Name, contact2Phone, contact2Email } = row;
    res.json({ id, name, address, websiteUrl, contact1Name, contact1Phone, contact1Email, contact2Name, contact2Phone, contact2Email });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/profile', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const {
      name, address, websiteUrl,
      contact1Name, contact1Phone, contact1Email,
      contact2Name, contact2Phone, contact2Email,
    } = req.body;
    const updates: Partial<typeof tenants.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (address !== undefined) updates.address = address;
    if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl;
    if (contact1Name !== undefined) updates.contact1Name = contact1Name;
    if (contact1Phone !== undefined) updates.contact1Phone = contact1Phone;
    if (contact1Email !== undefined) updates.contact1Email = contact1Email;
    if (contact2Name !== undefined) updates.contact2Name = contact2Name;
    if (contact2Phone !== undefined) updates.contact2Phone = contact2Phone;
    if (contact2Email !== undefined) updates.contact2Email = contact2Email;
    const [row] = await db.update(tenants).set(updates).where(eq(tenants.id, tenantId)).returning();
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    const { id, name: n, address: a, websiteUrl: w, contact1Name: c1n, contact1Phone: c1p, contact1Email: c1e, contact2Name: c2n, contact2Phone: c2p, contact2Email: c2e } = row;
    res.json({ id, name: n, address: a, websiteUrl: w, contact1Name: c1n, contact1Phone: c1p, contact1Email: c1e, contact2Name: c2n, contact2Phone: c2p, contact2Email: c2e });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Full org tree ──────────────────────────────────────────────────────────────

orgRouter.get('/org/tree', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const [allGroups, allRoles, allGroupRoles, allProjects] = await Promise.all([
      tenantId
        ? db.select().from(groups).where(eq(groups.tenantId, tenantId)).orderBy(groups.name)
        : db.select().from(groups).orderBy(groups.name),
      tenantId
        ? db.select().from(roles).where(eq(roles.tenantId, tenantId)).orderBy(roles.name)
        : db.select().from(roles).orderBy(roles.name),
      db.select().from(groupRoles),
      db.select().from(projects).orderBy(projects.name),
    ]);
    res.json({ groups: allGroups, roles: allRoles, groupRoles: allGroupRoles, projects: allProjects });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── User Categories (configurable) ───────────────────────────────────────────

const DEFAULT_USER_CATEGORIES = [
  { name: 'Employee',  color: '#3b82f6', description: 'Internal staff members' },
  { name: 'Director',  color: '#6366f1', description: 'Board or executive directors' },
  { name: 'Customer',  color: '#22c55e', description: 'External customers or clients' },
  { name: 'Partner',   color: '#f97316', description: 'External partners or collaborators' },
  { name: 'Owner',     color: '#8b5cf6', description: 'Owners or shareholders' },
  { name: 'Regulator', color: '#ef4444', description: 'Regulatory bodies or compliance contacts' },
];

orgRouter.get('/org/user-categories', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const rows = await db.execute(
      sql`SELECT * FROM user_categories WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`} ORDER BY name`
    );
    let items = rows.rows as any[];
    // Seed defaults if empty
    if (items.length === 0) {
      for (const cat of DEFAULT_USER_CATEGORIES) {
        await db.execute(
          sql`INSERT INTO user_categories (tenant_id, name, color, description) VALUES (${tenantId}, ${cat.name}, ${cat.color}, ${cat.description})`
        );
      }
      const seeded = await db.execute(
        sql`SELECT * FROM user_categories WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`} ORDER BY name`
      );
      items = seeded.rows as any[];
    }
    res.json(items);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/user-categories', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description = '', color = '#94a3b8' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const rows = await db.execute(
      sql`INSERT INTO user_categories (tenant_id, name, color, description) VALUES (${tenantId}, ${name.trim()}, ${color}, ${description.trim()}) RETURNING *`
    );
    res.status(201).json((rows.rows as any[])[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/user-categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color } = req.body;
    const existing = await db.execute(sql`SELECT * FROM user_categories WHERE id = ${id} LIMIT 1`);
    const row = (existing.rows as any[])[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    const newName = name !== undefined ? name.trim() : row.name;
    const newDesc = description !== undefined ? description.trim() : row.description;
    const newColor = color !== undefined ? color : row.color;
    const updated = await db.execute(
      sql`UPDATE user_categories SET name = ${newName}, description = ${newDesc}, color = ${newColor} WHERE id = ${id} RETURNING *`
    );
    res.json((updated.rows as any[])[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/user-categories/:id', async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM user_categories WHERE id = ${parseInt(req.params.id)}`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Task Sources (configurable) ───────────────────────────────────────────────

const DEFAULT_TASK_SOURCES = [
  { name: 'Users',  color: '#3b82f6', description: 'Tasks created by users' },
  { name: 'AI Agents',  color: '#8b5cf6', description: 'Tasks created by AI agents requiring human approval' },
];

orgRouter.get('/org/task-sources', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const rows = await db.execute(
      sql`SELECT * FROM task_sources WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`} ORDER BY name`
    );
    let items = rows.rows as any[];
    if (items.length === 0) {
      for (const s of DEFAULT_TASK_SOURCES) {
        await db.execute(
          sql`INSERT INTO task_sources (tenant_id, name, color, description) VALUES (${tenantId}, ${s.name}, ${s.color}, ${s.description})`
        );
      }
      const seeded = await db.execute(
        sql`SELECT * FROM task_sources WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`} ORDER BY name`
      );
      items = seeded.rows as any[];
    }
    res.json(items);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/task-sources', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description = '', color = '#94a3b8' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const rows = await db.execute(
      sql`INSERT INTO task_sources (tenant_id, name, color, description) VALUES (${tenantId}, ${name.trim()}, ${color}, ${description.trim()}) RETURNING *`
    );
    res.status(201).json((rows.rows as any[])[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/task-sources/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color } = req.body;
    const existing = await db.execute(sql`SELECT * FROM task_sources WHERE id = ${id} LIMIT 1`);
    const row = (existing.rows as any[])[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    const newName  = name        !== undefined ? name.trim()        : row.name;
    const newDesc  = description !== undefined ? description.trim() : row.description;
    const newColor = color       !== undefined ? color              : row.color;
    const updated  = await db.execute(
      sql`UPDATE task_sources SET name = ${newName}, description = ${newDesc}, color = ${newColor} WHERE id = ${id} RETURNING *`
    );
    res.json((updated.rows as any[])[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/task-sources/:id', async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM task_sources WHERE id = ${parseInt(req.params.id)}`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Task Queues (configurable) ────────────────────────────────────────────────

const DEFAULT_TASK_QUEUES = [
  { name: 'General',        color: '#6b7280', description: 'General purpose task queue' },
  { name: 'Board Meetings', color: '#0ea5e9', description: 'Tasks related to board meeting preparation and follow-up' },
];

orgRouter.get('/org/task-queues', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const rows = await db.execute(
      sql`SELECT * FROM task_queues WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`} ORDER BY name`
    );
    let items = rows.rows as any[];
    if (items.length === 0) {
      for (const q of DEFAULT_TASK_QUEUES) {
        await db.execute(
          sql`INSERT INTO task_queues (tenant_id, name, color, description) VALUES (${tenantId}, ${q.name}, ${q.color}, ${q.description})`
        );
      }
      const seeded = await db.execute(
        sql`SELECT * FROM task_queues WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`} ORDER BY name`
      );
      items = seeded.rows as any[];
    }
    res.json(items);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/task-queues', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description = '', color = '#94a3b8' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const rows = await db.execute(
      sql`INSERT INTO task_queues (tenant_id, name, color, description) VALUES (${tenantId}, ${name.trim()}, ${color}, ${description.trim()}) RETURNING *`
    );
    res.status(201).json((rows.rows as any[])[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/task-queues/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color } = req.body;
    const existing = await db.execute(sql`SELECT * FROM task_queues WHERE id = ${id} LIMIT 1`);
    const row = (existing.rows as any[])[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    const newName  = name        !== undefined ? name.trim()        : row.name;
    const newDesc  = description !== undefined ? description.trim() : row.description;
    const newColor = color       !== undefined ? color              : row.color;
    const updated  = await db.execute(
      sql`UPDATE task_queues SET name = ${newName}, description = ${newDesc}, color = ${newColor} WHERE id = ${id} RETURNING *`
    );
    res.json((updated.rows as any[])[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/task-queues/:id/task-count', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM tasks WHERE queue_id = ${id}`);
    res.json({ count: (result.rows as any[])[0]?.count ?? 0 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/task-queues/:id', async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM task_queues WHERE id = ${parseInt(req.params.id)}`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Activity Modes (configurable) ─────────────────────────────────────────────

const DEFAULT_ACTIVITY_MODES = [
  { name: 'Phone',        color: '#3b82f6', icon: 'phone',          description: 'Phone calls and voice communications' },
  { name: 'Email',        color: '#8b5cf6', icon: 'mail',           description: 'Email communications' },
  { name: 'Social Media', color: '#ec4899', icon: 'share2',         description: 'Social media interactions' },
  { name: 'SMS',          color: '#eab308', icon: 'message-square', description: 'SMS text messages' },
  { name: 'WhatsApp',     color: '#22c55e', icon: 'message-circle', description: 'WhatsApp messages' },
  { name: 'Document',     color: '#f97316', icon: 'file-text',      description: 'Document-based activities' },
  { name: 'Database',     color: '#06b6d4', icon: 'database',       description: 'Database operations' },
  { name: 'BusinessOS',   color: '#6366f1', icon: 'box',            description: 'Internal BusinessOS activities' },
  { name: 'Others',       color: '#94a3b8', icon: 'more-horizontal', description: 'Other activity types' },
];

orgRouter.get('/org/activity-modes', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const rows = await db.execute(
      sql`SELECT * FROM activity_modes WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`} ORDER BY id`
    );
    let items = rows.rows as any[];
    if (items.length === 0) {
      for (const m of DEFAULT_ACTIVITY_MODES) {
        await db.execute(
          sql`INSERT INTO activity_modes (tenant_id, name, color, icon, description) VALUES (${tenantId}, ${m.name}, ${m.color}, ${m.icon}, ${m.description})`
        );
      }
      const seeded = await db.execute(
        sql`SELECT * FROM activity_modes WHERE tenant_id ${tenantId ? sql`= ${tenantId}` : sql`IS NULL`} ORDER BY id`
      );
      items = seeded.rows as any[];
    }
    res.json(items);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/activity-modes', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description = '', color = '#94a3b8', icon = 'activity' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const rows = await db.execute(
      sql`INSERT INTO activity_modes (tenant_id, name, color, icon, description) VALUES (${tenantId}, ${name.trim()}, ${color}, ${icon}, ${description.trim()}) RETURNING *`
    );
    res.status(201).json((rows.rows as any[])[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/activity-modes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color, icon } = req.body;
    const existing = await db.execute(sql`SELECT * FROM activity_modes WHERE id = ${id} LIMIT 1`);
    const row = (existing.rows as any[])[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    const newName  = name        !== undefined ? name.trim()        : row.name;
    const newDesc  = description !== undefined ? description.trim() : row.description;
    const newColor = color       !== undefined ? color              : row.color;
    const newIcon  = icon        !== undefined ? icon               : row.icon;
    const updated  = await db.execute(
      sql`UPDATE activity_modes SET name = ${newName}, description = ${newDesc}, color = ${newColor}, icon = ${newIcon} WHERE id = ${id} RETURNING *`
    );
    res.json((updated.rows as any[])[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/activity-modes/:id', async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM activity_modes WHERE id = ${parseInt(req.params.id)}`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
