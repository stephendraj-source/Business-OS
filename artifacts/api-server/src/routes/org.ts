import { Router } from 'express';
import { db, users, orgRoles, orgRoleMemberships, divisions, departments, projects, userDivisions, userDepartments, userProjects } from '@workspace/db';
import { eq, inArray } from 'drizzle-orm';

export const orgRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeUser(u: typeof users.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

// ── Roles ─────────────────────────────────────────────────────────────────────

orgRouter.get('/org/roles', async (_req, res) => {
  try {
    const rows = await db.select().from(orgRoles).orderBy(orgRoles.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/roles', async (req, res) => {
  try {
    const { name, description = '', color = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(orgRoles).values({ name, description, color }).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/roles/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color } = req.body;
    const updates: Partial<typeof orgRoles.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;
    const [row] = await db.update(orgRoles).set(updates).where(eq(orgRoles.id, id)).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/roles/:id', async (req, res) => {
  try {
    await db.delete(orgRoles).where(eq(orgRoles.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.get('/org/roles/:id/members', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, designation: users.designation })
      .from(orgRoleMemberships)
      .innerJoin(users, eq(orgRoleMemberships.userId, users.id))
      .where(eq(orgRoleMemberships.roleId, id));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/roles/:id/members', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { userIds = [] } = req.body as { userIds?: number[] };
    await db.delete(orgRoleMemberships).where(eq(orgRoleMemberships.roleId, id));
    if (userIds.length > 0) {
      await db.insert(orgRoleMemberships).values(userIds.map(userId => ({ roleId: id, userId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Divisions ─────────────────────────────────────────────────────────────────

orgRouter.get('/org/divisions', async (_req, res) => {
  try {
    const rows = await db.select().from(divisions).orderBy(divisions.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/divisions', async (req, res) => {
  try {
    const { name, description = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(divisions).values({ name, description }).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/divisions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description } = req.body;
    const updates: Partial<typeof divisions.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    const [row] = await db.update(divisions).set(updates).where(eq(divisions.id, id)).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/divisions/:id', async (req, res) => {
  try {
    await db.delete(divisions).where(eq(divisions.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Departments ───────────────────────────────────────────────────────────────

orgRouter.get('/org/departments', async (_req, res) => {
  try {
    const rows = await db.select().from(departments).orderBy(departments.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/departments', async (req, res) => {
  try {
    const { name, description = '', divisionId } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(departments).values({ name, description, divisionId: divisionId ?? null }).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/departments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, divisionId } = req.body;
    const updates: Partial<typeof departments.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (divisionId !== undefined) updates.divisionId = divisionId ?? null;
    const [row] = await db.update(departments).set(updates).where(eq(departments.id, id)).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.delete('/org/departments/:id', async (req, res) => {
  try {
    await db.delete(departments).where(eq(departments.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Projects ──────────────────────────────────────────────────────────────────

orgRouter.get('/org/projects', async (_req, res) => {
  try {
    const rows = await db.select().from(projects).orderBy(projects.name);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.post('/org/projects', async (req, res) => {
  try {
    const { name, description = '', divisionId, departmentId } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await db.insert(projects).values({
      name, description, divisionId: divisionId ?? null, departmentId: departmentId ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.patch('/org/projects/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, divisionId, departmentId } = req.body;
    const updates: Partial<typeof projects.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (divisionId !== undefined) updates.divisionId = divisionId ?? null;
    if (departmentId !== undefined) updates.departmentId = departmentId ?? null;
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

// ── User Org Memberships ──────────────────────────────────────────────────────

orgRouter.get('/org/users/:id/memberships', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [roleMemberships, divMemberships, deptMemberships, projMemberships] = await Promise.all([
      db.select({ id: orgRoles.id, name: orgRoles.name, color: orgRoles.color })
        .from(orgRoleMemberships).innerJoin(orgRoles, eq(orgRoleMemberships.roleId, orgRoles.id))
        .where(eq(orgRoleMemberships.userId, id)),
      db.select({ id: divisions.id, name: divisions.name })
        .from(userDivisions).innerJoin(divisions, eq(userDivisions.divisionId, divisions.id))
        .where(eq(userDivisions.userId, id)),
      db.select({ id: departments.id, name: departments.name })
        .from(userDepartments).innerJoin(departments, eq(userDepartments.departmentId, departments.id))
        .where(eq(userDepartments.userId, id)),
      db.select({ id: projects.id, name: projects.name })
        .from(userProjects).innerJoin(projects, eq(userProjects.projectId, projects.id))
        .where(eq(userProjects.userId, id)),
    ]);
    res.json({ roles: roleMemberships, divisions: divMemberships, departments: deptMemberships, projects: projMemberships });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

orgRouter.put('/org/users/:id/memberships', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { roleIds = [], divisionIds = [], departmentIds = [], projectIds = [] } = req.body as {
      roleIds?: number[]; divisionIds?: number[]; departmentIds?: number[]; projectIds?: number[];
    };

    await Promise.all([
      db.delete(orgRoleMemberships).where(eq(orgRoleMemberships.userId, id)),
      db.delete(userDivisions).where(eq(userDivisions.userId, id)),
      db.delete(userDepartments).where(eq(userDepartments.userId, id)),
      db.delete(userProjects).where(eq(userProjects.userId, id)),
    ]);

    await Promise.all([
      roleIds.length > 0 ? db.insert(orgRoleMemberships).values(roleIds.map(roleId => ({ roleId, userId: id }))) : Promise.resolve(),
      divisionIds.length > 0 ? db.insert(userDivisions).values(divisionIds.map(divisionId => ({ divisionId, userId: id }))) : Promise.resolve(),
      departmentIds.length > 0 ? db.insert(userDepartments).values(departmentIds.map(departmentId => ({ departmentId, userId: id }))) : Promise.resolve(),
      projectIds.length > 0 ? db.insert(userProjects).values(projectIds.map(projectId => ({ projectId, userId: id }))) : Promise.resolve(),
    ]);

    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Full org tree (for org chart view) ───────────────────────────────────────

orgRouter.get('/org/tree', async (_req, res) => {
  try {
    const [allDivisions, allDepartments, allProjects, allRoles] = await Promise.all([
      db.select().from(divisions).orderBy(divisions.name),
      db.select().from(departments).orderBy(departments.name),
      db.select().from(projects).orderBy(projects.name),
      db.select().from(orgRoles).orderBy(orgRoles.name),
    ]);
    res.json({ divisions: allDivisions, departments: allDepartments, projects: allProjects, roles: allRoles });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
