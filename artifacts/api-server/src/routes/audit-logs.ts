import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

function tenantWhere(auth: any) {
  if (!auth) return null;
  if (auth.role === 'superuser') return null;
  return auth.tenantId ?? null;
}

router.get("/audit-logs", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10), 500);
    const auth = req.auth!;
    const tid = tenantWhere(auth);

    let logs;
    if (auth.role === 'superuser') {
      logs = await db
        .select()
        .from(auditLogsTable)
        .orderBy(desc(auditLogsTable.timestamp))
        .limit(limit);
    } else if (auth.role === 'admin') {
      const cond = tid !== null ? eq(auditLogsTable.tenantId, tid) : undefined;
      logs = await db
        .select()
        .from(auditLogsTable)
        .where(cond)
        .orderBy(desc(auditLogsTable.timestamp))
        .limit(limit);
    } else {
      const conditions = [eq(auditLogsTable.userId, auth.userId)];
      if (tid !== null) conditions.push(eq(auditLogsTable.tenantId, tid));
      logs = await db
        .select()
        .from(auditLogsTable)
        .where(and(...conditions))
        .orderBy(desc(auditLogsTable.timestamp))
        .limit(limit);
    }

    res.json(logs);
  } catch (err) {
    req.log.error(err, "Failed to list audit logs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/audit-logs", requireAuth, async (req, res) => {
  try {
    const auth = req.auth!;
    const tenantId = auth.role === 'superuser' ? null : (auth.tenantId ?? null);
    const body = req.body as {
      action: string;
      entityType: string;
      entityId?: string;
      entityName?: string;
      fieldChanged?: string;
      oldValue?: string;
      newValue?: string;
      user?: string;
      description?: string;
    };
    const [log] = await db.insert(auditLogsTable).values({
      tenantId,
      action: body.action,
      entityType: body.entityType,
      entityId: body.entityId,
      entityName: body.entityName,
      fieldChanged: body.fieldChanged,
      oldValue: body.oldValue,
      newValue: body.newValue,
      user: body.user ?? "System",
      description: body.description,
      userId: auth.userId ?? null,
    }).returning();
    res.status(201).json(log);
  } catch (err) {
    req.log.error(err, "Failed to create audit log");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
