import { Router } from 'express';
import { db, initiatives, initiativeUrls, initiativeAssignees, initiativeProcesses, users, processesTable } from '@workspace/db';
import { eq, desc, sql } from 'drizzle-orm';

export const initiativesRouter = Router();

// ── Auto-generate initiative ID ───────────────────────────────────────────────

async function nextInitiativeId(): Promise<string> {
  const rows = await db.select({ id: initiatives.initiativeId }).from(initiatives).orderBy(desc(initiatives.id)).limit(1);
  if (rows.length === 0) return 'INI-001';
  const last = rows[0].id;
  const num = parseInt(last.replace('INI-', ''), 10);
  return `INI-${String(num + 1).padStart(3, '0')}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getInitiativeDetail(id: number) {
  const [ini] = await db.select().from(initiatives).where(eq(initiatives.id, id));
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

initiativesRouter.get('/initiatives', async (_req, res) => {
  try {
    const rows = await db.select().from(initiatives).orderBy(desc(initiatives.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Create ────────────────────────────────────────────────────────────────────

initiativesRouter.post('/initiatives', async (req, res) => {
  try {
    const { name, goals = '', achievement = '', startDate, endDate } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const initiativeId = await nextInitiativeId();
    const [row] = await db.insert(initiatives).values({
      initiativeId, name, goals, achievement,
      startDate: startDate || null,
      endDate: endDate || null,
    }).returning();
    const detail = await getInitiativeDetail(row.id);
    res.status(201).json(detail);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Get one ───────────────────────────────────────────────────────────────────

initiativesRouter.get('/initiatives/:id', async (req, res) => {
  try {
    const detail = await getInitiativeDetail(parseInt(req.params.id));
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json(detail);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Update ────────────────────────────────────────────────────────────────────

initiativesRouter.patch('/initiatives/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, goals, achievement, startDate, endDate } = req.body;
    const updates: Partial<typeof initiatives.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (goals !== undefined) updates.goals = goals;
    if (achievement !== undefined) updates.achievement = achievement;
    if (startDate !== undefined) updates.startDate = startDate || null;
    if (endDate !== undefined) updates.endDate = endDate || null;
    await db.update(initiatives).set(updates).where(eq(initiatives.id, id));
    const detail = await getInitiativeDetail(id);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json(detail);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Delete ────────────────────────────────────────────────────────────────────

initiativesRouter.delete('/initiatives/:id', async (req, res) => {
  try {
    await db.delete(initiatives).where(eq(initiatives.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── URLs ──────────────────────────────────────────────────────────────────────

initiativesRouter.put('/initiatives/:id/urls', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { urls = [] } = req.body as { urls?: { label: string; url: string }[] };
    await db.delete(initiativeUrls).where(eq(initiativeUrls.initiativeId, id));
    if (urls.length > 0) {
      await db.insert(initiativeUrls).values(urls.map(u => ({ initiativeId: id, label: u.label, url: u.url })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Assignees ─────────────────────────────────────────────────────────────────

initiativesRouter.put('/initiatives/:id/assignees', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { userIds = [] } = req.body as { userIds?: number[] };
    await db.delete(initiativeAssignees).where(eq(initiativeAssignees.initiativeId, id));
    if (userIds.length > 0) {
      await db.insert(initiativeAssignees).values(userIds.map(userId => ({ initiativeId: id, userId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Processes ─────────────────────────────────────────────────────────────────

initiativesRouter.put('/initiatives/:id/processes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { processIds = [] } = req.body as { processIds?: number[] };
    await db.delete(initiativeProcesses).where(eq(initiativeProcesses.initiativeId, id));
    if (processIds.length > 0) {
      await db.insert(initiativeProcesses).values(processIds.map(processId => ({ initiativeId: id, processId })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
