import { Router, type IRouter } from "express";
import { db, governanceStandardsTable, governanceDocumentsTable, processGovernanceTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { useCredit } from "../lib/credits";
import { requireAuth } from "../middleware/auth.js";
import { embed, vecToSql } from "../lib/embeddings.js";
import { extractTextFromFile } from "../lib/extract-text.js";

function getTenantId(req: any): number | null {
  const auth = req.auth;
  if (!auth || auth.role === 'superuser') return null;
  return auth.tenantId ?? null;
}

const router: IRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "governance");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Text extraction from uploaded files ───────────────────────────────────────

async function extractTextFromFile(filePath: string, mimeType: string, originalName: string): Promise<string> {
  try {
    const ext = path.extname(originalName).toLowerCase();
    if (mimeType === "application/pdf" || ext === ".pdf") {
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      return result.text || "";
    }
    if (mimeType === "text/plain" || ext === ".txt" || ext === ".md" || ext === ".csv") {
      return fs.readFileSync(filePath, "utf-8");
    }
    if (ext === ".xlsx" || ext === ".xls" || mimeType.includes("spreadsheet")) {
      const XLSX = (await import("xlsx")).default;
      const wb = XLSX.readFile(filePath);
      return wb.SheetNames.map((name: string) => {
        const ws = wb.Sheets[name];
        return `Sheet: ${name}\n${XLSX.utils.sheet_to_txt(ws)}`;
      }).join("\n\n");
    }
    // For unsupported types, return empty (but we'll still store the doc)
    return "";
  } catch (err) {
    console.error("[governance] text extraction failed:", err);
    return "";
  }
}

// ── Embed governance document (fire-and-forget) ───────────────────────────────

async function embedGovDoc(docId: number, standardName: string, text: string): Promise<void> {
  try {
    if (!text?.trim()) return;
    const combined = `${standardName}\n${text}`;
    const vec = await embed(combined);
    await db.execute(
      sql`UPDATE governance_documents SET extracted_text = ${text}, embedding_vec = ${vecToSql(vec)}::vector WHERE id = ${docId}`
    );
    console.log(`[governance] embedded doc ${docId} (${text.length} chars)`);
  } catch (err) {
    console.error(`[governance] embed failed for doc ${docId}:`, err);
  }
}

router.post("/governance/ai-populate", requireAuth, async (req, res) => {
  try {
    const { complianceName } = req.body as { complianceName: string };
    if (!complianceName?.trim()) { res.status(400).json({ error: "complianceName required" }); return; }

    const tenantId = (req as any).auth?.tenantId;
    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) {
        res.status(402).json({ error: "Insufficient credits. Please contact your administrator." });
        return;
      }
    }

    const prompt = `You are an expert in regulatory compliance and governance frameworks. Given this compliance standard or regulation name: "${complianceName}", provide the following as a JSON object:
{
  "complianceAuthority": "The full official name of the regulatory body or authority that issues/oversees this standard",
  "referenceUrl": "The official website URL for this standard or its governing authority",
  "description": "A concise 1-2 sentence description of what this standard covers and who it applies to"
}
Return ONLY the JSON object. Be precise — if you recognise the standard, use accurate real-world data. If uncertain, make a reasonable inference from the name.`;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "AI did not return valid JSON" }); return; }

    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    res.status(500).json({ error: "AI populate failed" });
  }
});

router.get("/governance", requireAuth, async (req, res) => {
  const tid = getTenantId(req);
  const cond = tid !== null ? eq(governanceStandardsTable.tenantId, tid) : undefined;
  const standards = await db.select().from(governanceStandardsTable).where(cond).orderBy(governanceStandardsTable.id);
  const govIds = standards.map(s => s.id);
  const docs = govIds.length > 0
    ? await db.select().from(governanceDocumentsTable).where(inArray(governanceDocumentsTable.governanceId, govIds))
    : [];
  const withDocs = standards.map(s => ({
    ...s,
    documents: docs.filter(d => d.governanceId === s.id),
  }));
  res.json(withDocs);
});

router.post("/governance", requireAuth, async (req, res) => {
  const tid = getTenantId(req);
  const { complianceName, complianceAuthority, referenceUrl } = req.body;
  if (!complianceName) { res.status(400).json({ error: "complianceName required" }); return; }
  const [created] = await db.insert(governanceStandardsTable).values({
    tenantId: tid,
    complianceName,
    complianceAuthority: complianceAuthority ?? "",
    referenceUrl: referenceUrl ?? "",
  }).returning();
  res.status(201).json({ ...created, documents: [] });
});

router.put("/governance/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const tid = getTenantId(req);
  const { complianceName, complianceAuthority, referenceUrl } = req.body;
  const updates: Record<string, string> = {};
  if (complianceName !== undefined) updates.complianceName = complianceName;
  if (complianceAuthority !== undefined) updates.complianceAuthority = complianceAuthority;
  if (referenceUrl !== undefined) updates.referenceUrl = referenceUrl;
  const cond = tid !== null ? and(eq(governanceStandardsTable.id, id), eq(governanceStandardsTable.tenantId, tid)) : eq(governanceStandardsTable.id, id);
  const [updated] = await db.update(governanceStandardsTable).set(updates).where(cond).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  const docs = await db.select().from(governanceDocumentsTable).where(eq(governanceDocumentsTable.governanceId, id));
  res.json({ ...updated, documents: docs });
});

router.delete("/governance/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const tid = getTenantId(req);
  const cond = tid !== null ? and(eq(governanceStandardsTable.id, id), eq(governanceStandardsTable.tenantId, tid)) : eq(governanceStandardsTable.id, id);
  const [existing] = await db.select().from(governanceStandardsTable).where(cond);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const docs = await db.select().from(governanceDocumentsTable).where(eq(governanceDocumentsTable.governanceId, id));
  for (const doc of docs) {
    try { fs.unlinkSync(doc.filePath); } catch {}
  }
  await db.delete(governanceStandardsTable).where(cond);
  res.status(204).send();
});

router.post("/governance/:id/documents", upload.array("files", 20), async (req, res) => {
  const governanceId = parseInt(req.params.id);
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) { res.status(400).json({ error: "No files uploaded" }); return; }
  const inserted = await db.insert(governanceDocumentsTable).values(
    files.map(f => ({
      governanceId,
      originalName: f.originalname,
      storedName: f.filename,
      mimeType: f.mimetype,
      fileSize: f.size,
      filePath: f.path,
    }))
  ).returning();

  // Fetch the standard name for embedding context, then extract + embed asynchronously
  const [standard] = await db.select().from(governanceStandardsTable).where(eq(governanceStandardsTable.id, governanceId));
  const standardName = standard?.complianceName ?? "Governance Document";

  setImmediate(async () => {
    for (let i = 0; i < inserted.length; i++) {
      const doc = inserted[i];
      const file = files[i];
      const text = await extractTextFromFile(file.path, file.mimetype, file.originalname);
      await embedGovDoc(doc.id, standardName, text);
    }
  });

  res.status(201).json(inserted);
});

// ── Re-index all governance documents without embeddings ─────────────────────
router.post("/governance/reindex", async (_req, res) => {
  try {
    const docsResult = await db.execute(
      sql`SELECT gd.id, gd.file_path, gd.mime_type, gd.original_name, gs.compliance_name
            FROM governance_documents gd
            JOIN governance_standards gs ON gs.id = gd.governance_id
           WHERE gd.embedding_vec IS NULL`
    );
    const docs: any[] = docsResult.rows as any[];
    let done = 0;
    for (const doc of docs) {
      const text = await extractTextFromFile(doc.file_path, doc.mime_type, doc.original_name);
      if (text.trim()) {
        await embedGovDoc(doc.id, doc.compliance_name, text);
        done++;
      }
    }
    res.json({ indexed: done, total: docs.length });
  } catch (err) {
    console.error("[governance] reindex failed:", err);
    res.status(500).json({ error: "Reindex failed" });
  }
});

router.delete("/governance/documents/:docId", async (req, res) => {
  const docId = parseInt(req.params.docId);
  const [doc] = await db.select().from(governanceDocumentsTable).where(eq(governanceDocumentsTable.id, docId));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  try { fs.unlinkSync(doc.filePath); } catch {}
  await db.delete(governanceDocumentsTable).where(eq(governanceDocumentsTable.id, docId));
  res.status(204).send();
});

router.get("/governance/documents/:docId", async (req, res) => {
  const docId = parseInt(req.params.docId);
  const [doc] = await db.select().from(governanceDocumentsTable).where(eq(governanceDocumentsTable.id, docId));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  if (!fs.existsSync(doc.filePath)) { res.status(404).json({ error: "File not found on disk" }); return; }
  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalName)}"`);
  fs.createReadStream(doc.filePath).pipe(res as any);
});

router.get("/processes/governance-map", async (_req, res) => {
  const links = await db.select().from(processGovernanceTable);
  const map: Record<number, number[]> = {};
  for (const link of links) {
    if (!map[link.processId]) map[link.processId] = [];
    map[link.processId].push(link.governanceId);
  }
  res.json(map);
});

router.get("/processes/:processId/governance", async (req, res) => {
  const processId = parseInt(req.params.processId);
  const links = await db.select().from(processGovernanceTable).where(eq(processGovernanceTable.processId, processId));
  if (links.length === 0) { res.json([]); return; }
  const govIds = links.map(l => l.governanceId);
  const standards = await db.select().from(governanceStandardsTable).where(inArray(governanceStandardsTable.id, govIds));
  res.json(standards);
});

router.put("/processes/:processId/governance", async (req, res) => {
  const processId = parseInt(req.params.processId);
  const { governanceIds } = req.body as { governanceIds: number[] };
  await db.delete(processGovernanceTable).where(eq(processGovernanceTable.processId, processId));
  if (governanceIds && governanceIds.length > 0) {
    await db.insert(processGovernanceTable).values(
      governanceIds.map(gid => ({ processId, governanceId: gid }))
    );
  }
  res.json({ processId, governanceIds: governanceIds ?? [] });
});

export default router;
