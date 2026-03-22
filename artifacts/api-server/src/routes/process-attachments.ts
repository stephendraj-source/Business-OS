import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { embed, vecToSql } from "../lib/embeddings.js";
import { extractTextFromFile } from "../lib/extract-text.js";

const router: IRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "process-attachments");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

async function embedAttachment(id: number, title: string, text: string): Promise<void> {
  try {
    const combined = `${title}\n${text}`;
    if (!combined.trim()) return;
    const vec = await embed(combined);
    await db.execute(
      sql`UPDATE process_attachments SET embedding_vec = ${vecToSql(vec)}::vector WHERE id = ${id}`
    );
  } catch (err) {
    console.error(`[embeddings] failed to embed process attachment ${id}:`, err);
  }
}

// ── List attachments for a process ───────────────────────────────────────────
router.get("/processes/:processId/attachments", async (req, res) => {
  try {
    const processId = Number(req.params.processId);
    const rows = await db.execute(
      sql`SELECT * FROM process_attachments WHERE process_id = ${processId} ORDER BY created_at ASC`
    );
    res.json(rows.rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Add a URL attachment ──────────────────────────────────────────────────────
router.post("/processes/:processId/attachments/url", async (req, res) => {
  try {
    const processId = Number(req.params.processId);
    const tenantId = (req as any).auth?.tenantId ?? null;
    const { title, url } = req.body as { title?: string; url: string };
    if (!url?.trim()) return res.status(400).json({ error: "url required" });
    const label = title?.trim() || url.trim();
    const rows = await db.execute(
      sql`INSERT INTO process_attachments (process_id, tenant_id, type, title, url)
          VALUES (${processId}, ${tenantId}, 'url', ${label}, ${url.trim()})
          RETURNING *`
    );
    const att = (rows.rows as any[])[0];
    res.status(201).json(att);
    setImmediate(() => embedAttachment(att.id, att.title, att.url || ""));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Upload a file attachment ──────────────────────────────────────────────────
router.post("/processes/:processId/attachments/upload", upload.single("file"), async (req, res) => {
  try {
    const processId = Number(req.params.processId);
    const tenantId = (req as any).auth?.tenantId ?? null;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    const title = (req.body.title as string)?.trim() || file.originalname;
    const fullPath = path.join(UPLOAD_DIR, file.filename);
    const extractedText = await extractTextFromFile(fullPath, file.mimetype, file.originalname);
    const rows = await db.execute(
      sql`INSERT INTO process_attachments (process_id, tenant_id, type, title, file_path, file_name, file_size, mime_type, extracted_text)
          VALUES (${processId}, ${tenantId}, 'file', ${title}, ${file.filename}, ${file.originalname}, ${file.size}, ${file.mimetype}, ${extractedText || ""})
          RETURNING *`
    );
    const att = (rows.rows as any[])[0];
    res.status(201).json(att);
    setImmediate(() => embedAttachment(att.id, att.title, extractedText || ""));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Re-index all unembedded process attachments ───────────────────────────────
router.post("/processes/attachments/reindex", async (req, res) => {
  try {
    const rows = await db.execute(
      sql`SELECT id, title, file_path, file_name, mime_type, url, extracted_text
          FROM process_attachments
          WHERE embedding_vec IS NULL`
    );
    const items = rows.rows as any[];
    res.json({ queued: items.length, status: "indexing" });
    setImmediate(async () => {
      let done = 0;
      for (const att of items) {
        let text = att.extracted_text || "";
        if (!text && att.type === "file" && att.file_path) {
          const fullPath = path.join(UPLOAD_DIR, att.file_path);
          if (fs.existsSync(fullPath)) {
            text = await extractTextFromFile(fullPath, att.mime_type || "", att.file_name || "");
            if (text) {
              await db.execute(
                sql`UPDATE process_attachments SET extracted_text = ${text} WHERE id = ${att.id}`
              );
            }
          }
        }
        await embedAttachment(att.id, att.title, text || att.url || "");
        done++;
      }
      console.log(`[reindex] process attachments complete: ${done} embedded`);
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Download a file attachment ────────────────────────────────────────────────
router.get("/processes/:processId/attachments/:id/download", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.execute(
      sql`SELECT * FROM process_attachments WHERE id = ${id} LIMIT 1`
    );
    const att = (rows.rows as any[])[0];
    if (!att || att.type !== "file" || !att.file_path) {
      return res.status(404).json({ error: "Not found" });
    }
    const filePath = path.join(UPLOAD_DIR, att.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing on disk" });
    res.setHeader("Content-Disposition", `attachment; filename="${att.file_name}"`);
    res.setHeader("Content-Type", att.mime_type || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete an attachment ──────────────────────────────────────────────────────
router.delete("/processes/:processId/attachments/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.execute(
      sql`SELECT * FROM process_attachments WHERE id = ${id} LIMIT 1`
    );
    const att = (rows.rows as any[])[0];
    if (!att) return res.status(404).json({ error: "Not found" });
    if (att.type === "file" && att.file_path) {
      const filePath = path.join(UPLOAD_DIR, att.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.execute(sql`DELETE FROM process_attachments WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
