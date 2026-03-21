import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import {
  db, knowledgeItemsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "knowledge");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ── Knowledge Items ───────────────────────────────────────────────────────────

router.get("/knowledge-items", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const query = db.select().from(knowledgeItemsTable);
    const items = auth?.tenantId
      ? await query.where(eq(knowledgeItemsTable.tenantId, auth.tenantId)).orderBy(knowledgeItemsTable.createdAt)
      : await query.orderBy(knowledgeItemsTable.createdAt);
    res.json(items);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/knowledge-items", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId = auth?.tenantId ?? null;
    const { type = "wiki", title = "Untitled", content = "", url, folderId } = req.body as Record<string, any>;
    const [item] = await db.insert(knowledgeItemsTable).values({
      tenantId,
      folderId: folderId ? Number(folderId) : null,
      type: String(type),
      title: String(title).trim() || "Untitled",
      content: String(content || ""),
      url: url ? String(url) : null,
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/knowledge-items/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(knowledgeItemsTable.id, id), eq(knowledgeItemsTable.tenantId, auth.tenantId))
      : eq(knowledgeItemsTable.id, id);
    const [item] = await db.select().from(knowledgeItemsTable).where(cond);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/knowledge-items/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const { title, content, url, folderId } = req.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = String(title).trim() || "Untitled";
    if (content !== undefined) updates.content = String(content);
    if (url !== undefined) updates.url = url ? String(url) : null;
    if (folderId !== undefined) updates.folderId = folderId ? Number(folderId) : null;
    const cond = auth?.tenantId
      ? and(eq(knowledgeItemsTable.id, id), eq(knowledgeItemsTable.tenantId, auth.tenantId))
      : eq(knowledgeItemsTable.id, id);
    const [item] = await db.update(knowledgeItemsTable).set(updates).where(cond).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/knowledge-items/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(knowledgeItemsTable.id, id), eq(knowledgeItemsTable.tenantId, auth.tenantId))
      : eq(knowledgeItemsTable.id, id);
    const [item] = await db.select().from(knowledgeItemsTable).where(cond);
    if (item?.filePath && fs.existsSync(item.filePath)) {
      fs.unlinkSync(item.filePath);
    }
    await db.delete(knowledgeItemsTable).where(cond);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/knowledge-items/:id/upload", upload.single("file"), async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    const cond = auth?.tenantId
      ? and(eq(knowledgeItemsTable.id, id), eq(knowledgeItemsTable.tenantId, auth.tenantId))
      : eq(knowledgeItemsTable.id, id);
    const [item] = await db.update(knowledgeItemsTable).set({
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,
      updatedAt: new Date(),
    }).where(cond).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/knowledge-items/:id/download", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(knowledgeItemsTable.id, id), eq(knowledgeItemsTable.tenantId, auth.tenantId))
      : eq(knowledgeItemsTable.id, id);
    const [item] = await db.select().from(knowledgeItemsTable).where(cond);
    if (!item?.filePath) return res.status(404).json({ error: "No file" });
    res.setHeader("Content-Disposition", `attachment; filename="${item.fileName}"`);
    res.sendFile(path.resolve(item.filePath));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
