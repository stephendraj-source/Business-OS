import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { sql } from "drizzle-orm";
import {
  db, knowledgeItemsTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { embed, vecToSql, warmUp, hasPgVectorSupport } from "../lib/embeddings.js";
import { extractTextFromFile } from "../lib/extract-text.js";

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

warmUp().catch(() => {});

// ── Embedding helper (fire-and-forget) ───────────────────────────────────────

async function embedItem(id: number, title: string, content: string): Promise<void> {
  try {
    if (!hasPgVectorSupport()) return;
    const text = `${title}\n${content}`;
    if (!text.trim()) return;
    const vec = await embed(text);
    await db.execute(
      sql`UPDATE knowledge_items SET embedding_vec = ${vecToSql(vec)}::vector, embedded_at = NOW() WHERE id = ${id}`
    );
  } catch (err) {
    console.error(`[embeddings] failed to embed item ${id}:`, err);
  }
}

// ── Semantic search ───────────────────────────────────────────────────────────

router.get("/knowledge/search", async (req, res) => {
  try {
    const { q, limit = "10" } = req.query as Record<string, string>;
    if (!q?.trim()) return res.json([]);
    const auth = (req as any).auth;
    const limitNum = Math.min(Number(limit) || 10, 50);

    if (!hasPgVectorSupport()) {
      const tenantCondition = auth?.tenantId
        ? sql`tenant_id = ${auth.tenantId}`
        : sql`tenant_id IS NULL`;
      const pattern = `%${q.trim().split(/\s+/).filter(w => w.length > 2).slice(0, 3).join("%") || q.trim()}%`;
      const rows = await db.execute(
        sql`SELECT id, title, content, type, folder_id, file_name, mime_type, url, 0.0 AS similarity
            FROM knowledge_items
            WHERE ${tenantCondition}
              AND (lower(title) LIKE lower(${pattern}) OR lower(content) LIKE lower(${pattern}))
            LIMIT ${limitNum}`
      );
      return res.json(rows.rows);
    }

    const queryVec = await embed(q);
    const embStr = vecToSql(queryVec);

    const tenantCondition = auth?.tenantId
      ? sql`tenant_id = ${auth.tenantId}`
      : sql`tenant_id IS NULL`;

    const rows = await db.execute(
      sql`SELECT id, title, content, type, folder_id, file_name, mime_type, url,
               ROUND((1 - (embedding_vec <=> ${embStr}::vector))::numeric, 4) AS similarity
          FROM knowledge_items
          WHERE ${tenantCondition}
            AND embedding_vec IS NOT NULL
          ORDER BY embedding_vec <=> ${embStr}::vector
          LIMIT ${limitNum}`
    );

    res.json(rows.rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Reindex all unembedded docs ───────────────────────────────────────────────

router.post("/knowledge/reindex", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantCond = auth?.tenantId
      ? and(eq(knowledgeItemsTable.tenantId, auth.tenantId), isNull(knowledgeItemsTable.embeddedAt))
      : isNull(knowledgeItemsTable.embeddedAt);

    // Also grab file-based items with empty content regardless of embeddedAt
    const allItems = await db
      .select({
        id: knowledgeItemsTable.id,
        tenantId: knowledgeItemsTable.tenantId,
        title: knowledgeItemsTable.title,
        content: knowledgeItemsTable.content,
        filePath: knowledgeItemsTable.filePath,
        fileName: knowledgeItemsTable.fileName,
        mimeType: knowledgeItemsTable.mimeType,
        embeddedAt: knowledgeItemsTable.embeddedAt,
      })
      .from(knowledgeItemsTable);

    const authTenantId = (req as any).auth?.tenantId;
    const filtered = allItems.filter(i =>
      (authTenantId === undefined ? true : authTenantId ? i.tenantId === authTenantId : i.tenantId === null) &&
      (!i.embeddedAt || (i.filePath && !i.content?.trim()))
    );

    res.json({ queued: filtered.length, status: "indexing" });

    setImmediate(async () => {
      let done = 0;
      for (const item of filtered) {
        let text = item.content || "";
        if ((!text.trim()) && item.filePath && fs.existsSync(item.filePath)) {
          text = await extractTextFromFile(item.filePath, item.mimeType || "", item.fileName || "");
          if (text) {
            await db.execute(sql`UPDATE knowledge_items SET content = ${text} WHERE id = ${item.id}`);
          }
        }
        await embedItem(item.id, item.title, text);
        done++;
        if (done % 5 === 0) console.log(`[reindex] ${done}/${filtered.length}`);
      }
      console.log(`[reindex] complete: ${done} items embedded`);
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
    setImmediate(() => embedItem(item.id, item.title, item.content));
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
    if (title !== undefined || content !== undefined) {
      setImmediate(() => embedItem(item.id, item.title, item.content));
    }
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
    const [existing] = await db.select({ title: knowledgeItemsTable.title }).from(knowledgeItemsTable).where(cond);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const extractedText = await extractTextFromFile(file.path, file.mimetype, file.originalname);
    const [item] = await db.update(knowledgeItemsTable).set({
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,
      content: extractedText || "",
      updatedAt: new Date(),
    }).where(cond).returning();
    res.json(item);
    setImmediate(() => embedItem(item.id, item.title, item.content));
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
