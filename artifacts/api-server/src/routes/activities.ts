import { Router, type IRouter } from "express";
import { db, activitiesTable, processActivitiesTable, processesTable } from "@workspace/db";
import { eq, max, and, inArray } from "drizzle-orm";

const router: IRouter = Router();

// ── List all activities for tenant ──────────────────────────────────────────
router.get("/activities", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const query = db.select().from(activitiesTable);
    const rows = auth?.tenantId
      ? await query.where(eq(activitiesTable.tenantId, auth.tenantId)).orderBy(activitiesTable.activityNumber)
      : await query.orderBy(activitiesTable.activityNumber);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get single activity ──────────────────────────────────────────────────────
router.get("/activities/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(activitiesTable.id, id), eq(activitiesTable.tenantId, auth.tenantId))
      : eq(activitiesTable.id, id);
    const [row] = await db.select().from(activitiesTable).where(cond);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create activity ──────────────────────────────────────────────────────────
router.post("/activities", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const tenantCond = tenantId ? eq(activitiesTable.tenantId, tenantId) : undefined;
    const baseQuery = db.select({ val: max(activitiesTable.activityNumber) }).from(activitiesTable);
    const [maxNum] = tenantCond ? await baseQuery.where(tenantCond) : await baseQuery;
    const nextNum = (maxNum?.val ?? 0) + 1;
    const { name = "New Activity", mode = "others", description = "" } = req.body as Record<string, string>;
    const [row] = await db
      .insert(activitiesTable)
      .values({ activityNumber: nextNum, name, mode, description, tenantId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update activity ──────────────────────────────────────────────────────────
router.patch("/activities/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const { name, mode, description } = req.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (mode !== undefined) updates.mode = mode;
    if (description !== undefined) updates.description = description;
    const cond = auth?.tenantId
      ? and(eq(activitiesTable.id, id), eq(activitiesTable.tenantId, auth.tenantId))
      : eq(activitiesTable.id, id);
    const [row] = await db.update(activitiesTable).set(updates).where(cond).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete activity ──────────────────────────────────────────────────────────
router.delete("/activities/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(activitiesTable.id, id), eq(activitiesTable.tenantId, auth.tenantId))
      : eq(activitiesTable.id, id);
    await db.delete(activitiesTable).where(cond);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get activities linked to a process ──────────────────────────────────────
router.get("/processes/:processId/activities", async (req, res) => {
  try {
    const processId = Number(req.params.processId);
    const links = await db
      .select({ activityId: processActivitiesTable.activityId })
      .from(processActivitiesTable)
      .where(eq(processActivitiesTable.processId, processId));
    if (links.length === 0) return res.json([]);
    const ids = links.map(l => l.activityId);
    const activities = await db
      .select()
      .from(activitiesTable)
      .where(inArray(activitiesTable.id, ids))
      .orderBy(activitiesTable.activityNumber);
    res.json(activities);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Link an activity to a process ────────────────────────────────────────────
router.post("/processes/:processId/activities", async (req, res) => {
  try {
    const processId = Number(req.params.processId);
    const { activityId } = req.body as { activityId: number };
    if (!activityId) return res.status(400).json({ error: "activityId required" });
    const existing = await db
      .select()
      .from(processActivitiesTable)
      .where(
        and(
          eq(processActivitiesTable.processId, processId),
          eq(processActivitiesTable.activityId, activityId),
        ),
      );
    if (existing.length > 0) return res.status(200).json(existing[0]);
    const [link] = await db
      .insert(processActivitiesTable)
      .values({ processId, activityId })
      .returning();
    res.status(201).json(link);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Unlink an activity from a process ────────────────────────────────────────
router.delete("/processes/:processId/activities/:activityId", async (req, res) => {
  try {
    const processId = Number(req.params.processId);
    const activityId = Number(req.params.activityId);
    await db
      .delete(processActivitiesTable)
      .where(
        and(
          eq(processActivitiesTable.processId, processId),
          eq(processActivitiesTable.activityId, activityId),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get all processes linked to an activity ──────────────────────────────────
router.get("/activities/:id/processes", async (req, res) => {
  try {
    const activityId = Number(req.params.id);
    const links = await db
      .select({ processId: processActivitiesTable.processId })
      .from(processActivitiesTable)
      .where(eq(processActivitiesTable.activityId, activityId));
    if (links.length === 0) return res.json([]);
    const ids = links.map(l => l.processId);
    const processes = await db
      .select()
      .from(processesTable)
      .where(inArray(processesTable.id, ids))
      .orderBy(processesTable.number);
    res.json(processes);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
