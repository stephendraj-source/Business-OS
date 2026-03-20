import { Router, type IRouter } from "express";
import { db, processesTable, auditLogsTable } from "@workspace/db";
import { eq, desc, max } from "drizzle-orm";
import * as XLSX from "xlsx";
import multer from "multer";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function writeAuditLog(data: {
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  description?: string;
  user?: string;
}) {
  try {
    await db.insert(auditLogsTable).values({
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      fieldChanged: data.fieldChanged,
      oldValue: data.oldValue,
      newValue: data.newValue,
      description: data.description,
      user: data.user ?? "Jane Doe",
    });
  } catch { /* non-critical */ }
}

// --- Export (must be before /:id) ---
router.get("/processes/export", async (req, res) => {
  try {
    const processes = await db.select().from(processesTable).orderBy(processesTable.number);

    const rows = processes.map(p => ({
      "#": p.number,
      "Category": p.category,
      "Process Name": p.processName,
      "Process Description": p.processDescription,
      "AI Agent": p.aiAgent,
      "Purpose": p.purpose,
      "Inputs": p.inputs,
      "Outputs": p.outputs,
      "Human-in-the-Loop": p.humanInTheLoop,
      "KPI": p.kpi,
      "Target": p.target,
      "Achievement": p.achievement,
      "Estimated Value Impact": p.estimatedValueImpact,
      "Industry Benchmark": p.industryBenchmark,
      "Include": p.included ? "Yes" : "No",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 5 }, { wch: 25 }, { wch: 22 }, { wch: 45 }, { wch: 25 },
      { wch: 40 }, { wch: 35 }, { wch: 35 }, { wch: 30 }, { wch: 35 },
      { wch: 20 }, { wch: 20 }, { wch: 35 }, { wch: 45 }, { wch: 8 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Processes");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    await writeAuditLog({ action: "export", entityType: "process", description: `Exported ${processes.length} processes to Excel` });

    res.setHeader("Content-Disposition", "attachment; filename=nonprofit-processes.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    req.log.error(err, "Failed to export processes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Import (must be before /:id) ---
router.post("/processes/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

    if (rows.length === 0) { res.status(400).json({ error: "Spreadsheet is empty" }); return; }

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const num = parseInt(String(row["#"] ?? row["Number"] ?? row["number"] ?? ""), 10);
      if (isNaN(num)) continue;

      const data = {
        number: num,
        category: String(row["Category"] ?? ""),
        processName: String(row["Process Name"] ?? ""),
        processDescription: String(row["Process Description"] ?? ""),
        aiAgent: String(row["AI Agent"] ?? ""),
        purpose: String(row["Purpose"] ?? ""),
        inputs: String(row["Inputs"] ?? ""),
        outputs: String(row["Outputs"] ?? ""),
        humanInTheLoop: String(row["Human-in-the-Loop"] ?? ""),
        kpi: String(row["KPI"] ?? ""),
        target: String(row["Target"] ?? ""),
        achievement: String(row["Achievement"] ?? ""),
        estimatedValueImpact: String(row["Estimated Value Impact"] ?? ""),
        industryBenchmark: String(row["Industry Benchmark"] ?? ""),
        included: String(row["Include"] ?? "").toLowerCase() === "yes",
      };

      const existing = await db.select({ id: processesTable.id }).from(processesTable).where(eq(processesTable.number, num)).limit(1);
      if (existing.length > 0) {
        await db.update(processesTable).set(data).where(eq(processesTable.id, existing[0].id));
        updated++;
      } else {
        await db.insert(processesTable).values(data);
        inserted++;
      }
    }

    await writeAuditLog({ action: "import", entityType: "process", description: `Imported ${inserted} new, ${updated} updated processes from Excel` });

    res.json({ inserted, updated, total: inserted + updated });
  } catch (err) {
    req.log.error(err, "Failed to import processes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- AI Populate (must be before /:id) ---
router.post("/processes/:id/ai-populate", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [process] = await db.select().from(processesTable).where(eq(processesTable.id, id));
    if (!process) { res.status(404).json({ error: "Process not found" }); return; }

    const name = process.processName || process.processDescription;
    const prompt = `You are an expert nonprofit operations advisor. For the following nonprofit process, populate ALL the blank fields with realistic, specific, and actionable content tailored to a modern nonprofit organization.

Process Name: ${name}
Category: ${process.category}

CURRENT VALUES (only fill blank or empty fields):
- AI Agent: ${process.aiAgent || "(BLANK - fill this)"}
- Purpose: ${process.purpose || "(BLANK - fill this)"}
- Inputs: ${process.inputs || "(BLANK - fill this)"}
- Outputs: ${process.outputs || "(BLANK - fill this)"}
- Human-in-the-Loop: ${process.humanInTheLoop || "(BLANK - fill this)"}
- KPI: ${process.kpi || "(BLANK - fill this)"}
- Estimated Value Impact: ${process.estimatedValueImpact || "(BLANK - fill this)"}
- Industry Benchmark: ${process.industryBenchmark || "(BLANK - fill this)"}
- Target: ${process.target || "(BLANK - fill this)"}
- Achievement: ${process.achievement || "(BLANK - fill this)"}

Return ONLY a valid JSON object with these exact keys (include ALL keys, keep existing non-blank values unchanged):
{
  "aiAgent": "...",
  "purpose": "...",
  "inputs": "...",
  "outputs": "...",
  "humanInTheLoop": "...",
  "kpi": "...",
  "estimatedValueImpact": "...",
  "industryBenchmark": "...",
  "target": "...",
  "achievement": "..."
}`;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "AI did not return valid JSON" }); return; }

    const fields = JSON.parse(jsonMatch[0]) as Record<string, string>;

    const updateData: Partial<typeof processesTable.$inferInsert> = {};
    if (!process.aiAgent && fields.aiAgent) updateData.aiAgent = fields.aiAgent;
    if (!process.purpose && fields.purpose) updateData.purpose = fields.purpose;
    if (!process.inputs && fields.inputs) updateData.inputs = fields.inputs;
    if (!process.outputs && fields.outputs) updateData.outputs = fields.outputs;
    if (!process.humanInTheLoop && fields.humanInTheLoop) updateData.humanInTheLoop = fields.humanInTheLoop;
    if (!process.kpi && fields.kpi) updateData.kpi = fields.kpi;
    if (!process.estimatedValueImpact && fields.estimatedValueImpact) updateData.estimatedValueImpact = fields.estimatedValueImpact;
    if (!process.industryBenchmark && fields.industryBenchmark) updateData.industryBenchmark = fields.industryBenchmark;
    if (!process.target && fields.target) updateData.target = fields.target;
    if (!process.achievement && fields.achievement) updateData.achievement = fields.achievement;

    const [updated] = await db.update(processesTable).set(updateData).where(eq(processesTable.id, id)).returning();

    await writeAuditLog({
      action: "ai-populate",
      entityType: "process",
      entityId: String(id),
      entityName: name,
      description: `AI populated ${Object.keys(updateData).length} blank fields for "${name}"`,
    });

    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to AI-populate process");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- List ---
router.get("/processes", async (req, res) => {
  try {
    const processes = await db.select().from(processesTable).orderBy(processesTable.number);
    res.json(processes);
  } catch (err) {
    req.log.error(err, "Failed to list processes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Create ---
router.post("/processes", async (req, res) => {
  try {
    const body = req.body as Record<string, any>;
    if (!body.category || !body.processDescription) {
      res.status(400).json({ error: "category and processDescription are required" });
      return;
    }

    const [maxRow] = await db.select({ max: max(processesTable.number) }).from(processesTable);
    const nextNumber = (maxRow?.max ?? 0) + 1;

    const [created] = await db.insert(processesTable).values({
      number: nextNumber,
      category: body.category,
      processDescription: body.processDescription,
      processName: body.processName ?? "",
      aiAgent: body.aiAgent ?? "",
      purpose: body.purpose ?? "",
      inputs: body.inputs ?? "",
      outputs: body.outputs ?? "",
      humanInTheLoop: body.humanInTheLoop ?? "",
      kpi: body.kpi ?? "",
      estimatedValueImpact: body.estimatedValueImpact ?? "",
      industryBenchmark: body.industryBenchmark ?? "",
      included: body.included ?? false,
      target: body.target ?? "",
      achievement: body.achievement ?? "",
    }).returning();

    await writeAuditLog({
      action: "create",
      entityType: "process",
      entityId: String(created.id),
      entityName: created.processName || created.processDescription,
      description: `Created new process #${created.number}: "${created.processName || created.processDescription}" in ${created.category}`,
    });

    res.status(201).json(created);
  } catch (err) {
    req.log.error(err, "Failed to create process");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Get by ID ---
router.get("/processes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [process] = await db.select().from(processesTable).where(eq(processesTable.id, id));
    if (!process) { res.status(404).json({ error: "Process not found" }); return; }
    res.json(process);
  } catch (err) {
    req.log.error(err, "Failed to get process");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Update ---
router.put("/processes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [before] = await db.select().from(processesTable).where(eq(processesTable.id, id));
    if (!before) { res.status(404).json({ error: "Process not found" }); return; }

    const body = req.body as Record<string, string | boolean>;
    const updateData: Partial<typeof processesTable.$inferInsert> = {};
    if (body.category !== undefined) updateData.category = body.category as string;
    if (body.processDescription !== undefined) updateData.processDescription = body.processDescription as string;
    if (body.processName !== undefined) updateData.processName = body.processName as string;
    if (body.aiAgent !== undefined) updateData.aiAgent = body.aiAgent as string;
    if (body.purpose !== undefined) updateData.purpose = body.purpose as string;
    if (body.inputs !== undefined) updateData.inputs = body.inputs as string;
    if (body.outputs !== undefined) updateData.outputs = body.outputs as string;
    if (body.humanInTheLoop !== undefined) updateData.humanInTheLoop = body.humanInTheLoop as string;
    if (body.kpi !== undefined) updateData.kpi = body.kpi as string;
    if (body.estimatedValueImpact !== undefined) updateData.estimatedValueImpact = body.estimatedValueImpact as string;
    if (body.industryBenchmark !== undefined) updateData.industryBenchmark = body.industryBenchmark as string;
    if (body.included !== undefined) updateData.included = body.included as boolean;
    if (body.target !== undefined) updateData.target = body.target as string;
    if (body.achievement !== undefined) updateData.achievement = body.achievement as string;

    const [updated] = await db.update(processesTable).set(updateData).where(eq(processesTable.id, id)).returning();

    const changedFields = Object.keys(updateData);
    for (const field of changedFields) {
      const oldVal = String((before as any)[field] ?? "");
      const newVal = String((updateData as any)[field] ?? "");
      if (oldVal !== newVal) {
        await writeAuditLog({
          action: "update",
          entityType: "process",
          entityId: String(id),
          entityName: before.processName || before.processDescription,
          fieldChanged: field,
          oldValue: oldVal.length > 200 ? oldVal.slice(0, 197) + "..." : oldVal,
          newValue: newVal.length > 200 ? newVal.slice(0, 197) + "..." : newVal,
          description: `Updated "${field}" on process #${before.number}`,
        });
      }
    }

    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to update process");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Delete ---
router.delete("/processes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [before] = await db.select().from(processesTable).where(eq(processesTable.id, id));
    const [deleted] = await db.delete(processesTable).where(eq(processesTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Process not found" }); return; }

    await writeAuditLog({
      action: "delete",
      entityType: "process",
      entityId: String(id),
      entityName: before?.processName || before?.processDescription,
      description: `Deleted process #${before?.number}: "${before?.processName || before?.processDescription}"`,
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Failed to delete process");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Categories ---
router.get("/categories", async (req, res) => {
  try {
    const rows = await db.selectDistinct({ category: processesTable.category }).from(processesTable).orderBy(processesTable.category);
    res.json(rows.map(r => r.category));
  } catch (err) {
    req.log.error(err, "Failed to list categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
