import { Router, type IRouter } from "express";
import fs from "fs";
import {
  db, formsTable, formFoldersTable, formSubmissionsTable,
  aiAgentsTable, agentKnowledgeUrlsTable, agentKnowledgeFilesTable, agentRunLogsTable, processesTable,
} from "@workspace/db";
import { eq, max, and, desc, isNull } from "drizzle-orm";
import crypto from "crypto";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

// ── Agent trigger helper ──────────────────────────────────────────────────────

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

function readFileContent(filePath: string, mimeType: string, originalName: string): string {
  try {
    if (!fs.existsSync(filePath)) return `[File not found: ${originalName}]`;
    if (mimeType.includes("text") || originalName.endsWith(".txt") || originalName.endsWith(".md") || originalName.endsWith(".csv")) {
      return `File: ${originalName}\n${fs.readFileSync(filePath, "utf8").slice(0, 5000)}`;
    }
    return `File: ${originalName} [Binary file, ${mimeType}]`;
  } catch {
    return `[Error reading ${originalName}]`;
  }
}

async function resolveInstructions(instructions: string): Promise<string> {
  if (!instructions) return instructions;
  let resolved = instructions;
  const processNameMatches = instructions.match(/\{\{process:([^}]+)\}\}/g);
  if (processNameMatches) {
    const processes = await db.select().from(processesTable).orderBy(processesTable.number);
    const uniqueNames = [...new Set(processNameMatches.map((m: string) => m.slice(10, -2).trim()))];
    for (const name of uniqueNames) {
      const proc = processes.find((p: any) =>
        p.processName?.toLowerCase() === name.toLowerCase() ||
        p.processDescription?.toLowerCase() === name.toLowerCase()
      );
      if (proc) {
        const summary = [
          `Process: ${proc.processName || proc.processDescription}`,
          (proc as any).purpose ? `Purpose: ${(proc as any).purpose}` : null,
          (proc as any).inputs ? `Inputs: ${(proc as any).inputs}` : null,
          (proc as any).outputs ? `Outputs: ${(proc as any).outputs}` : null,
          (proc as any).kpi ? `KPI: ${(proc as any).kpi}` : null,
        ].filter(Boolean).join("\n");
        resolved = resolved.replaceAll(`{{process:${name}}}`, `[Process data for "${name}":\n${summary}]`);
      } else {
        resolved = resolved.replaceAll(`{{process:${name}}}`, `[Process "${name}" not found]`);
      }
    }
  }
  const fieldMatches = resolved.match(/\{\{(\w+)\}\}/g);
  if (fieldMatches && fieldMatches.length > 0) {
    const processes = await db.select().from(processesTable).orderBy(processesTable.number).limit(50);
    const allFields = [...new Set(fieldMatches.map((m: string) => m.slice(2, -2)))];
    for (const field of allFields) {
      const values = processes.map((p: any) => p[field]).filter(Boolean);
      const sample = values.slice(0, 10).join("; ");
      resolved = resolved.replaceAll(`{{${field}}}`, `[${field} data: ${sample}]`);
    }
  }
  return resolved;
}

async function triggerAgentWithSubmission(
  agentId: number,
  formName: string,
  submissionData: string,
  submittedByName: string,
  tenantId: number | null,
): Promise<void> {
  const [agent] = await db.select().from(aiAgentsTable).where(eq(aiAgentsTable.id, agentId));
  if (!agent) return;

  const urls = await db.select().from(agentKnowledgeUrlsTable).where(eq(agentKnowledgeUrlsTable.agentId, agentId));
  const files = await db.select().from(agentKnowledgeFilesTable).where(eq(agentKnowledgeFilesTable.agentId, agentId));

  const urlContents = await Promise.all(urls.map((u: any) => fetchUrlContent(u.url)));
  const fileContents = files.map((f: any) => readFileContent(f.filePath, f.mimeType, f.originalName));
  const resolvedInstructions = await resolveInstructions(agent.instructions ?? "");
  const toolsList = (() => { try { return JSON.parse(agent.tools ?? "[]"); } catch { return []; } })();
  const knowledgeSection = [...urlContents, ...fileContents].filter(Boolean).join("\n\n---\n\n");

  const systemPrompt = `You are an AI Agent named "${agent.name}".

## Your Instructions
${resolvedInstructions || "No specific instructions provided."}

## Your Tools
${toolsList.length > 0 ? toolsList.join(", ") : "No specific tools configured."}

## Knowledge Base
${knowledgeSection || "No knowledge sources configured."}

A new form submission has arrived. Process it according to your instructions and provide a detailed, structured output.`;

  let parsedData: Record<string, any> = {};
  try { parsedData = JSON.parse(submissionData); } catch { /* ignore */ }
  const fieldLines = Object.entries(parsedData)
    .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");

  const userMessage = `A new submission has been received for the form "${formName}".

Submitted by: ${submittedByName || "Anonymous"}
Submitted at: ${new Date().toISOString()}

## Form Data
${fieldLines || "(no fields captured)"}

Please process this submission according to your instructions.`;

  const [logEntry] = await db.insert(agentRunLogsTable).values({
    agentId,
    status: "running",
    output: "",
  }).returning();

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const output = message.content.map((c: any) => c.type === "text" ? c.text : "").join("");
    await db.update(agentRunLogsTable)
      .set({ status: "success", output, completedAt: new Date() })
      .where(eq(agentRunLogsTable.id, logEntry.id));
  } catch (err: any) {
    await db.update(agentRunLogsTable)
      .set({ status: "error", error: err?.message ?? String(err), completedAt: new Date() })
      .where(eq(agentRunLogsTable.id, logEntry.id));
  }
}

// ── Form Folders ─────────────────────────────────────────────────────────────

const MASTER_CATALOGUE_CATEGORIES = [
  "Finance & Compliance",
  "Fundraising & Donor Management",
  "Grant Management",
  "HR, Volunteers & Talent",
  "Marketing, Brand & Communications",
  "Program Delivery & Operations",
  "Strategy & Governance",
  "Technology & Data",
];

async function seedCategoryFolders(tenantId: number | null) {
  const rootCond = tenantId !== null
    ? and(eq(formFoldersTable.tenantId, tenantId), isNull(formFoldersTable.parentId))
    : isNull(formFoldersTable.parentId);
  const existing = await db.select({ name: formFoldersTable.name }).from(formFoldersTable).where(rootCond);
  const existingNames = new Set(existing.map(r => r.name));
  const missing = MASTER_CATALOGUE_CATEGORIES.filter(cat => !existingNames.has(cat));
  if (missing.length > 0) {
    await db.insert(formFoldersTable).values(
      missing.map(name => ({ name, parentId: null, tenantId: tenantId ?? null }))
    );
  }
}

router.get("/form-folders", async (req, res) => {
  try {
    const auth = (req as any).auth;
    // Auto-seed master category folders for this tenant if any are missing
    if (auth?.tenantId !== undefined) {
      await seedCategoryFolders(auth.tenantId ?? null);
    }
    const query = db.select().from(formFoldersTable);
    const folders = auth?.tenantId
      ? await query.where(eq(formFoldersTable.tenantId, auth.tenantId)).orderBy(formFoldersTable.createdAt)
      : await query.orderBy(formFoldersTable.createdAt);
    res.json(folders);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/form-folders", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId = auth?.tenantId ?? null;
    const { name = "New Folder", parentId = null } = req.body as Record<string, any>;
    const [folder] = await db.insert(formFoldersTable).values({
      name: String(name).trim() || "New Folder",
      parentId: parentId ? Number(parentId) : null,
      tenantId,
    }).returning();
    res.status(201).json(folder);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/form-folders/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const { name } = req.body as Record<string, any>;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const cond = auth?.tenantId
      ? and(eq(formFoldersTable.id, id), eq(formFoldersTable.tenantId, auth.tenantId))
      : eq(formFoldersTable.id, id);
    const [folder] = await db.update(formFoldersTable).set({ name: String(name).trim() }).where(cond).returning();
    if (!folder) return res.status(404).json({ error: "Not found" });
    res.json(folder);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/form-folders/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formFoldersTable.id, id), eq(formFoldersTable.tenantId, auth.tenantId))
      : eq(formFoldersTable.id, id);
    // Unassign any forms in this folder (cascade handled at DB level for subfolders)
    await db.update(formsTable).set({ folderId: null }).where(eq(formsTable.folderId, id));
    await db.delete(formFoldersTable).where(cond);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public form (no auth) ──────────────────────────────────────────────────────

router.get("/forms/public/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const [form] = await db.select().from(formsTable).where(
      and(eq(formsTable.publishSlug, slug), eq(formsTable.isPublished, true))
    );
    if (!form) return res.status(404).json({ error: "Form not found or not published" });
    res.json({ id: form.id, name: form.name, description: form.description, fields: form.fields });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Forms ─────────────────────────────────────────────────────────────────────

router.get("/forms", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const query = db.select().from(formsTable);
    const forms = auth?.tenantId
      ? await query.where(eq(formsTable.tenantId, auth.tenantId)).orderBy(formsTable.formNumber)
      : await query.orderBy(formsTable.formNumber);
    res.json(forms);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/forms/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formsTable.id, id), eq(formsTable.tenantId, auth.tenantId))
      : eq(formsTable.id, id);
    const [form] = await db.select().from(formsTable).where(cond);
    if (!form) return res.status(404).json({ error: "Not found" });
    res.json(form);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/forms", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId = auth?.tenantId ?? null;
    const tenantCond = tenantId ? eq(formsTable.tenantId, tenantId) : undefined;
    const query = db.select({ val: max(formsTable.formNumber) }).from(formsTable);
    const [maxNum] = tenantCond ? await query.where(tenantCond) : await query;
    const nextNum = (maxNum?.val ?? 0) + 1;
    const { name = "New Form", description = "", fields = "[]", folderId } = req.body as Record<string, any>;
    const [form] = await db.insert(formsTable).values({
      formNumber: nextNum, name, description, fields, tenantId,
      folderId: folderId ? Number(folderId) : null,
    }).returning();
    res.status(201).json(form);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/forms/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const { formNumber, name, description, fields, linkedWorkflowId, linkedAgentId, folderId } = req.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (formNumber !== undefined) updates.formNumber = Number(formNumber);
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (fields !== undefined) updates.fields = typeof fields === "string" ? fields : JSON.stringify(fields);
    if (linkedWorkflowId !== undefined) updates.linkedWorkflowId = linkedWorkflowId ? Number(linkedWorkflowId) : null;
    if (linkedAgentId !== undefined) updates.linkedAgentId = linkedAgentId ? Number(linkedAgentId) : null;
    if ('folderId' in req.body) updates.folderId = folderId ? Number(folderId) : null;
    const cond = auth?.tenantId
      ? and(eq(formsTable.id, id), eq(formsTable.tenantId, auth.tenantId))
      : eq(formsTable.id, id);
    const [form] = await db.update(formsTable).set(updates).where(cond).returning();
    if (!form) return res.status(404).json({ error: "Not found" });
    res.json(form);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/forms/:id/publish", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formsTable.id, id), eq(formsTable.tenantId, auth.tenantId))
      : eq(formsTable.id, id);
    const [existing] = await db.select().from(formsTable).where(cond);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const slug = existing.publishSlug ?? crypto.randomBytes(6).toString("hex");
    const [form] = await db.update(formsTable)
      .set({ publishSlug: slug, isPublished: true, updatedAt: new Date() })
      .where(cond)
      .returning();
    res.json(form);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/forms/:id/publish", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formsTable.id, id), eq(formsTable.tenantId, auth.tenantId))
      : eq(formsTable.id, id);
    const [form] = await db.update(formsTable)
      .set({ isPublished: false, updatedAt: new Date() })
      .where(cond)
      .returning();
    if (!form) return res.status(404).json({ error: "Not found" });
    res.json(form);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/forms/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const id = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formsTable.id, id), eq(formsTable.tenantId, auth.tenantId))
      : eq(formsTable.id, id);
    await db.delete(formsTable).where(cond);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Form Submissions ───────────────────────────────────────────────────────────

router.get("/forms/:id/submissions", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const formId = Number(req.params.id);
    const cond = auth?.tenantId
      ? and(eq(formSubmissionsTable.formId, formId), eq(formSubmissionsTable.tenantId, auth.tenantId))
      : eq(formSubmissionsTable.formId, formId);
    const submissions = await db.select().from(formSubmissionsTable).where(cond).orderBy(desc(formSubmissionsTable.createdAt));
    res.json(submissions);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/forms/:id/submissions", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const formId = Number(req.params.id);
    const tenantId = auth?.tenantId ?? null;
    const { submissionData = "{}", submittedByName = "" } = req.body as Record<string, any>;
    const dataStr = typeof submissionData === "string" ? submissionData : JSON.stringify(submissionData);
    const [submission] = await db.insert(formSubmissionsTable).values({
      formId,
      tenantId,
      submittedBy: auth?.userId ?? null,
      submittedByName: String(submittedByName),
      submissionData: dataStr,
    }).returning();

    // Fire-and-forget: trigger linked agent if configured
    const [form] = await db.select({ linkedAgentId: formsTable.linkedAgentId, name: formsTable.name })
      .from(formsTable).where(eq(formsTable.id, formId));
    if (form?.linkedAgentId) {
      triggerAgentWithSubmission(
        form.linkedAgentId,
        form.name,
        dataStr,
        String(submittedByName),
        tenantId,
      ).catch((err: any) => console.error("[form-agent-trigger]", err?.message ?? err));
    }

    res.status(201).json(submission);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/forms/:id/submissions/:submissionId", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const submissionId = Number(req.params.submissionId);
    const cond = auth?.tenantId
      ? and(eq(formSubmissionsTable.id, submissionId), eq(formSubmissionsTable.tenantId, auth.tenantId))
      : eq(formSubmissionsTable.id, submissionId);
    await db.delete(formSubmissionsTable).where(cond);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as formsRouter };
