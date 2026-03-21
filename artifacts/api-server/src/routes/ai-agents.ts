import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  db, processesTable,
  aiAgentsTable, agentKnowledgeUrlsTable, agentKnowledgeFilesTable,
  agentSchedulesTable, agentRunLogsTable,
} from "@workspace/db";
import { eq, desc, max, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

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
  const fieldMatches = instructions.match(/\{\{(\w+)\}\}/g);
  if (!fieldMatches || fieldMatches.length === 0) return instructions;
  const processes = await db.select().from(processesTable).orderBy(processesTable.number).limit(50);
  let resolved = instructions;
  const allFields = [...new Set(fieldMatches.map(m => m.slice(2, -2)))];
  for (const field of allFields) {
    const values = processes.map((p: any) => p[field]).filter(Boolean);
    const sample = values.slice(0, 10).join("; ");
    resolved = resolved.replaceAll(`{{${field}}}`, `[${field} data: ${sample}]`);
  }
  return resolved;
}

// ── Helper: run agent against Claude ────────────────────────────────────────

async function runAgentExecution(agentId: number, scheduleId?: number): Promise<string> {
  const agent = await getAgentFull(agentId);
  if (!agent) throw new Error("Agent not found");

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
    const agents = await db.select().from(aiAgentsTable).orderBy(aiAgentsTable.agentNumber);
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

router.post("/ai-agents", async (req, res) => {
  try {
    const [maxNum] = await db.select({ val: max(aiAgentsTable.agentNumber) }).from(aiAgentsTable);
    const nextNum = (maxNum?.val ?? 0) + 1;
    const { name = "New Agent", description = "", instructions = "", tools = "[]" } = req.body as Record<string, string>;
    const [agent] = await db.insert(aiAgentsTable).values({ agentNumber: nextNum, name, description, instructions, tools }).returning();
    res.status(201).json(agent);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/ai-agents/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { agentNumber, name, description, instructions, tools } = req.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (agentNumber !== undefined) updates.agentNumber = Number(agentNumber);
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (instructions !== undefined) updates.instructions = instructions;
    if (tools !== undefined) updates.tools = typeof tools === "string" ? tools : JSON.stringify(tools);
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

export default router;
