import { Router, type IRouter } from "express";
import { db, formsTable, formFoldersTable } from "@workspace/db";
import { eq, max, and, isNull } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

// ── Form Folders ─────────────────────────────────────────────────────────────

router.get("/form-folders", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const query = db.select().from(formFoldersTable);
    const folders = auth?.tenantId
      ? await query.where(eq(formFoldersTable.tenantId, auth.tenantId)).orderBy(formFoldersTable.createdAt)
      : await query.orderBy(formFoldersTable.createdAt);
    res.json(folders);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/form-folders", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId = auth?.tenantId ?? null;
    const { name = "New Folder", parentId = null } = req.body as Record<string, any>;
    const [folder] = await db.insert(formFoldersTable).values({
      name: String(name).trim() || "New Folder",
      parentId: parentId ? Number(parentId) : null,
      tenantId,
    }).returning();
    res.status(201).json(folder);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/form-folders/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const { name } = req.body as Record<string, any>;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const cond = auth?.tenantId
      ? and(eq(formFoldersTable.id, id), eq(formFoldersTable.tenantId, auth.tenantId))
      : eq(formFoldersTable.id, id);
    const [folder] = await db.update(formFoldersTable).set({ name: String(name).trim() }).where(cond).returning();
    if (!folder) return res.status(404).json({ error: "Not found" });
    res.json(folder);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/form-folders/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formFoldersTable.id, id), eq(formFoldersTable.tenantId, auth.tenantId))
      : eq(formFoldersTable.id, id);
    // Unassign any forms in this folder (cascade handled at DB level for subfolders)
    await db.update(formsTable).set({ folderId: null }).where(eq(formsTable.folderId, id));
    await db.delete(formFoldersTable).where(cond);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public form (no auth) ──────────────────────────────────────────────────────

router.get("/forms/public/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const [form] = await db.select().from(formsTable).where(
      and(eq(formsTable.publishSlug, slug), eq(formsTable.isPublished, true))
    );
    if (!form) return res.status(404).json({ error: "Form not found or not published" });
    res.json({ id: form.id, name: form.name, description: form.description, fields: form.fields });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Forms ─────────────────────────────────────────────────────────────────────

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
    const { name = "New Form", description = "", fields = "[]", folderId } = req.body as Record<string, any>;
    const [form] = await db.insert(formsTable).values({
      formNumber: nextNum, name, description, fields, tenantId,
      folderId: folderId ? Number(folderId) : null,
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
    const { formNumber, name, description, fields, linkedWorkflowId, linkedAgentId, folderId } = req.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (formNumber !== undefined) updates.formNumber = Number(formNumber);
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (fields !== undefined) updates.fields = typeof fields === "string" ? fields : JSON.stringify(fields);
    if (linkedWorkflowId !== undefined) updates.linkedWorkflowId = linkedWorkflowId ? Number(linkedWorkflowId) : null;
    if (linkedAgentId !== undefined) updates.linkedAgentId = linkedAgentId ? Number(linkedAgentId) : null;
    if ('folderId' in req.body) updates.folderId = folderId ? Number(folderId) : null;
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

router.post("/forms/:id/publish", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formsTable.id, id), eq(formsTable.tenantId, auth.tenantId))
      : eq(formsTable.id, id);
    const [existing] = await db.select().from(formsTable).where(cond);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const slug = existing.publishSlug ?? crypto.randomBytes(6).toString("hex");
    const [form] = await db.update(formsTable)
      .set({ publishSlug: slug, isPublished: true, updatedAt: new Date() })
      .where(cond)
      .returning();
    res.json(form);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/forms/:id/publish", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formsTable.id, id), eq(formsTable.tenantId, auth.tenantId))
      : eq(formsTable.id, id);
    const [form] = await db.update(formsTable)
      .set({ isPublished: false, updatedAt: new Date() })
      .where(cond)
      .returning();
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
