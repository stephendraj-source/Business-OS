import { Router } from 'express';
import { db, users, tenants } from '@workspace/db';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, requireAuth, requireSuperUser, type AuthPayload } from '../middleware/auth.js';

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

    const payload: AuthPayload = {
      userId: user.id,
      tenantId: user.tenantId ?? null,
      role: user.role,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: safeUser(user) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(safeUser(user));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
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
    const { name, slug, firstName, lastName, preferredName } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });
    const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const [row] = await db.insert(tenants).values({
      name, slug: clean,
      firstName: firstName || null,
      lastName: lastName || null,
      preferredName: preferredName || null,
    }).returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e.message?.includes('unique')) return res.status(409).json({ error: 'Slug already exists' });
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
