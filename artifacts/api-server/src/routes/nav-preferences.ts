import { Router } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

const router = Router();

// GET /nav-preferences
// Returns the effective nav order for the requesting user:
//   admin/superuser → tenant-level preference (user_id IS NULL)
//   regular user    → user-specific first, then tenant-level fallback
router.get('/', async (req, res) => {
  const auth = (req as any).auth;
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const userId: number = auth.userId;
  const tenantId: number | null = auth.tenantId ?? null;
  const role: string = auth.role ?? 'user';
  const isAdmin = role === 'admin' || role === 'superuser';

  try {
    if (isAdmin) {
      const result = await db.execute(
        sql`SELECT sections, items FROM nav_preferences
            WHERE tenant_id ${tenantId != null ? sql`= ${tenantId}` : sql`IS NULL`}
              AND user_id IS NULL
            LIMIT 1`
      );
      if ((result.rows as any[]).length === 0) return res.json({ sections: null, items: null, scope: 'tenant' });
      const row = (result.rows as any[])[0];
      return res.json({ sections: row.sections, items: row.items, scope: 'tenant' });
    }

    // Regular user: check for personal preference first
    const userResult = await db.execute(
      sql`SELECT sections, items FROM nav_preferences
          WHERE tenant_id ${tenantId != null ? sql`= ${tenantId}` : sql`IS NULL`}
            AND user_id = ${userId}
          LIMIT 1`
    );
    if ((userResult.rows as any[]).length > 0) {
      const row = (userResult.rows as any[])[0];
      return res.json({ sections: row.sections, items: row.items, scope: 'user' });
    }

    // Fallback: tenant-level default
    const tenantResult = await db.execute(
      sql`SELECT sections, items FROM nav_preferences
          WHERE tenant_id ${tenantId != null ? sql`= ${tenantId}` : sql`IS NULL`}
            AND user_id IS NULL
          LIMIT 1`
    );
    if ((tenantResult.rows as any[]).length > 0) {
      const row = (tenantResult.rows as any[])[0];
      return res.json({ sections: row.sections, items: row.items, scope: 'tenant-default' });
    }

    return res.json({ sections: null, items: null, scope: 'none' });
  } catch (err) {
    console.error('[nav-preferences GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /nav-preferences
// admin/superuser → saves as tenant-level default (affects all users without personal overrides)
// regular user    → saves as user-specific override only
router.put('/', async (req, res) => {
  const auth = (req as any).auth;
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const userId: number = auth.userId;
  const tenantId: number | null = auth.tenantId ?? null;
  const role: string = auth.role ?? 'user';
  const isAdmin = role === 'admin' || role === 'superuser';

  const { sections, items } = req.body;
  if (!sections || !items) return res.status(400).json({ error: 'sections and items required' });

  try {
    if (isAdmin) {
      // Upsert tenant-level (user_id IS NULL) using partial index conflict target
      await db.execute(
        sql`INSERT INTO nav_preferences (tenant_id, user_id, sections, items, updated_at)
            VALUES (${tenantId}, NULL, ${String(sections)}, ${String(items)}, now())
            ON CONFLICT (tenant_id) WHERE user_id IS NULL DO UPDATE
              SET sections = EXCLUDED.sections, items = EXCLUDED.items, updated_at = now()`
      );
      return res.json({ scope: 'tenant' });
    }

    // Upsert user-level using partial index conflict target
    await db.execute(
      sql`INSERT INTO nav_preferences (tenant_id, user_id, sections, items, updated_at)
          VALUES (${tenantId}, ${userId}, ${String(sections)}, ${String(items)}, now())
          ON CONFLICT (tenant_id, user_id) WHERE user_id IS NOT NULL DO UPDATE
            SET sections = EXCLUDED.sections, items = EXCLUDED.items, updated_at = now()`
    );
    return res.json({ scope: 'user' });
  } catch (err) {
    console.error('[nav-preferences PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
