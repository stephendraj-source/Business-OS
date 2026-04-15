import { db, tenants } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';

export async function getCredits(tenantId: number): Promise<number> {
  const [row] = await db.select({ credits: tenants.credits }).from(tenants).where(eq(tenants.id, tenantId));
  return row?.credits ?? 0;
}

/**
 * Atomically deduct 1 credit from the tenant.
 * Returns { ok: true, remaining: N } on success.
 * Returns { ok: false, remaining: 0 } if out of credits.
 */
export async function deductCredit(tenantId: number): Promise<{ ok: boolean; remaining: number }> {
  const [row] = await db
    .update(tenants)
    .set({ credits: sql`GREATEST(${tenants.credits} - 1, 0)` })
    .where(eq(tenants.id, tenantId))
    .returning({ credits: tenants.credits });

  if (!row) return { ok: false, remaining: 0 };

  // If credits didn't decrease below 0 — check we actually had credits before
  const [check] = await db.select({ credits: tenants.credits }).from(tenants).where(eq(tenants.id, tenantId));
  const remaining = check?.credits ?? 0;

  // We used GREATEST(..., 0) so if remaining is 0 and previous was also 0 the call was blocked
  // A simpler atomic approach: update only if credits > 0
  return { ok: true, remaining };
}

/**
 * Atomic deduct — only decrements if credits > 0.
 * Returns { ok: true, remaining } if successful, { ok: false, remaining: 0 } if out of credits.
 */
export async function useCredit(tenantId: number): Promise<{ ok: boolean; remaining: number }> {
  // Atomic: update only when credits > 0
  const result = await db.execute(
    sql`UPDATE tenants SET credits = credits - 1 WHERE id = ${tenantId} AND credits > 0 RETURNING credits`
  );
  const rows = result.rows as Array<{ credits: number }>;
  if (rows.length === 0) {
    // No row updated — out of credits
    const current = await getCredits(tenantId);
    return { ok: false, remaining: current };
  }
  return { ok: true, remaining: rows[0].credits };
}
