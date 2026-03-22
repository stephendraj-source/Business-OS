import { Router } from 'express';
import { db, initiatives, initiativeUrls, initiativeAssignees, initiativeProcesses, users, processesTable } from '@workspace/db';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

export const initiativesRouter = Router();

// ── Tenant filter helper ───────────────────────────────────────────────────────

function tenantId(req: any): number | null {
  const auth = req.auth;
  if (!auth) return null;
  if (auth.role === 'superuser') return null;
  return auth.tenantId ?? null;
}

// ── Auto-generate initiative ID ───────────────────────────────────────────────

async function nextInitiativeId(tid: number | null): Promise<string> {
  const cond = tid !== null ? eq(initiatives.tenantId, tid) : undefined;
  const rows = await db.select({ id: initiatives.initiativeId }).from(initiatives).where(cond).orderBy(desc(initiatives.id)).limit(1);
  if (rows.length === 0) return 'INI-001';
  const last = rows[0].id;
  const num = parseInt(last.replace('INI-', ''), 10);
  return `INI-${String(num + 1).padStart(3, '0')}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getInitiativeDetail(id: number, tid: number | null) {
  const cond = tid !== null
    ? and(eq(initiatives.id, id), eq(initiatives.tenantId, tid))
    : eq(initiatives.id, id);
  const [ini] = await db.select().from(initiatives).where(cond);
  if (!ini) return null;
  const [urls, assignees, procs] = await Promise.all([
    db.select().from(initiativeUrls).where(eq(initiativeUrls.initiativeId, id)),
    db.select({ id: users.id, name: users.name, email: users.email, designation: users.designation })
      .from(initiativeAssignees)
      .innerJoin(users, eq(initiativeAssignees.userId, users.id))
      .where(eq(initiativeAssignees.initiativeId, id)),
    db.select({ id: processesTable.id, processName: processesTable.processName, processDescription: processesTable.processDescription, category: processesTable.category, number: processesTable.number })
      .from(initiativeProcesses)
      .innerJoin(processesTable, eq(initiativeProcesses.processId, processesTable.id))
      .where(eq(initiativeProcesses.initiativeId, id)),
  ]);
  return { ...ini, urls, assignees, processes: procs };
}

// ── List ──────────────────────────────────────────────────────────────────────

initiativesRouter.get('/initiatives', requireAuth, async (req, res) => {
  try {
    const tid = tenantId(req);
    const cond = tid !== null ? eq(initiatives.tenantId, tid) : undefined;
    const rows = await db.select().from(initiatives).where(cond).orderBy(desc(initiatives.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Create ────────────────────────────────────────────────────────────────────

initiativesRouter.post('/initiatives', requireAuth, async (req, res) => {
  try {
    const tid = tenantId(req);
    const { name, goals = '', achievement = '', startDate, endDate } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const initiativeId = await nextInitiativeId(tid);
    const [row] = await db.insert(initiatives).values({
      tenantId: tid,
      initiativeId, name, goals, achievement,
      startDate: startDate || null,
      endDate: endDate || null,
    }).returning();
    const detail = await getInitiativeDetail(row.id, tid);
    res.status(201).json(detail);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Get one ───────────────────────────────────────────────────────────────────

initiativesRouter.get('/initiatives/:id', requireAuth, async (req, res) => {
  try {
    const tid = tenantId(req);
    const detail = await getInitiativeDetail(parseInt(req.params.id), tid);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json(detail);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Update ────────────────────────────────────────────────────────────────────

initiativesRouter.patch('/initiatives/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tid = tenantId(req);
    const { name, goals, achievement, startDate, endDate } = req.body;
    const updates: Partial<typeof initiatives.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (goals !== undefined) updates.goals = goals;
    if (achievement !== undefined) updates.achievement = achievement;
    if (startDate !== undefined) updates.startDate = startDate || null;
    if (endDate !== undefined) updates.endDate = endDate || null;
    const cond = tid !== null
      ? and(eq(initiatives.id, id), eq(initiatives.tenantId, tid))
      : eq(initiatives.id, id);
    await db.update(initiatives).set(updates).where(cond);
    const detail = await getInitiativeDetail(id, tid);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json(detail);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Delete ────────────────────────────────────────────────────────────────────

initiativesRouter.delete('/initiatives/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tid = tenantId(req);
    const cond = tid !== null
      ? and(eq(initiatives.id, id), eq(initiatives.tenantId, tid))
      : eq(initiatives.id, id);
    await db.delete(initiatives).where(cond);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── URLs ──────────────────────────────────────────────────────────────────────

initiativesRouter.put('/initiatives/:id/urls', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tid = tenantId(req);
    const detail = await getInitiativeDetail(id, tid);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    const { urls = [] } = req.body as { urls?: { label: string; url: string }[] };
    await db.delete(initiativeUrls).where(eq(initiativeUrls.initiativeId, id));
    if (urls.length > 0) {
      await db.insert(initiativeUrls).values(urls.map(u => ({ initiativeId: id, label: u.label, url: u.url })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Assignees ─────────────────────────────────────────────────────────────────

initiativesRouter.put('/initiatives/:id/assignees', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tid = tenantId(req);
    const detail = await getInitiativeDetail(id, tid);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    const { userIds = [] } = req.body as { userIds?: number[] };
    await db.delete(initiativeAssignees).where(eq(initiativeAssignees.initiativeId, id));
    if (userIds.length > 0) {
      await db.insert(initiativeAssignees).values(userIds.map(userId => ({ initiativeId: id, userId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Processes ─────────────────────────────────────────────────────────────────

initiativesRouter.put('/initiatives/:id/processes', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tid = tenantId(req);
    const detail = await getInitiativeDetail(id, tid);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    const { processIds = [] } = req.body as { processIds?: number[] };
    await db.delete(initiativeProcesses).where(eq(initiativeProcesses.initiativeId, id));
    if (processIds.length > 0) {
      await db.insert(initiativeProcesses).values(processIds.map(processId => ({ initiativeId: id, processId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
