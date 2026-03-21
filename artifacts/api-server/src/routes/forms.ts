import { Router, type IRouter } from "express";
import { db, formsTable } from "@workspace/db";
import { eq, max, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/forms", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const query = db.select().from(formsTable);
    const forms = auth?.tenantId
      ? await query.where(eq(formsTable.tenantId, auth.tenantId)).orderBy(formsTable.formNumber)
      : await query.orderBy(formsTable.formNumber);
    res.json(forms);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/forms/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formsTable.id, id), eq(formsTable.tenantId, auth.tenantId))
      : eq(formsTable.id, id);
    const [form] = await db.select().from(formsTable).where(cond);
    if (!form) return res.status(404).json({ error: "Not found" });
    res.json(form);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/forms", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId = auth?.tenantId ?? null;
    const tenantCond = tenantId ? eq(formsTable.tenantId, tenantId) : undefined;
    const query = db.select({ val: max(formsTable.formNumber) }).from(formsTable);
    const [maxNum] = tenantCond ? await query.where(tenantCond) : await query;
    const nextNum = (maxNum?.val ?? 0) + 1;
    const { name = "New Form", description = "", fields = "[]" } = req.body as Record<string, string>;
    const [form] = await db.insert(formsTable).values({
      formNumber: nextNum, name, description, fields, tenantId,
    }).returning();
    res.status(201).json(form);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/forms/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const { formNumber, name, description, fields } = req.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (formNumber !== undefined) updates.formNumber = Number(formNumber);
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (fields !== undefined) updates.fields = typeof fields === "string" ? fields : JSON.stringify(fields);
    const cond = auth?.tenantId
      ? and(eq(formsTable.id, id), eq(formsTable.tenantId, auth.tenantId))
      : eq(formsTable.id, id);
    const [form] = await db.update(formsTable).set(updates).where(cond).returning();
    if (!form) return res.status(404).json({ error: "Not found" });
    res.json(form);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/forms/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formsTable.id, id), eq(formsTable.tenantId, auth.tenantId))
      : eq(formsTable.id, id);
    await db.delete(formsTable).where(cond);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as formsRouter };
