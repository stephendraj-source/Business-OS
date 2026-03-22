import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  db, processesTable, users,
  aiAgentsTable, agentKnowledgeUrlsTable, agentKnowledgeFilesTable,
  agentSchedulesTable, agentRunLogsTable,
  agentModuleAccess, agentAllowedCategories, agentAllowedProcesses, agentFieldPermissions,
  agentShares,
} from "@workspace/db";
import { userGroups, groupRoles } from "@workspace/db";
import { eq, desc, max, sql, or, inArray } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { useCredit } from "../lib/credits";

const router: IRouter = Router();

const ALL_MODULES = [
  'table', 'tree', 'portfolio', 'process-map', 'governance',
  'workflows', 'ai-agents', 'connectors', 'dashboards',
  'reports', 'audit-logs', 'settings', 'users',
];

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "ai-agents");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ── Helper: get agent with all knowledge ─────────────────────────────────────

async function getAgentFull(id: number) {
  const [agent] = await db.select().from(aiAgentsTable).where(eq(aiAgentsTable.id, id));
  if (!agent) return null;
  const urls = await db.select().from(agentKnowledgeUrlsTable).where(eq(agentKnowledgeUrlsTable.agentId, id)).orderBy(agentKnowledgeUrlsTable.createdAt);
  const files = await db.select().from(agentKnowledgeFilesTable).where(eq(agentKnowledgeFilesTable.agentId, id)).orderBy(agentKnowledgeFilesTable.uploadedAt);
  const schedules = await db.select().from(agentSchedulesTable).where(eq(agentSchedulesTable.agentId, id)).orderBy(desc(agentSchedulesTable.createdAt));
  return { ...agent, urls, files, schedules };
}

// ── Helper: fetch URL content ─────────────────────────────────────────────────

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return `[Failed to fetch ${url}: HTTP ${res.status}]`;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      const json = await res.json();
      return `URL: ${url}\n${JSON.stringify(json, null, 2).slice(0, 4000)}`;
    }
    const text = await res.text();
    return `URL: ${url}\n${text.slice(0, 4000)}`;
  } catch {
    return `[Could not fetch ${url}]`;
  }
}

// ── Helper: read file content ─────────────────────────────────────────────────

function readFileContent(filePath: string, mimeType: string, originalName: string): string {
  try {
    if (!fs.existsSync(filePath)) return `[File not found: ${originalName}]`;
    if (mimeType.includes("text") || originalName.endsWith(".txt") || originalName.endsWith(".md") || originalName.endsWith(".csv")) {
      return `File: ${originalName}\n${fs.readFileSync(filePath, "utf8").slice(0, 5000)}`;
    }
    if (originalName.endsWith(".xlsx") || originalName.endsWith(".xls")) {
      try {
        const xlsx = require("xlsx");
        const wb = xlsx.readFile(filePath);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const csv = xlsx.utils.sheet_to_csv(sheet);
        return `File: ${originalName}\n${csv.slice(0, 5000)}`;
      } catch {
        return `File: ${originalName} [Excel file - could not parse]`;
      }
    }
    return `File: ${originalName} [Binary file, ${mimeType}]`;
  } catch {
    return `[Error reading ${originalName}]`;
  }
}

// ── Helper: resolve {{field}} placeholders in instructions ───────────────────

async function resolveInstructions(instructions: string): Promise<string> {
  if (!instructions) return instructions;
  let resolved = instructions;

  // Resolve {{process:ProcessName}} — inject data for a specific named process
  const processNameMatches = instructions.match(/\{\{process:([^}]+)\}\}/g);
  if (processNameMatches) {
    const processes = await db.select().from(processesTable).orderBy(processesTable.number);
    const uniqueNames = [...new Set(processNameMatches.map(m => m.slice(10, -2).trim()))];
    for (const name of uniqueNames) {
      const proc = processes.find(p =>
        p.processName?.toLowerCase() === name.toLowerCase() ||
        p.processDescription?.toLowerCase() === name.toLowerCase()
      );
      if (proc) {
        const summary = [
          `Process: ${proc.processName || proc.processDescription}`,
          proc.purpose ? `Purpose: ${proc.purpose}` : null,
          proc.inputs ? `Inputs: ${proc.inputs}` : null,
          proc.outputs ? `Outputs: ${proc.outputs}` : null,
          proc.kpi ? `KPI: ${proc.kpi}` : null,
        ].filter(Boolean).join("\n");
        resolved = resolved.replaceAll(`{{process:${name}}}`, `[Process data for "${name}":\n${summary}]`);
      } else {
        resolved = resolved.replaceAll(`{{process:${name}}}`, `[Process "${name}" not found]`);
      }
    }
  }

  // Resolve {{fieldName}} — inject sampled values across all processes
  const fieldMatches = resolved.match(/\{\{(\w+)\}\}/g);
  if (fieldMatches && fieldMatches.length > 0) {
    const processes = await db.select().from(processesTable).orderBy(processesTable.number).limit(50);
    const allFields = [...new Set(fieldMatches.map(m => m.slice(2, -2)))];
    for (const field of allFields) {
      const values = processes.map((p: any) => p[field]).filter(Boolean);
      const sample = values.slice(0, 10).join("; ");
      resolved = resolved.replaceAll(`{{${field}}}`, `[${field} data: ${sample}]`);
    }
  }

  return resolved;
}

// ── Helper: run agent against Claude ────────────────────────────────────────

async function runAgentExecution(agentId: number, scheduleId?: number): Promise<string> {
  const agent = await getAgentFull(agentId);
  if (!agent) throw new Error("Agent not found");

  // Deduct 1 credit for scheduled agent runs (uses tenant from the agent record)
  if (agent.tenantId) {
    const credit = await useCredit(agent.tenantId);
    if (!credit.ok) throw new Error("Insufficient credits for scheduled agent run");
  }

  const urlContents = await Promise.all(agent.urls.map(u => fetchUrlContent(u.url)));
  const fileContents = agent.files.map(f => readFileContent(f.filePath, f.mimeType, f.originalName));
  const resolvedInstructions = await resolveInstructions(agent.instructions);
  const toolsList = (() => { try { return JSON.parse(agent.tools); } catch { return []; } })();

  const knowledgeSection = [...urlContents, ...fileContents].filter(Boolean).join("\n\n---\n\n");

  const systemPrompt = `You are an AI Agent named "${agent.name}".

## Your Instructions
${resolvedInstructions || "No specific instructions provided."}

## Your Tools
${toolsList.length > 0 ? toolsList.join(", ") : "No specific tools configured."}

## Knowledge Base
${knowledgeSection || "No knowledge sources configured."}

Execute your instructions carefully and thoroughly. Provide a detailed, structured output of your work.`;

  const [logEntry] = await db.insert(agentRunLogsTable).values({
    agentId,
    scheduleId: scheduleId ?? null,
    status: "running",
    output: "",
  }).returning();

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: "Execute your instructions and provide your output." }],
    });

    const output = message.content.map((c: any) => c.type === "text" ? c.text : "").join("");
    await db.update(agentRunLogsTable)
      .set({ status: "success", output, completedAt: new Date() })
      .where(eq(agentRunLogsTable.id, logEntry.id));
    return output;
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    await db.update(agentRunLogsTable)
      .set({ status: "error", error: errMsg, completedAt: new Date() })
      .where(eq(agentRunLogsTable.id, logEntry.id));
    throw err;
  }
}

// ── CRUD: Agents ──────────────────────────────────────────────────────────────

router.get("/ai-agents", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const agentQuery = db.select().from(aiAgentsTable);
    const agents = auth?.tenantId
      ? await agentQuery.where(eq(aiAgentsTable.tenantId, auth.tenantId)).orderBy(aiAgentsTable.agentNumber)
      : await agentQuery.orderBy(aiAgentsTable.agentNumber);
    const withCounts = await Promise.all(agents.map(async a => {
      const urls = await db.select().from(agentKnowledgeUrlsTable).where(eq(agentKnowledgeUrlsTable.agentId, a.id));
      const files = await db.select().from(agentKnowledgeFilesTable).where(eq(agentKnowledgeFilesTable.agentId, a.id));
      const schedules = await db.select().from(agentSchedulesTable).where(eq(agentSchedulesTable.agentId, a.id));
      return { ...a, urlCount: urls.length, fileCount: files.length, scheduleCount: schedules.length };
    }));
    res.json(withCounts);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/ai-agents/:id", async (req, res) => {
  try {
    const agent = await getAgentFull(Number(req.params.id));
    if (!agent) return res.status(404).json({ error: "Not found" });
    res.json(agent);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function getRequestAuth(req: any): { userId: number | null; tenantId: number | null } {
  const auth = req.auth;
  if (auth) return { userId: auth.userId, tenantId: auth.tenantId ?? null };
  const h = req.headers['x-user-id'];
  return { userId: h ? parseInt(h as string) : null, tenantId: null };
}

router.post("/ai-agents", async (req, res) => {
  try {
    const { userId, tenantId } = getRequestAuth(req);
    const tenantCond = tenantId ? eq(aiAgentsTable.tenantId, tenantId) : undefined;
    const query = db.select({ val: max(aiAgentsTable.agentNumber) }).from(aiAgentsTable);
    const [maxNum] = tenantCond ? await query.where(tenantCond) : await query;
    const nextNum = (maxNum?.val ?? 0) + 1;
    const { name = "New Agent", description = "", instructions = "", trigger = "", tools = "[]" } = req.body as Record<string, string>;
    const [agent] = await db.insert(aiAgentsTable).values({ agentNumber: nextNum, name, description, instructions, trigger, tools, createdBy: userId ?? undefined, tenantId }).returning();
    await db.insert(agentModuleAccess).values(
      ALL_MODULES.map(module => ({ agentId: agent.id, module, hasAccess: false }))
    );
    res.status(201).json(agent);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/ai-agents/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { agentNumber, name, description, instructions, runMode, trigger, tools, outputDestType, outputDestId } = req.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (agentNumber !== undefined) updates.agentNumber = Number(agentNumber);
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (instructions !== undefined) updates.instructions = instructions;
    if (runMode !== undefined) updates.runMode = runMode;
    if (trigger !== undefined) updates.trigger = trigger;
    if (tools !== undefined) updates.tools = typeof tools === "string" ? tools : JSON.stringify(tools);
    if (outputDestType !== undefined) updates.outputDestType = outputDestType || null;
    if (outputDestId !== undefined) updates.outputDestId = outputDestId ? Number(outputDestId) : null;
    const [agent] = await db.update(aiAgentsTable).set(updates).where(eq(aiAgentsTable.id, id)).returning();
    if (!agent) return res.status(404).json({ error: "Not found" });
    res.json(agent);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/ai-agents/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const files = await db.select().from(agentKnowledgeFilesTable).where(eq(agentKnowledgeFilesTable.agentId, id));
    for (const f of files) {
      try { fs.unlinkSync(f.filePath); } catch {}
    }
    await db.delete(aiAgentsTable).where(eq(aiAgentsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Knowledge: URLs ───────────────────────────────────────────────────────────

router.get("/ai-agents/:id/knowledge/urls", async (req, res) => {
  try {
    const urls = await db.select().from(agentKnowledgeUrlsTable)
      .where(eq(agentKnowledgeUrlsTable.agentId, Number(req.params.id)))
      .orderBy(agentKnowledgeUrlsTable.createdAt);
    res.json(urls);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ai-agents/:id/knowledge/urls", async (req, res) => {
  try {
    const { url, label = "" } = req.body as { url: string; label?: string };
    if (!url) return res.status(400).json({ error: "url is required" });
    const [entry] = await db.insert(agentKnowledgeUrlsTable).values({ agentId: Number(req.params.id), url, label }).returning();
    res.status(201).json(entry);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/ai-agents/:id/knowledge/urls/:urlId", async (req, res) => {
  try {
    await db.delete(agentKnowledgeUrlsTable).where(eq(agentKnowledgeUrlsTable.id, Number(req.params.urlId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Knowledge: Files ──────────────────────────────────────────────────────────

router.post("/ai-agents/:id/knowledge/files", upload.array("files", 20), async (req, res) => {
  try {
    const agentId = Number(req.params.id);
    const uploadedFiles = req.files as Express.Multer.File[];
    if (!uploadedFiles?.length) return res.status(400).json({ error: "No files uploaded" });
    const inserted = await Promise.all(uploadedFiles.map(f =>
      db.insert(agentKnowledgeFilesTable).values({
        agentId,
        originalName: f.originalname,
        storedName: f.filename,
        mimeType: f.mimetype,
        fileSize: f.size,
        filePath: f.path,
      }).returning().then(r => r[0])
    ));
    res.status(201).json(inserted);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/ai-agents/files/:fileId", async (req, res) => {
  try {
    const [file] = await db.select().from(agentKnowledgeFilesTable).where(eq(agentKnowledgeFilesTable.id, Number(req.params.fileId)));
    if (!file) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
    res.sendFile(path.resolve(file.filePath));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/ai-agents/:id/knowledge/files/:fileId", async (req, res) => {
  try {
    const [file] = await db.select().from(agentKnowledgeFilesTable).where(eq(agentKnowledgeFilesTable.id, Number(req.params.fileId)));
    if (file) {
      try { fs.unlinkSync(file.filePath); } catch {}
      await db.delete(agentKnowledgeFilesTable).where(eq(agentKnowledgeFilesTable.id, file.id));
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Schedules ─────────────────────────────────────────────────────────────────

router.get("/ai-agents/:id/schedules", async (req, res) => {
  try {
    const schedules = await db.select().from(agentSchedulesTable)
      .where(eq(agentSchedulesTable.agentId, Number(req.params.id)))
      .orderBy(desc(agentSchedulesTable.createdAt));
    res.json(schedules);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ai-agents/:id/schedules", async (req, res) => {
  try {
    const { scheduleType = "once", scheduledAt } = req.body as { scheduleType: string; scheduledAt: string };
    if (!scheduledAt) return res.status(400).json({ error: "scheduledAt is required" });
    const schedAt = new Date(scheduledAt);
    const [sched] = await db.insert(agentSchedulesTable).values({
      agentId: Number(req.params.id),
      scheduleType,
      scheduledAt: schedAt,
      nextRunAt: schedAt,
      isActive: true,
    }).returning();
    res.status(201).json(sched);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/ai-agents/:id/schedules/:schedId", async (req, res) => {
  try {
    const { isActive } = req.body as { isActive: boolean };
    const [sched] = await db.update(agentSchedulesTable)
      .set({ isActive })
      .where(eq(agentSchedulesTable.id, Number(req.params.schedId)))
      .returning();
    if (!sched) return res.status(404).json({ error: "Not found" });
    res.json(sched);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/ai-agents/:id/schedules/:schedId", async (req, res) => {
  try {
    await db.delete(agentSchedulesTable).where(eq(agentSchedulesTable.id, Number(req.params.schedId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Run Agent ─────────────────────────────────────────────────────────────────

router.post("/ai-agents/:id/run", async (req, res) => {
  try {
    const agentId = Number(req.params.id);
    const agent = await getAgentFull(agentId);
    if (!agent) return res.status(404).json({ error: "Not found" });

    const urlContents = await Promise.all(agent.urls.map(u => fetchUrlContent(u.url)));
    const fileContents = agent.files.map(f => readFileContent(f.filePath, f.mimeType, f.originalName));
    const resolvedInstructions = await resolveInstructions(agent.instructions);
    const toolsList = (() => { try { return JSON.parse(agent.tools); } catch { return []; } })();
    const knowledgeSection = [...urlContents, ...fileContents].filter(Boolean).join("\n\n---\n\n");

    const systemPrompt = `You are an AI Agent named "${agent.name}".

## Your Instructions
${resolvedInstructions || "No specific instructions provided."}

## Your Tools
${toolsList.length > 0 ? toolsList.join(", ") : "No specific tools configured."}

## Knowledge Base
${knowledgeSection || "No knowledge sources configured."}

Execute your instructions carefully and thoroughly. Provide a detailed, structured output of your work.`;

    // Deduct 1 credit for this AI agent run
    const tenantId = req.auth?.tenantId;
    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) {
        res.status(402).json({ error: "Insufficient credits. Please contact your administrator." });
        return;
      }
    }

    const [logEntry] = await db.insert(agentRunLogsTable).values({
      agentId,
      status: "running",
      output: "",
    }).returning();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullOutput = "";

    const stream = await anthropic.messages.stream({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: "Execute your instructions and provide your output." }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        fullOutput += chunk.delta.text;
        res.write(`data: ${JSON.stringify({ content: chunk.delta.text })}\n\n`);
      }
    }

    await db.update(agentRunLogsTable)
      .set({ status: "success", output: fullOutput, completedAt: new Date() })
      .where(eq(agentRunLogsTable.id, logEntry.id));

    res.write(`data: ${JSON.stringify({ done: true, logId: logEntry.id })}\n\n`);
    res.end();
  } catch (err: any) {
    req.log.error(err);
    res.write(`data: ${JSON.stringify({ error: err?.message ?? "Run failed" })}\n\n`);
    res.end();
  }
});

// ── Test Agent (with evaluation) ──────────────────────────────────────────────

router.post("/ai-agents/:id/test", async (req, res) => {
  try {
    const agentId = Number(req.params.id);
    const { testScenario = "" } = req.body as { testScenario?: string };

    const agent = await getAgentFull(agentId);
    if (!agent) return res.status(404).json({ error: "Not found" });

    const tenantId = req.auth?.tenantId;
    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) {
        res.status(402).json({ error: "Insufficient credits. Please contact your administrator." });
        return;
      }
    }

    const urlContents = await Promise.all(agent.urls.map(u => fetchUrlContent(u.url)));
    const fileContents = agent.files.map(f => readFileContent(f.filePath, f.mimeType, f.originalName));
    const resolvedInstructions = await resolveInstructions(agent.instructions);
    const toolsList = (() => { try { return JSON.parse(agent.tools); } catch { return []; } })();
    const knowledgeSection = [...urlContents, ...fileContents].filter(Boolean).join("\n\n---\n\n");

    const systemPrompt = `You are an AI Agent named "${agent.name}".

## Your Instructions
${resolvedInstructions || "No specific instructions provided."}

## Your Tools
${toolsList.length > 0 ? toolsList.join(", ") : "No specific tools configured."}

## Knowledge Base
${knowledgeSection || "No knowledge sources configured."}

Execute your instructions carefully and thoroughly. Provide a detailed, structured output of your work.`;

    const userMessage = testScenario
      ? `Test scenario: ${testScenario}\n\nPlease execute your instructions for this test scenario and provide your output.`
      : "Execute your instructions and provide your output.";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullOutput = "";

    const stream = await anthropic.messages.stream({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        fullOutput += chunk.delta.text;
        res.write(`data: ${JSON.stringify({ content: chunk.delta.text })}\n\n`);
      }
    }

    // Generate evaluation rubric using a fast model
    res.write(`data: ${JSON.stringify({ evaluating: true })}\n\n`);

    const evalMessage = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are evaluating the output of an AI agent.

Agent name: ${agent.name}
Agent instructions: ${resolvedInstructions?.slice(0, 800) || "(none)"}
Test scenario: ${testScenario || "(standard run — no specific scenario)"}

Agent output:
${fullOutput.slice(0, 3000)}

Create 4–5 evaluation criteria for this specific agent and its output. For each criterion:
- criterion: concise name (e.g. "Instruction Following", "Output Completeness", "Accuracy")
- description: one sentence explaining what this criterion measures
- rating: integer 1–5 (1=very poor, 2=poor, 3=adequate, 4=good, 5=excellent) based on what you observed
- notes: 1–2 sentences of specific, actionable feedback about this criterion

Return ONLY valid JSON — a JSON array with no surrounding text. Example format:
[{"criterion":"Instruction Following","description":"How closely the agent adhered to its instructions","rating":4,"notes":"The agent covered the main points but omitted X."}]`,
      }],
    });

    const evalText = evalMessage.content.map((c: any) => c.type === "text" ? c.text : "").join("");
    let evaluations: any[] = [];
    try {
      const match = evalText.match(/\[[\s\S]*\]/);
      if (match) evaluations = JSON.parse(match[0]);
    } catch {}

    res.write(`data: ${JSON.stringify({ done: true, evaluations })}\n\n`);
    res.end();
  } catch (err: any) {
    req.log.error(err, "Test agent failed");
    res.write(`data: ${JSON.stringify({ error: err?.message ?? "Test failed" })}\n\n`);
    res.end();
  }
});

// ── Run Logs ──────────────────────────────────────────────────────────────────

router.get("/ai-agents/:id/logs", async (req, res) => {
  try {
    const logs = await db.select().from(agentRunLogsTable)
      .where(eq(agentRunLogsTable.agentId, Number(req.params.id)))
      .orderBy(desc(agentRunLogsTable.startedAt))
      .limit(20);
    res.json(logs);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Process Fields (for "/" command) ─────────────────────────────────────────

router.get("/ai-agents/meta/process-fields", async (_req, res) => {
  const fields = [
    { key: "process",      label: "Process",              hasSublist: true },
    { key: "category",     label: "Category" },
    { key: "aiAgent",      label: "AI Agent" },
    { key: "target",       label: "Target" },
    { key: "achievement",  label: "Achievement" },
    { key: "trafficLight", label: "Traffic Light Status" },
    { key: "included",     label: "In Portfolio" },
  ];
  res.json(fields);
});

// ── Background Scheduler (runs every 60 seconds) ──────────────────────────────

async function runScheduler() {
  try {
    const now = new Date();
    const dueSchedules = await db.select().from(agentSchedulesTable)
      .where(sql`${agentSchedulesTable.isActive} = true AND ${agentSchedulesTable.nextRunAt} <= ${now}`);

    for (const sched of dueSchedules) {
      try {
        await runAgentExecution(sched.agentId, sched.id);

        let nextRun: Date | null = null;
        if (sched.scheduleType === "daily") {
          nextRun = new Date(sched.nextRunAt!);
          nextRun.setDate(nextRun.getDate() + 1);
        } else if (sched.scheduleType === "weekly") {
          nextRun = new Date(sched.nextRunAt!);
          nextRun.setDate(nextRun.getDate() + 7);
        } else if (sched.scheduleType === "monthly") {
          nextRun = new Date(sched.nextRunAt!);
          nextRun.setMonth(nextRun.getMonth() + 1);
        }

        await db.update(agentSchedulesTable)
          .set({
            lastRunAt: now,
            nextRunAt: nextRun,
            isActive: nextRun !== null,
          })
          .where(eq(agentSchedulesTable.id, sched.id));
      } catch {}
    }
  } catch {}
}

setInterval(runScheduler, 60_000);

// ── Agent Permissions ──────────────────────────────────────────────────────────

router.get("/:id/permissions", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [modules, categories, procs, fields] = await Promise.all([
      db.select().from(agentModuleAccess).where(eq(agentModuleAccess.agentId, id)),
      db.select().from(agentAllowedCategories).where(eq(agentAllowedCategories.agentId, id)),
      db.select().from(agentAllowedProcesses).where(eq(agentAllowedProcesses.agentId, id)),
      db.select().from(agentFieldPermissions).where(eq(agentFieldPermissions.agentId, id)),
    ]);
    res.json({ modules, categories, processes: procs, fields });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/:id/permissions/modules", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { modules } = req.body as { modules: { module: string; hasAccess: boolean }[] };
    await db.delete(agentModuleAccess).where(eq(agentModuleAccess.agentId, id));
    if (modules?.length) {
      await db.insert(agentModuleAccess).values(modules.map(m => ({ agentId: id, module: m.module, hasAccess: m.hasAccess })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/:id/permissions/categories", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { categories } = req.body as { categories: string[] };
    await db.delete(agentAllowedCategories).where(eq(agentAllowedCategories.agentId, id));
    if (categories?.length) {
      await db.insert(agentAllowedCategories).values(categories.map(c => ({ agentId: id, category: c })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/:id/permissions/processes", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { processes } = req.body as { processes: { processId: number; canEdit: boolean }[] };
    await db.delete(agentAllowedProcesses).where(eq(agentAllowedProcesses.agentId, id));
    if (processes?.length) {
      await db.insert(agentAllowedProcesses).values(processes.map(p => ({ agentId: id, processId: p.processId, canEdit: p.canEdit })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/:id/permissions/field-permissions", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { permissions } = req.body as { permissions: { catalogueType: string; fieldKey: string; canView: boolean; canEdit: boolean }[] };
    await db.delete(agentFieldPermissions).where(eq(agentFieldPermissions.agentId, id));
    if (permissions?.length) {
      await db.insert(agentFieldPermissions).values(permissions.map(p => ({ agentId: id, catalogueType: p.catalogueType, fieldKey: p.fieldKey, canView: p.canView, canEdit: p.canEdit })));
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Agent Shares ───────────────────────────────────────────────────────────────

router.get("/ai-agents/:id/shares", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const shares = await db.select().from(agentShares).where(eq(agentShares.agentId, id));
    res.json(shares);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/ai-agents/:id/shares", async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const id = parseInt(req.params.id);
    const agent = await db.select().from(aiAgentsTable).where(eq(aiAgentsTable.id, id));
    if (!agent.length) return res.status(404).json({ error: "Not found" });
    const isOwner = agent[0].createdBy === userId;
    const userRoleRow = userId ? await db.select({ role: users.role }).from(users).where(eq(users.id, userId)) : [];
    const isAdmin = userRoleRow[0]?.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: "No share access" });
    const { shares } = req.body as { shares: { sharedWithUserId?: number; sharedWithRoleId?: number; sharedWithGroupId?: number; privilege: string }[] };
    await db.delete(agentShares).where(eq(agentShares.agentId, id));
    if (shares?.length) {
      await db.insert(agentShares).values(shares.map(s => ({ agentId: id, ...s })));
    }
    const result = await db.select().from(agentShares).where(eq(agentShares.agentId, id));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
