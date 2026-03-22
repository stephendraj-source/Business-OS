import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  db, checklistsTable, checklistItemsTable,
  evidenceItemsTable, evidenceUrlsTable, evidenceFilesTable,
} from "@workspace/db";
import { eq, asc, count, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

function getTenantId(req: any): number | null {
  const auth = req.auth;
  if (!auth || auth.role === 'superuser') return null;
  return auth.tenantId ?? null;
}

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "evidence");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });


// ── Checklist counts per process ──────────────────────────────────────────────

router.get("/checklists/counts", requireAuth, async (req, res) => {
  try {
    const tid = getTenantId(req);
    const tenantCond = tid !== null ? eq(checklistsTable.tenantId, tid) : undefined;
    const rows = await db
      .select({ processId: checklistsTable.processId, itemCount: count(checklistItemsTable.id) })
      .from(checklistsTable)
      .leftJoin(checklistItemsTable, eq(checklistItemsTable.checklistId, checklistsTable.id))
      .where(tenantCond)
      .groupBy(checklistsTable.processId);
    const map: Record<number, number> = {};
    for (const row of rows) map[row.processId] = row.itemCount;
    res.json(map);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ── Checklists ────────────────────────────────────────────────────────────────

router.get("/checklists", requireAuth, async (req, res) => {
  try {
    const tid = getTenantId(req);
    const processId = Number(req.query.processId);
    if (!processId) return res.status(400).json({ error: "processId required" });
    const cond = tid !== null
      ? and(eq(checklistsTable.processId, processId), eq(checklistsTable.tenantId, tid))
      : eq(checklistsTable.processId, processId);
    const lists = await db.select().from(checklistsTable).where(cond).orderBy(asc(checklistsTable.createdAt));
    const result = [];
    for (const list of lists) {
      const items = await db.select().from(checklistItemsTable)
        .where(eq(checklistItemsTable.checklistId, list.id))
        .orderBy(asc(checklistItemsTable.sortOrder), asc(checklistItemsTable.createdAt));
      const itemsWithEvidence = [];
      for (const item of items) {
        const evItems = await db.select().from(evidenceItemsTable)
          .where(eq(evidenceItemsTable.checklistItemId, item.id))
          .orderBy(asc(evidenceItemsTable.createdAt));
        const evWithLinks = [];
        for (const ev of evItems) {
          const urls = await db.select().from(evidenceUrlsTable).where(eq(evidenceUrlsTable.evidenceItemId, ev.id)).orderBy(asc(evidenceUrlsTable.createdAt));
          const files = await db.select().from(evidenceFilesTable).where(eq(evidenceFilesTable.evidenceItemId, ev.id)).orderBy(asc(evidenceFilesTable.uploadedAt));
          evWithLinks.push({ ...ev, urls, files });
        }
        itemsWithEvidence.push({ ...item, evidenceItems: evWithLinks });
      }
      result.push({ ...list, items: itemsWithEvidence });
    }
    res.json(result);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/checklists", requireAuth, async (req, res) => {
  try {
    const tid = getTenantId(req);
    const { processId, name = "", description = "" } = req.body as Record<string, any>;
    if (!processId) return res.status(400).json({ error: "processId required" });
    const [cl] = await db.insert(checklistsTable).values({ tenantId: tid, processId: Number(processId), name, description }).returning();
    res.status(201).json({ ...cl, items: [] });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/checklists/:id", requireAuth, async (req, res) => {
  try {
    const tid = getTenantId(req);
    const { name, description } = req.body as Record<string, string>;
    const cond = tid !== null
      ? and(eq(checklistsTable.id, Number(req.params.id)), eq(checklistsTable.tenantId, tid))
      : eq(checklistsTable.id, Number(req.params.id));
    const [cl] = await db.update(checklistsTable)
      .set({ name, description, updatedAt: new Date() })
      .where(cond)
      .returning();
    res.json(cl);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/checklists/:id", requireAuth, async (req, res) => {
  try {
    const clId = Number(req.params.id);
    const items = await db.select().from(checklistItemsTable).where(eq(checklistItemsTable.checklistId, clId));
    for (const item of items) {
      const evItems = await db.select().from(evidenceItemsTable).where(eq(evidenceItemsTable.checklistItemId, item.id));
      for (const ev of evItems) {
        const files = await db.select().from(evidenceFilesTable).where(eq(evidenceFilesTable.evidenceItemId, ev.id));
        for (const f of files) {
          try { fs.unlinkSync(f.filePath); } catch {}
          await db.delete(evidenceFilesTable).where(eq(evidenceFilesTable.id, f.id));
        }
        await db.delete(evidenceUrlsTable).where(eq(evidenceUrlsTable.evidenceItemId, ev.id));
        await db.delete(evidenceItemsTable).where(eq(evidenceItemsTable.id, ev.id));
      }
      await db.delete(checklistItemsTable).where(eq(checklistItemsTable.id, item.id));
    }
    await db.delete(checklistsTable).where(eq(checklistsTable.id, clId));
    res.json({ ok: true });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ── Checklist Items ───────────────────────────────────────────────────────────

router.post("/checklist-items", async (req, res) => {
  try {
    const { checklistId, name = "", description = "", sortOrder = 0 } = req.body as Record<string, any>;
    const [item] = await db.insert(checklistItemsTable)
      .values({ checklistId: Number(checklistId), name, description, sortOrder: Number(sortOrder) })
      .returning();
    res.status(201).json({ ...item, evidenceItems: [] });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/checklist-items/:id", async (req, res) => {
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    const { name, description, met, sortOrder } = req.body as Record<string, any>;
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (met !== undefined) updates.met = Boolean(met);
    if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
    const [item] = await db.update(checklistItemsTable).set(updates)
      .where(eq(checklistItemsTable.id, Number(req.params.id))).returning();
    res.json(item);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/checklist-items/:id", async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    const evItems = await db.select().from(evidenceItemsTable).where(eq(evidenceItemsTable.checklistItemId, itemId));
    for (const ev of evItems) {
      const files = await db.select().from(evidenceFilesTable).where(eq(evidenceFilesTable.evidenceItemId, ev.id));
      for (const f of files) { try { fs.unlinkSync(f.filePath); } catch {} }
      await db.delete(evidenceFilesTable).where(eq(evidenceFilesTable.evidenceItemId, ev.id));
      await db.delete(evidenceUrlsTable).where(eq(evidenceUrlsTable.evidenceItemId, ev.id));
      await db.delete(evidenceItemsTable).where(eq(evidenceItemsTable.id, ev.id));
    }
    await db.delete(checklistItemsTable).where(eq(checklistItemsTable.id, itemId));
    res.json({ ok: true });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ── Evidence Items ────────────────────────────────────────────────────────────

router.post("/evidence-items", async (req, res) => {
  try {
    const { checklistItemId, name = "", description = "" } = req.body as Record<string, any>;
    const [ev] = await db.insert(evidenceItemsTable)
      .values({ checklistItemId: Number(checklistItemId), name, description })
      .returning();
    res.status(201).json({ ...ev, urls: [], files: [] });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/evidence-items/:id", async (req, res) => {
  try {
    const { name, description } = req.body as Record<string, string>;
    const [ev] = await db.update(evidenceItemsTable)
      .set({ name, description })
      .where(eq(evidenceItemsTable.id, Number(req.params.id))).returning();
    res.json(ev);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/evidence-items/:id", async (req, res) => {
  try {
    const evId = Number(req.params.id);
    const files = await db.select().from(evidenceFilesTable).where(eq(evidenceFilesTable.evidenceItemId, evId));
    for (const f of files) { try { fs.unlinkSync(f.filePath); } catch {} }
    await db.delete(evidenceFilesTable).where(eq(evidenceFilesTable.evidenceItemId, evId));
    await db.delete(evidenceUrlsTable).where(eq(evidenceUrlsTable.evidenceItemId, evId));
    await db.delete(evidenceItemsTable).where(eq(evidenceItemsTable.id, evId));
    res.json({ ok: true });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ── Evidence URLs ─────────────────────────────────────────────────────────────

router.post("/evidence-urls", async (req, res) => {
  try {
    const { evidenceItemId, url, label = "" } = req.body as Record<string, any>;
    const [u] = await db.insert(evidenceUrlsTable)
      .values({ evidenceItemId: Number(evidenceItemId), url, label })
      .returning();
    res.status(201).json(u);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/evidence-urls/:id", async (req, res) => {
  try {
    await db.delete(evidenceUrlsTable).where(eq(evidenceUrlsTable.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ── Evidence Files ────────────────────────────────────────────────────────────

router.post("/evidence-files/:evidenceItemId", upload.single("file"), async (req, res) => {
  try {
    const evId = Number(req.params.evidenceItemId);
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    const [f] = await db.insert(evidenceFilesTable).values({
      evidenceItemId: evId,
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      fileSize: file.size,
      filePath: file.path,
    }).returning();
    res.status(201).json(f);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/evidence-files/:id/download", async (req, res) => {
  try {
    const [f] = await db.select().from(evidenceFilesTable).where(eq(evidenceFilesTable.id, Number(req.params.id)));
    if (!f) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Disposition", `attachment; filename="${f.originalName}"`);
    res.setHeader("Content-Type", f.mimeType);
    res.sendFile(path.resolve(f.filePath));
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/evidence-files/:id", async (req, res) => {
  try {
    const [f] = await db.select().from(evidenceFilesTable).where(eq(evidenceFilesTable.id, Number(req.params.id)));
    if (f) { try { fs.unlinkSync(f.filePath); } catch {} }
    await db.delete(evidenceFilesTable).where(eq(evidenceFilesTable.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
