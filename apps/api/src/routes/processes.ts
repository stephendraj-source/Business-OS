import { Router, type IRouter } from "express";
import { db, processesTable, auditLogsTable, processLinkedAgents, processLinkedWorkflows, processAssignees, aiAgentsTable, workflowsTable, users, tenants } from "@workspace/db";
import { eq, desc, max, and } from "drizzle-orm";
import * as XLSX from "xlsx";
import multer from "multer";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { useCredit } from "../lib/credits";

function tenantFilter(req: any) {
  const tenantId = req.auth?.tenantId;
  if (tenantId) return eq(processesTable.tenantId, tenantId);
  return undefined;
}

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
  userId?: number | null;
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
      user: data.user ?? "System",
      userId: data.userId ?? null,
    });
  } catch { /* non-critical */ }
}

async function generateAiProcessFields(args: {
  category: string;
  processName?: string;
  processDescription: string;
  aiAgent?: string;
  purpose?: string;
  inputs?: string;
  outputs?: string;
  humanInTheLoop?: string;
  kpi?: string;
  estimatedValueImpact?: string;
  industryBenchmark?: string;
  target?: string;
  achievement?: string;
}) {
  const name = args.processName || args.processDescription;
  const prompt = `You are an expert nonprofit operations advisor. For the following nonprofit process, populate ALL the blank fields with realistic, specific, and actionable content tailored to a modern nonprofit organization.

Process Name: ${name}
Category: ${args.category}

CURRENT VALUES (only fill blank or empty fields):
- AI Agent: ${args.aiAgent || "(BLANK - fill this)"}
- Purpose: ${args.purpose || "(BLANK - fill this)"}
- Inputs: ${args.inputs || "(BLANK - fill this)"}
- Outputs: ${args.outputs || "(BLANK - fill this)"}
- Human-in-the-Loop: ${args.humanInTheLoop || "(BLANK - fill this)"}
- KPI: ${args.kpi || "(BLANK - fill this)"}
- Estimated Value Impact: ${args.estimatedValueImpact || "(BLANK - fill this)"}
- Industry Benchmark: ${args.industryBenchmark || "(BLANK - fill this)"}
- Target: ${args.target || "(BLANK - fill this)"}
- Achievement: ${args.achievement || "(BLANK - fill this)"}

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
  if (!jsonMatch) {
    throw new Error("AI did not return valid JSON");
  }

  return JSON.parse(jsonMatch[0]) as Record<string, string>;
}

// --- Export (must be before /:id) ---
router.get("/processes/export", async (req, res) => {
  try {
    const tf = tenantFilter(req);
    const processes = tf
      ? await db.select().from(processesTable).where(tf).orderBy(processesTable.number)
      : await db.select().from(processesTable).orderBy(processesTable.number);

    const rows = processes.map(p => ({
      "#": p.number,
      "Subprocess Of": p.parentProcessId ?? "",
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
      "BPMN": p.bpmn,
      "Status": p.trafficLight === 'green' ? 'On Track' : p.trafficLight === 'orange' ? 'At Risk' : p.trafficLight === 'red' ? 'Off Track' : '',
      "Estimated Value Impact": p.estimatedValueImpact,
      "Industry Benchmark": p.industryBenchmark,
      "Include": p.included ? "Yes" : "No",
    }));

    const format = (req.query.format as string) || "xlsx";

    if (format === "csv") {
      const headers = Object.keys(rows[0] ?? {});
      const escape = (v: any) => {
        const s = v == null ? "" : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [
        headers.join(","),
        ...rows.map(r => headers.map(h => escape((r as any)[h])).join(",")),
      ].join("\n");
      await writeAuditLog({ action: "export", entityType: "process", description: `Exported ${processes.length} processes to CSV`, userId: req.auth?.userId });
      res.setHeader("Content-Disposition", "attachment; filename=nonprofit-processes.csv");
      res.setHeader("Content-Type", "text/csv");
      res.send(csv);
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 5 }, { wch: 25 }, { wch: 22 }, { wch: 45 }, { wch: 25 },
      { wch: 40 }, { wch: 35 }, { wch: 35 }, { wch: 30 }, { wch: 35 },
      { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 35 }, { wch: 45 }, { wch: 8 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Processes");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    await writeAuditLog({ action: "export", entityType: "process", description: `Exported ${processes.length} processes to Excel`, userId: req.auth?.userId });

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
        parentProcessId: row["Subprocess Of"] == null || row["Subprocess Of"] === ""
          ? null
          : parseInt(String(row["Subprocess Of"]), 10) || null,
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
        bpmn: String(row["BPMN"] ?? ""),
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

    await writeAuditLog({ action: "import", entityType: "process", description: `Imported ${inserted} new, ${updated} updated processes from Excel`, userId: req.auth?.userId });

    res.json({ inserted, updated, total: inserted + updated });
  } catch (err) {
    req.log.error(err, "Failed to import processes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- AI Evaluate (must be before /:id) ---
router.post("/processes/:id/evaluate", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [process] = await db.select().from(processesTable).where(eq(processesTable.id, id));
    if (!process) { res.status(404).json({ error: "Process not found" }); return; }

    const tenantId = req.auth?.tenantId;
    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) {
        res.status(402).json({ error: "Insufficient credits. Please contact your administrator." });
        return;
      }
    }

    const name = process.processName || process.processDescription;
    const kpi = process.kpi || "Not specified";
    const target = process.target || "Not specified";
    const achievement = process.achievement || "Not specified";
    const benchmark = process.industryBenchmark || "Not specified";

    const prompt = `You are an expert operations performance analyst. Evaluate the following process performance by comparing the achievement against the target.

Process: ${name}
Category: ${process.category}
KPI: ${kpi}
Target: ${target}
Achievement: ${achievement}
Industry Benchmark: ${benchmark}

Provide an objective, data-driven evaluation. Score the achievement on a 1–10 scale relative to the target (10 = fully achieved or exceeded, 1 = severely underperforming).

Return ONLY a valid JSON object with exactly these keys:
{
  "score": <integer 1-10>,
  "rating": "<one of: Exceeds Target | On Target | Near Target | Below Target | Well Below Target>",
  "summary": "<2-3 sentence analysis of how well the achievement meets the target>",
  "gaps": "<1-2 sentences on the key gaps or what's missing>",
  "recommendation": "<1-2 sentences on the most impactful next step to close the gap>"
}`;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "AI did not return valid JSON" }); return; }

    const evaluation = JSON.parse(jsonMatch[0]);
    const evaluationStr = JSON.stringify(evaluation);

    const [updated] = await db.update(processesTable)
      .set({ evaluation: evaluationStr })
      .where(eq(processesTable.id, id))
      .returning();

    await writeAuditLog({
      action: "ai-evaluate",
      entityType: "process",
      entityId: String(id),
      entityName: name,
      description: `AI evaluated "${name}" — score: ${evaluation.score}/10, rating: ${evaluation.rating}`,
      userId: req.auth?.userId,
    });

    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to AI-evaluate process");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- AI Compliance Score ---
router.post("/processes/:id/ai-compliance", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [process] = await db.select().from(processesTable).where(eq(processesTable.id, id));
    if (!process) { res.status(404).json({ error: "Process not found" }); return; }

    const tenantId = req.auth?.tenantId;
    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) {
        res.status(402).json({ error: "Insufficient credits. Please contact your administrator." });
        return;
      }
    }

    // Fetch tenant context for compliance evaluation
    let tenantContext = "";
    if (tenantId) {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
      if (tenant) {
        const parts: string[] = [];
        if (tenant.name) parts.push(`Organisation: ${tenant.name}`);
        if (tenant.industryBlueprint) parts.push(`Industry: ${tenant.industryBlueprint}`);
        if (tenant.systemPrompt) parts.push(`Additional context: ${tenant.systemPrompt}`);
        tenantContext = parts.join("\n");
      }
    }

    const name = process.processName || process.processDescription;
    const purpose = process.purpose || "Not specified";
    const inputs = process.inputs || "Not specified";
    const outputs = process.outputs || "Not specified";
    const humanInTheLoop = process.humanInTheLoop || "Not specified";
    const kpi = process.kpi || "Not specified";
    const target = process.target || "Not specified";
    const achievement = process.achievement || "Not specified";
    const benchmark = process.industryBenchmark || "Not specified";

    const prompt = `You are an expert process compliance analyst. Assess how compliant the organisation is with the requirements and best practices defined for the following process.

${tenantContext ? `ORGANISATION CONTEXT:\n${tenantContext}\n` : ""}
PROCESS DETAILS:
- Name: ${name}
- Category: ${process.category}
- Purpose: ${purpose}
- Required Inputs: ${inputs}
- Expected Outputs: ${outputs}
- Human-in-the-Loop requirements: ${humanInTheLoop}
- KPI: ${kpi}
- Target: ${target}
- Achievement: ${achievement}
- Industry Benchmark: ${benchmark}

Based on the process requirements above and the organisation's context, assess the compliance level. Consider:
1. Whether the process is clearly defined and documented
2. Whether key requirements (inputs, outputs, controls) are in place
3. Whether KPIs and targets align with industry benchmarks
4. Whether human oversight requirements are addressed
5. Overall operational maturity relative to process standards

Provide a compliance score as a percentage (0–100) where:
- 90–100%: Fully compliant, exceeds requirements
- 70–89%: Largely compliant, minor gaps
- 50–69%: Partially compliant, notable gaps
- 30–49%: Low compliance, significant gaps
- 0–29%: Non-compliant, major deficiencies

Return ONLY a valid JSON object with exactly these keys:
{
  "score": <integer 0-100>,
  "reasoning": "<3-5 sentences explaining how the score was determined, what is working well, and what gaps exist>"
}`;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "AI did not return valid JSON" }); return; }

    const result = JSON.parse(jsonMatch[0]);
    const score = Math.min(100, Math.max(0, parseInt(result.score, 10) || 0));
    const reasoning = (result.reasoning as string) || "";

    const [updated] = await db.update(processesTable)
      .set({ aiScore: score, aiReasoning: reasoning })
      .where(eq(processesTable.id, id))
      .returning();

    await writeAuditLog({
      action: "ai-compliance",
      entityType: "process",
      entityId: String(id),
      entityName: name,
      description: `AI compliance scored "${name}" — ${score}%`,
      userId: req.auth?.userId,
    });

    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to AI-score process compliance");
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

    const tenantId = req.auth?.tenantId;
    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) {
        res.status(402).json({ error: "Insufficient credits. Please contact your administrator." });
        return;
      }
    }

    const name = process.processName || process.processDescription;
    const fields = await generateAiProcessFields({
      category: process.category,
      processName: process.processName,
      processDescription: process.processDescription,
      aiAgent: process.aiAgent,
      purpose: process.purpose,
      inputs: process.inputs,
      outputs: process.outputs,
      humanInTheLoop: process.humanInTheLoop,
      kpi: process.kpi,
      estimatedValueImpact: process.estimatedValueImpact,
      industryBenchmark: process.industryBenchmark,
      target: process.target,
      achievement: process.achievement,
    });

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
      userId: req.auth?.userId,
    });

    res.json(updated);
  } catch (err) {
    req.log.error(err, "Failed to AI-populate process");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/processes/ai-draft", async (req, res) => {
  try {
    const body = req.body as Record<string, string | undefined>;
    if (!body.category || !body.processDescription) {
      res.status(400).json({ error: "category and processDescription are required" });
      return;
    }

    const tenantId = req.auth?.tenantId;
    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) {
        res.status(402).json({ error: "Insufficient credits. Please contact your administrator." });
        return;
      }
    }

    const fields = await generateAiProcessFields({
      category: body.category,
      processName: body.processName,
      processDescription: body.processDescription,
      aiAgent: body.aiAgent,
      purpose: body.purpose,
      inputs: body.inputs,
      outputs: body.outputs,
      humanInTheLoop: body.humanInTheLoop,
      kpi: body.kpi,
      estimatedValueImpact: body.estimatedValueImpact,
      industryBenchmark: body.industryBenchmark,
      target: body.target,
      achievement: body.achievement,
    });

    res.json(fields);
  } catch (err) {
    req.log.error(err, "Failed to AI-draft process");
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// --- List ---
router.get("/processes", async (req, res) => {
  try {
    const tf = tenantFilter(req);
    let processes = tf
      ? await db.select().from(processesTable).where(tf).orderBy(processesTable.number)
      : await db.select().from(processesTable).orderBy(processesTable.number);
    // Fall back to all processes if none found for this tenant
    if (!processes.length && tf) {
      processes = await db.select().from(processesTable).orderBy(processesTable.number);
    }
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
    const parentProcessId = body.parentProcessId == null || body.parentProcessId === ""
      ? null
      : Number(body.parentProcessId);
    if (parentProcessId != null) {
      if (Number.isNaN(parentProcessId)) {
        res.status(400).json({ error: "Subprocess parent must be another valid process" });
        return;
      }
      const [parent] = await db.select({ id: processesTable.id }).from(processesTable).where(eq(processesTable.id, parentProcessId));
      if (!parent) {
        res.status(400).json({ error: "Selected parent process was not found" });
        return;
      }
    }

    const [created] = await db.insert(processesTable).values({
      parentProcessId,
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
      bpmn: body.bpmn ?? "",
      estimatedValueImpact: body.estimatedValueImpact ?? "",
      industryBenchmark: body.industryBenchmark ?? "",
      included: body.included ?? false,
      target: body.target ?? "",
      achievement: body.achievement ?? null,
      trafficLight: body.trafficLight ?? "",
    }).returning();

    await writeAuditLog({
      action: "create",
      entityType: "process",
      entityId: String(created.id),
      entityName: created.processName || created.processDescription,
      description: `Created new process #${created.number}: "${created.processName || created.processDescription}" in ${created.category}`,
      userId: req.auth?.userId,
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

    const body = req.body as Record<string, string | boolean | number>;
    const updateData: Partial<typeof processesTable.$inferInsert> = {};

    if (body.number !== undefined) {
      const newNumber = parseInt(String(body.number), 10);
      if (isNaN(newNumber) || newNumber < 1) { res.status(400).json({ error: "Process ID must be a positive integer" }); return; }
      const [conflict] = await db.select().from(processesTable)
        .where(eq(processesTable.number, newNumber));
      if (conflict && conflict.id !== id) { res.status(409).json({ error: `PRO-${newNumber.toString().padStart(3, '0')} is already in use` }); return; }
      updateData.number = newNumber;
    }

    if (body.parentProcessId !== undefined) {
      const parentProcessId = body.parentProcessId == null || body.parentProcessId === ""
        ? null
        : Number(body.parentProcessId);
      if (parentProcessId != null && (Number.isNaN(parentProcessId) || parentProcessId === id)) {
        res.status(400).json({ error: "Subprocess parent must be another valid process" }); return;
      }
      if (parentProcessId != null) {
        const allProcesses = await db.select({
          id: processesTable.id,
          parentProcessId: processesTable.parentProcessId,
        }).from(processesTable);
        const processMap = new Map(allProcesses.map(process => [process.id, process.parentProcessId ?? null]));
        if (!processMap.has(parentProcessId)) {
          res.status(400).json({ error: "Selected parent process was not found" }); return;
        }
        let cursor: number | null = parentProcessId;
        while (cursor != null) {
          if (cursor === id) {
            res.status(400).json({ error: "A process cannot be assigned under its own subprocess tree" }); return;
          }
          cursor = processMap.get(cursor) ?? null;
        }
      }
      updateData.parentProcessId = parentProcessId;
    }

    if (body.category !== undefined) updateData.category = body.category as string;
    if (body.processDescription !== undefined) updateData.processDescription = body.processDescription as string;
    if (body.processName !== undefined) updateData.processName = body.processName as string;
    if (body.aiAgent !== undefined) updateData.aiAgent = body.aiAgent as string;
    if (body.purpose !== undefined) updateData.purpose = body.purpose as string;
    if (body.inputs !== undefined) updateData.inputs = body.inputs as string;
    if (body.outputs !== undefined) updateData.outputs = body.outputs as string;
    if (body.humanInTheLoop !== undefined) updateData.humanInTheLoop = body.humanInTheLoop as string;
    if (body.kpi !== undefined) updateData.kpi = body.kpi as string;
    if (body.bpmn !== undefined) updateData.bpmn = body.bpmn as string;
    if (body.estimatedValueImpact !== undefined) updateData.estimatedValueImpact = body.estimatedValueImpact as string;
    if (body.industryBenchmark !== undefined) updateData.industryBenchmark = body.industryBenchmark as string;
    if (body.included !== undefined) updateData.included = body.included as boolean;
    if (body.aiAgentActive !== undefined) updateData.aiAgentActive = body.aiAgentActive as boolean;
    if (body.target !== undefined) updateData.target = body.target as string;
    if (body.achievement !== undefined) updateData.achievement = body.achievement == null ? null : String(body.achievement);
    if (body.trafficLight !== undefined) updateData.trafficLight = body.trafficLight as string;
    if (body.priority !== undefined) updateData.priority = body.priority === null ? null : Number(body.priority);

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
          userId: req.auth?.userId,
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
      userId: req.auth?.userId,
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Failed to delete process");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Process Links (agents + workflows) ---

router.get("/processes/:id/links", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const agentLinks = await db
      .select({ id: aiAgentsTable.id, agentNumber: aiAgentsTable.agentNumber, name: aiAgentsTable.name })
      .from(processLinkedAgents)
      .innerJoin(aiAgentsTable, eq(processLinkedAgents.agentId, aiAgentsTable.id))
      .where(eq(processLinkedAgents.processId, id));

    const workflowLinks = await db
      .select({ id: workflowsTable.id, name: workflowsTable.name })
      .from(processLinkedWorkflows)
      .innerJoin(workflowsTable, eq(processLinkedWorkflows.workflowId, workflowsTable.id))
      .where(eq(processLinkedWorkflows.processId, id));

    res.json({ agents: agentLinks, workflows: workflowLinks });
  } catch (err) {
    req.log.error(err, "Failed to get process links");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/processes/:id/links", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { agentIds = [], workflowIds = [] } = req.body as { agentIds?: number[]; workflowIds?: number[] };

    await db.delete(processLinkedAgents).where(eq(processLinkedAgents.processId, id));
    await db.delete(processLinkedWorkflows).where(eq(processLinkedWorkflows.processId, id));

    if (agentIds.length > 0) {
      await db.insert(processLinkedAgents).values(agentIds.map(agentId => ({ processId: id, agentId })));
    }
    if (workflowIds.length > 0) {
      await db.insert(processLinkedWorkflows).values(workflowIds.map(workflowId => ({ processId: id, workflowId })));
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Failed to update process links");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Process Assignees ---

router.get("/processes/:id/assignees", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(processAssignees)
      .innerJoin(users, eq(processAssignees.userId, users.id))
      .where(eq(processAssignees.processId, id));

    res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to get process assignees");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/processes/:id/assignees", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { userIds = [] } = req.body as { userIds?: number[] };

    await db.delete(processAssignees).where(eq(processAssignees.processId, id));

    if (userIds.length > 0) {
      await db.insert(processAssignees).values(userIds.map(userId => ({ processId: id, userId })));
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Failed to update process assignees");
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
