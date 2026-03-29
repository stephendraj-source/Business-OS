import { Router } from 'express';
import { db, users, tenants, groups, userGroups, userRoles, roles, userModuleAccess } from '@workspace/db';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, requireAuth, requireSuperUser, type AuthPayload } from '../middleware/auth.js';

const ALL_MODULES = [
  'table', 'tree', 'portfolio', 'process-map', 'governance',
  'workflows', 'ai-agents', 'connectors', 'dashboards',
  'reports', 'audit-logs', 'settings', 'users',
];

export const authRouter = Router();

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

async function resolveRole(user: typeof users.$inferSelect): Promise<string> {
  if (user.role === 'superuser') return 'superuser';
  const memberships = await db
    .select({ isAdminGroup: groups.isAdminGroup })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupId, groups.id))
    .where(eq(userGroups.userId, user.id));
  if (memberships.some(g => g.isAdminGroup)) return 'admin';
  return user.role;
}

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.isActive) return res.status(401).json({ error: 'Account is inactive' });
    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // If the user must change their password, return a short-lived change-token instead of a real session
    if (user.mustChangePassword) {
      const changeToken = jwt.sign(
        { userId: user.id, mustChangePassword: true },
        JWT_SECRET,
        { expiresIn: '15m' },
      );
      return res.json({ mustChangePassword: true, changeToken });
    }

    const effectiveRole = await resolveRole(user);
    const payload: AuthPayload = {
      userId: user.id,
      tenantId: user.tenantId ?? null,
      role: effectiveRole,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: safeUser(user) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Force-password-change endpoint ────────────────────────────────────────────
authRouter.post('/set-password', async (req, res) => {
  try {
    const { changeToken, newPassword } = req.body;
    if (!changeToken || !newPassword) return res.status(400).json({ error: 'changeToken and newPassword required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    let payload: any;
    try {
      payload = jwt.verify(changeToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
    }
    if (!payload.mustChangePassword) return res.status(400).json({ error: 'Invalid token type' });

    const [user] = await db
      .update(users)
      .set({ passwordHash: hashPassword(newPassword), mustChangePassword: false })
      .where(eq(users.id, payload.userId))
      .returning();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const effectiveRole = await resolveRole(user);
    const sessionPayload: AuthPayload = {
      userId: user.id,
      tenantId: user.tenantId ?? null,
      role: effectiveRole,
    };
    const token = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: safeUser(user) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    const orgRoleRows = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));
    const orgRoles = orgRoleRows.map(r => r.roleName);
    res.json({ ...safeUser(user), orgRoles });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
    if (!user) return res.status(404).json({ error: 'No account found with that email address' });
    if (!user.isActive) return res.status(403).json({ error: 'Account is inactive. Contact your administrator.' });

    // Generate a readable temp password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const tempPassword = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    await db.update(users).set({ passwordHash: hashPassword(tempPassword) }).where(eq(users.id, user.id));
    res.json({ tempPassword, name: user.firstName || user.name });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!verifyPassword(currentPassword, user.passwordHash)) return res.status(401).json({ error: 'Current password is incorrect' });
    await db.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, user.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Public registration ────────────────────────────────────────────────────────

authRouter.post('/register', async (req, res) => {
  try {
    const { firstName = '', lastName = '', email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const cleanEmail = email.trim().toLowerCase();
    const name = [firstName, lastName].filter(Boolean).join(' ') || cleanEmail;

    // Assign admin role to known admin email, otherwise regular user
    const isAdminEmail = cleanEmail === 'stephen_raj@yahoo.com';
    const role = isAdminEmail ? 'admin' : 'user';
    const tenantId = 2; // Default tenant

    const [row] = await db.insert(users).values({
      tenantId,
      name,
      firstName: firstName || '',
      lastName: lastName || '',
      preferredName: '',
      email: cleanEmail,
      passwordHash: hashPassword(password),
      role,
      designation: '',
      dataScope: isAdminEmail ? 'all' : 'categories',
      isActive: true,
      mustChangePassword: false,
    }).returning();

    await db.insert(userModuleAccess).values(
      ALL_MODULES.map(module => ({ userId: row.id, module, hasAccess: isAdminEmail }))
    );

    const effectiveRole = await resolveRole(row);
    const payload: AuthPayload = {
      userId: row.id,
      tenantId: row.tenantId ?? null,
      role: effectiveRole,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user: safeUser(row) });
  } catch (e: any) {
    const msg = (e.message || '') + (e.cause?.message || '') + (e.detail || '');
    if (msg.includes('unique') || msg.includes('duplicate') || e.code === '23505') {
      return res.status(409).json({ error: 'An account with that email address already exists.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── Token-based password reset (from admin-sent link) ─────────────────────────

authRouter.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'This reset link has expired or is invalid. Please request a new one.' });
    }
    if (payload.type !== 'password-reset') return res.status(400).json({ error: 'Invalid token type' });

    const [user] = await db
      .update(users)
      .set({ passwordHash: hashPassword(newPassword), mustChangePassword: false })
      .where(eq(users.id, payload.userId))
      .returning();
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ ok: true, message: 'Password updated successfully. You can now sign in.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Tenant Management (superuser only) ─────────────────────────────────────────

authRouter.get('/tenants', requireAuth, requireSuperUser, async (_req, res) => {
  try {
    const all = await db.select().from(tenants).orderBy(tenants.createdAt);
    res.json(all);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.post('/tenants', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const { name, slug, firstName, lastName, preferredName, adminEmail, adminPhone } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });
    const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const [tenant] = await db.insert(tenants).values({
      name, slug: clean,
      firstName: firstName || null,
      lastName: lastName || null,
      preferredName: preferredName || null,
    }).returning();

    // Optionally create the first admin user for this tenant
    let adminResult: { user: ReturnType<typeof safeUser>; tempPassword: string } | undefined;
    if (adminEmail) {
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || adminEmail;
      const tempPassword = crypto.randomBytes(8).toString('hex');
      const [adminUser] = await db.insert(users).values({
        tenantId: tenant.id,
        name: fullName,
        firstName: firstName || '',
        lastName: lastName || '',
        preferredName: preferredName || '',
        email: adminEmail.trim().toLowerCase(),
        phone: adminPhone || '',
        passwordHash: hashPassword(tempPassword),
        role: 'admin',
        designation: '',
        dataScope: 'all',
        isActive: true,
        mustChangePassword: true,
      }).returning();
      adminResult = { user: safeUser(adminUser), tempPassword };
    }

    res.status(201).json({ ...tenant, admin: adminResult });
  } catch (e: any) {
    if (e.message?.includes('unique') && e.message?.includes('email')) return res.status(409).json({ error: 'An account with that email address already exists.' });
    if (e.message?.includes('unique')) return res.status(409).json({ error: 'A tenant with that slug already exists.' });
    res.status(500).json({ error: e.message });
  }
});

authRouter.patch('/tenants/:id', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.id);
    const { name, firstName, lastName, preferredName } = req.body;
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (firstName !== undefined) updates.firstName = firstName || null;
    if (lastName !== undefined) updates.lastName = lastName || null;
    if (preferredName !== undefined) updates.preferredName = preferredName || null;
    const [row] = await db.update(tenants).set(updates).where(eq(tenants.id, tenantId)).returning();
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.post('/tenants/:id/admin', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.id);
    const { name, firstName = '', lastName = '', email } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'name and email required' });

    const tempPassword = crypto.randomBytes(8).toString('hex');
    const [row] = await db.insert(users).values({
      tenantId,
      name,
      firstName,
      lastName,
      preferredName: '',
      email: email.trim().toLowerCase(),
      passwordHash: hashPassword(tempPassword),
      role: 'admin',
      designation: '',
      dataScope: 'all',
      isActive: true,
      mustChangePassword: true,
    }).returning();

    res.status(201).json({
      user: safeUser(row),
      tempPassword,
    });
  } catch (e: any) {
    if (e.message?.includes('unique')) return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

authRouter.get('/tenants/:id/users', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.id);
    const rows = await db.select().from(users).where(eq(users.tenantId, tenantId));
    res.json(rows.map(safeUser));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.delete('/tenants/:id', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.id);
    const [row] = await db.delete(tenants).where(eq(tenants.id, tenantId)).returning();
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ ok: true, id: tenantId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.patch('/tenants/:id/blueprint', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.id);
    const { industryBlueprint } = req.body;
    const [row] = await db.update(tenants)
      .set({ industryBlueprint: industryBlueprint ?? null })
      .where(eq(tenants.id, tenantId))
      .returning();
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.patch('/tenants/:id/credits', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.id);
    const { credits } = req.body;
    if (credits === undefined || isNaN(Number(credits))) return res.status(400).json({ error: 'credits required' });
    const [row] = await db.update(tenants)
      .set({ credits: Number(credits) })
      .where(eq(tenants.id, tenantId))
      .returning();
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Superuser Management ────────────────────────────────────────────────────────

authRouter.get('/superusers', requireAuth, requireSuperUser, async (_req, res) => {
  try {
    const rows = await db.select().from(users).where(eq(users.role, 'superuser')).orderBy(users.createdAt);
    res.json(rows.map(safeUser));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.post('/superusers', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'name and email required' });
    const tempPassword = Array.from({ length: 12 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 57)]).join('');
    const [row] = await db.insert(users).values({
      tenantId: null,
      name,
      firstName: name.split(' ')[0] ?? '',
      lastName: name.split(' ').slice(1).join(' ') ?? '',
      preferredName: '',
      email: email.trim().toLowerCase(),
      passwordHash: hashPassword(tempPassword),
      role: 'superuser',
      designation: '',
      dataScope: 'all',
      isActive: true,
    }).returning();
    res.status(201).json({ user: safeUser(row), tempPassword });
  } catch (e: any) {
    if (e.message?.includes('unique')) return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

// ── User colour scheme preference ──────────────────────────────────────────────

authRouter.get('/color-scheme', requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const tenantId = req.auth!.tenantId ?? null;
    const [userRow] = await db.select({ colorScheme: users.colorScheme }).from(users).where(eq(users.id, userId));
    let orgScheme: string | null = null;
    if (tenantId) {
      const [t] = await db.select({ colorScheme: tenants.colorScheme }).from(tenants).where(eq(tenants.id, tenantId));
      orgScheme = t?.colorScheme ?? null;
    }
    res.json({ personal: userRow?.colorScheme ?? null, org: orgScheme });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

authRouter.put('/color-scheme', requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const { colorScheme } = req.body;
    await db.update(users).set({ colorScheme: colorScheme ?? null }).where(eq(users.id, userId));
    res.json({ ok: true, colorScheme: colorScheme ?? null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

authRouter.delete('/superusers/:id', requireAuth, requireSuperUser, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (targetId === req.auth!.userId) return res.status(400).json({ error: 'You cannot delete your own account' });
    const [row] = await db.delete(users).where(eq(users.id, targetId)).returning();
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, id: targetId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
