import { Router } from 'express';
import { db, users, userModuleAccess, userAllowedCategories, userAllowedProcesses, userFieldPermissions } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export const usersRouter = Router();

const ALL_MODULES = [
  'table', 'tree', 'portfolio', 'process-map', 'governance',
  'workflows', 'ai-agents', 'connectors', 'dashboards',
  'reports', 'audit-logs', 'settings', 'users',
];

function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain: string, stored: string): boolean {
  try {
    if (stored.includes(':')) {
      const [salt, hash] = stored.split(':');
      const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
    }
    // Legacy SHA-256 fallback
    const legacy = crypto.createHash('sha256').update(plain + 'npos-salt-2024').digest('hex');
    return crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored));
  } catch {
    return false;
  }
}

function safeUser(u: typeof users.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

usersRouter.get('/', async (req, res) => {
  try {
    const auth = (req as any).auth;
    let rows;
    if (auth?.role === 'superuser') {
      rows = await db.select().from(users).orderBy(users.createdAt);
    } else if (auth?.tenantId) {
      rows = await db.select().from(users).where(eq(users.tenantId, auth.tenantId)).orderBy(users.createdAt);
    } else {
      rows = await db.select().from(users).orderBy(users.createdAt);
    }
    res.json(rows.map(safeUser));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

usersRouter.post('/', async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId = auth?.tenantId ?? null;
    const { name, firstName = '', lastName = '', preferredName = '', email, role = 'user', designation = '', phone = '', isActive = true, dataScope = 'categories' } = req.body;
    const resolvedName = name || [firstName, lastName].filter(Boolean).join(' ');
    if (!resolvedName || !email) return res.status(400).json({ error: 'name (or first/last name) and email are required' });
    const tempPassword = crypto.randomUUID();
    const [row] = await db.insert(users).values({
      tenantId, name: resolvedName, firstName, lastName, preferredName, email, passwordHash: hashPassword(tempPassword), role, designation, phone, isActive, dataScope,
    }).returning();
    await db.insert(userModuleAccess).values(
      ALL_MODULES.map(module => ({ userId: row.id, module, hasAccess: false }))
    );
    const token = crypto.randomUUID().replace(/-/g, '');
    const resetLink = `/reset-password?token=${token}&uid=${row.id}`;
    res.status(201).json({ ...safeUser(row), resetLink, resetToken: token });
  } catch (e: any) {
    if (e.message?.includes('unique')) return res.status(409).json({ error: 'An account with that email address already exists.' });
    res.status(500).json({ error: e.message });
  }
});

usersRouter.post('/:id/send-password-reset', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email })
      .from(users).where(eq(users.id, id));
    if (!user) return res.status(404).json({ error: 'Not found' });
    const token = crypto.randomUUID().replace(/-/g, '');
    const resetLink = `/reset-password?token=${token}&uid=${id}`;
    res.json({
      ok: true,
      resetLink,
      resetToken: token,
      email: user.email,
      name: user.name,
      message: `Password reset link generated for ${user.name} (${user.email}). In a production deployment this would be emailed automatically. Please share this link with the user manually.`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

usersRouter.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.select().from(users).where(eq(users.id, id));
    if (!row) return res.status(404).json({ error: 'Not found' });
    const modules = await db.select().from(userModuleAccess).where(eq(userModuleAccess.userId, id));
    const categories = await db.select().from(userAllowedCategories).where(eq(userAllowedCategories.userId, id));
    const processes = await db.select().from(userAllowedProcesses).where(eq(userAllowedProcesses.userId, id));
    const fields = await db.select().from(userFieldPermissions).where(eq(userFieldPermissions.userId, id));
    res.json({ ...safeUser(row), modules, categories, processes, fields });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

usersRouter.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, firstName, lastName, preferredName, email, password, role, designation, phone, isActive, dataScope } = req.body;
    const updates: Partial<typeof users.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (preferredName !== undefined) updates.preferredName = preferredName;
    if (email !== undefined) updates.email = email;
    if (password) updates.passwordHash = hashPassword(password);
    if (role !== undefined) updates.role = role;
    if (designation !== undefined) updates.designation = designation;
    if (phone !== undefined) updates.phone = phone;
    if (isActive !== undefined) updates.isActive = isActive;
    if (dataScope !== undefined) updates.dataScope = dataScope;
    const [row] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(safeUser(row));
  } catch (e: any) {
    if (e.message?.includes('unique')) return res.status(409).json({ error: 'An account with that email address already exists.' });
    res.status(500).json({ error: e.message });
  }
});

usersRouter.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(users).where(eq(users.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

usersRouter.put('/:id/modules', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { modules } = req.body as { modules: { module: string; hasAccess: boolean }[] };
    await db.delete(userModuleAccess).where(eq(userModuleAccess.userId, id));
    if (modules?.length) {
      await db.insert(userModuleAccess).values(modules.map(m => ({ userId: id, module: m.module, hasAccess: m.hasAccess })));
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

usersRouter.put('/:id/categories', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { categories } = req.body as { categories: string[] };
    await db.delete(userAllowedCategories).where(eq(userAllowedCategories.userId, id));
    if (categories?.length) {
      await db.insert(userAllowedCategories).values(categories.map(c => ({ userId: id, category: c })));
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

usersRouter.put('/:id/processes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { processes } = req.body as { processes: { processId: number; canEdit: boolean }[] };
    await db.delete(userAllowedProcesses).where(eq(userAllowedProcesses.userId, id));
    if (processes?.length) {
      await db.insert(userAllowedProcesses).values(processes.map(p => ({ userId: id, processId: p.processId, canEdit: p.canEdit })));
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

usersRouter.put('/:id/field-permissions', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { permissions } = req.body as { permissions: { catalogueType: string; fieldKey: string; canView: boolean; canEdit: boolean }[] };
    await db.delete(userFieldPermissions).where(eq(userFieldPermissions.userId, id));
    if (permissions?.length) {
      await db.insert(userFieldPermissions).values(permissions.map(p => ({
        userId: id, catalogueType: p.catalogueType, fieldKey: p.fieldKey, canView: p.canView, canEdit: p.canEdit,
      })));
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
