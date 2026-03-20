import { Router, type IRouter } from "express";
import { db, governanceStandardsTable, governanceDocumentsTable, processGovernanceTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

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
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

async function seedIfEmpty() {
  const existing = await db.select().from(governanceStandardsTable).limit(1);
  if (existing.length > 0) return;
  const seeds = [
    { complianceName: "PDPA", complianceAuthority: "Personal Data Protection Commission (PDPC)", referenceUrl: "https://www.pdpc.gov.sg" },
    { complianceName: "Code of Governance", complianceAuthority: "Charity Council Singapore", referenceUrl: "https://www.charitycouncil.org.sg/code-of-governance" },
    { complianceName: "ACRA", complianceAuthority: "Accounting and Corporate Regulatory Authority", referenceUrl: "https://www.acra.gov.sg" },
  ];
  await db.insert(governanceStandardsTable).values(seeds);
}

seedIfEmpty().catch(console.error);

router.get("/governance", async (_req, res) => {
  const standards = await db.select().from(governanceStandardsTable).orderBy(governanceStandardsTable.id);
  const docs = await db.select().from(governanceDocumentsTable);
  const withDocs = standards.map(s => ({
    ...s,
    documents: docs.filter(d => d.governanceId === s.id),
  }));
  res.json(withDocs);
});

router.post("/governance", async (req, res) => {
  const { complianceName, complianceAuthority, referenceUrl } = req.body;
  if (!complianceName) { res.status(400).json({ error: "complianceName required" }); return; }
  const [created] = await db.insert(governanceStandardsTable).values({
    complianceName,
    complianceAuthority: complianceAuthority ?? "",
    referenceUrl: referenceUrl ?? "",
  }).returning();
  res.status(201).json({ ...created, documents: [] });
});

router.put("/governance/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { complianceName, complianceAuthority, referenceUrl } = req.body;
  const updates: Record<string, string> = {};
  if (complianceName !== undefined) updates.complianceName = complianceName;
  if (complianceAuthority !== undefined) updates.complianceAuthority = complianceAuthority;
  if (referenceUrl !== undefined) updates.referenceUrl = referenceUrl;
  const [updated] = await db.update(governanceStandardsTable).set(updates).where(eq(governanceStandardsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  const docs = await db.select().from(governanceDocumentsTable).where(eq(governanceDocumentsTable.governanceId, id));
  res.json({ ...updated, documents: docs });
});

router.delete("/governance/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const docs = await db.select().from(governanceDocumentsTable).where(eq(governanceDocumentsTable.governanceId, id));
  for (const doc of docs) {
    try { fs.unlinkSync(doc.filePath); } catch {}
  }
  await db.delete(governanceStandardsTable).where(eq(governanceStandardsTable.id, id));
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
  res.status(201).json(inserted);
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
