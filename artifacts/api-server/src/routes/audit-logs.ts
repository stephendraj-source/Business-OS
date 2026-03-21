import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

router.get("/audit-logs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10), 500);
    const role = req.auth?.role;
    const userId = req.auth?.userId;

    if (!req.auth) {
      return res.json([]);
    }

    let logs;
    if (role === 'admin' || role === 'superuser') {
      logs = await db
        .select()
        .from(auditLogsTable)
        .orderBy(desc(auditLogsTable.timestamp))
        .limit(limit);
    } else {
      logs = await db
        .select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.userId, userId!))
        .orderBy(desc(auditLogsTable.timestamp))
        .limit(limit);
    }

    res.json(logs);
  } catch (err) {
    req.log.error(err, "Failed to list audit logs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/audit-logs", async (req, res) => {
  try {
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
      action: body.action,
      entityType: body.entityType,
      entityId: body.entityId,
      entityName: body.entityName,
      fieldChanged: body.fieldChanged,
      oldValue: body.oldValue,
      newValue: body.newValue,
      user: body.user ?? "System",
      description: body.description,
      userId: req.auth?.userId ?? null,
    }).returning();
    res.status(201).json(log);
  } catch (err) {
    req.log.error(err, "Failed to create audit log");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
