import { Router, type IRouter } from "express";
import {
  db,
  conversations as conversationsTable,
  messages as messagesTable,
  processesTable,
  workflowsTable,
  activitiesTable,
  initiatives,
  aiAgentsTable,
  formsTable,
  checklistsTable,
  checklistItemsTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import type Anthropic from "@anthropic-ai/sdk";
import { useCredit } from "../lib/credits";
import { embed, vecToSql } from "../lib/embeddings.js";

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function strip(html: string, maxLen = 4000): string {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

// ─── RAG: vector + full-text knowledge search ─────────────────────────────────

async function searchKnowledgeBase(query: string, tenantId: number | null, limit = 6): Promise<string> {
  try {
    const queryVec = await embed(query);
    const embStr = vecToSql(queryVec);
    const tenantCond = tenantId ? sql`ki.tenant_id = ${tenantId}` : sql`ki.tenant_id IS NULL`;

    // 1. Vector similarity — knowledge_items
    const vecResult = await db.execute(
      sql`SELECT ki.id, ki.title, ki.content, ki.type, ki.url, ki.file_name,
               ff.name AS folder_name,
               1 - (ki.embedding_vec <=> ${embStr}::vector) AS similarity,
               'knowledge' AS source
            FROM knowledge_items ki
            LEFT JOIN form_folders ff ON ff.id = ki.folder_id
            WHERE ki.embedding_vec IS NOT NULL AND ${tenantCond}
            ORDER BY ki.embedding_vec <=> ${embStr}::vector
            LIMIT ${limit}`
    );
    const vecRows: any[] = vecResult.rows as any[];

    // 2. Vector similarity — governance_documents
    const govVecResult = await db.execute(
      sql`SELECT gd.id, gd.original_name AS title,
               left(gd.extracted_text, 6000) AS content,
               'governance_doc' AS type, NULL AS url, gd.original_name AS file_name,
               gs.compliance_name AS folder_name,
               1 - (gd.embedding_vec <=> ${embStr}::vector) AS similarity,
               'governance' AS source
            FROM governance_documents gd
            JOIN governance_standards gs ON gs.id = gd.governance_id
            WHERE gd.embedding_vec IS NOT NULL
            ORDER BY gd.embedding_vec <=> ${embStr}::vector
            LIMIT 4`
    );
    const govVecRows: any[] = govVecResult.rows as any[];

    // 3. Vector similarity — process_attachments
    const procTenantCond = tenantId ? sql`pa.tenant_id = ${tenantId}` : sql`pa.tenant_id IS NULL`;
    const procVecResult = await db.execute(
      sql`SELECT pa.id, pa.title,
               COALESCE(pa.extracted_text, pa.url, '') AS content,
               pa.type, pa.url, pa.file_name,
               p.process_name AS folder_name,
               1 - (pa.embedding_vec <=> ${embStr}::vector) AS similarity,
               'process_attachment' AS source
            FROM process_attachments pa
            LEFT JOIN processes p ON p.id = pa.process_id
            WHERE pa.embedding_vec IS NOT NULL AND ${procTenantCond}
            ORDER BY pa.embedding_vec <=> ${embStr}::vector
            LIMIT 4`
    );
    const procVecRows: any[] = procVecResult.rows as any[];

    // 4. Full-text keyword fallback for knowledge_items without embeddings
    const words = query.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
    const ftRows: any[] = [];
    if (words.length > 0) {
      const pattern = `%${words.join("%")}%`;
      const ftResult = await db.execute(
        sql`SELECT ki.id, ki.title, ki.content, ki.type, ki.url, ki.file_name,
                   ff.name AS folder_name, 0.0 AS similarity, 'knowledge' AS source
              FROM knowledge_items ki
              LEFT JOIN form_folders ff ON ff.id = ki.folder_id
              WHERE ${tenantCond}
                AND (lower(ki.title) LIKE lower(${pattern}) OR lower(ki.content) LIKE lower(${pattern}))
              LIMIT 4`
      );
      for (const r of (ftResult.rows as any[])) {
        if (!vecRows.find((v: any) => v.id === r.id)) ftRows.push(r);
      }
      // Full-text fallback for governance_documents
      const govFtResult = await db.execute(
        sql`SELECT gd.id, gd.original_name AS title,
                   left(gd.extracted_text, 6000) AS content,
                   'governance_doc' AS type, NULL AS url, gd.original_name AS file_name,
                   gs.compliance_name AS folder_name, 0.0 AS similarity, 'governance' AS source
              FROM governance_documents gd
              JOIN governance_standards gs ON gs.id = gd.governance_id
              WHERE lower(gd.original_name) LIKE lower(${pattern})
                 OR lower(gd.extracted_text) LIKE lower(${pattern})
              LIMIT 3`
      );
      for (const r of (govFtResult.rows as any[])) {
        if (!govVecRows.find((v: any) => v.id === r.id)) ftRows.push(r);
      }
      // Full-text fallback for process_attachments
      const procFtResult = await db.execute(
        sql`SELECT pa.id, pa.title,
                   COALESCE(pa.extracted_text, pa.url, '') AS content,
                   pa.type, pa.url, pa.file_name,
                   p.process_name AS folder_name, 0.0 AS similarity, 'process_attachment' AS source
              FROM process_attachments pa
              LEFT JOIN processes p ON p.id = pa.process_id
              WHERE ${procTenantCond}
                AND (lower(pa.title) LIKE lower(${pattern})
                  OR lower(COALESCE(pa.extracted_text, '')) LIKE lower(${pattern}))
              LIMIT 3`
      );
      for (const r of (procFtResult.rows as any[])) {
        if (!procVecRows.find((v: any) => v.id === r.id)) ftRows.push(r);
      }
    }

    const allRows = [...vecRows, ...govVecRows, ...procVecRows, ...ftRows];
    if (allRows.length === 0) return "";

    const snippets = allRows.map((r: any) => {
      const sim = parseFloat(r.similarity);
      const simLabel = sim > 0 ? ` | Match: ${Math.round(sim * 100)}%` : " | keyword match";
      const isGov = r.source === "governance";
      const isProc = r.source === "process_attachment";
      const location = isGov
        ? `Governance & Compliance > ${r.folder_name}`
        : isProc
          ? `Process Attachments > ${r.folder_name || "Unknown Process"}`
          : r.folder_name ? `Forms & Documents > ${r.folder_name}` : "Forms & Documents (root)";
      const idRef = isGov
        ? `governance://doc-${r.id}`
        : isProc
          ? `process://attachment-${r.id}`
          : `knowledge://item-${r.id}`;
      let body = strip(r.content ?? "", 5000);
      return `### [${r.title}](${idRef}) (${r.type}${simLabel})\n**Location:** ${location}${r.file_name ? ` | **File:** ${r.file_name}` : ""}\n\n${body || "(no content yet)"}`;
    }).join("\n\n---\n\n");

    return `## Knowledge Base, Governance & Process Documents (${allRows.length} results)\n\nWhen referencing knowledge items, use [Title](knowledge://item-{id}). For governance documents, use [Title](governance://doc-{id}). For process attachments, use [Title](process://attachment-{id}).\n\n${snippets}\n\n---`;
  } catch (err) {
    console.error("[rag] knowledge search failed:", err);
    return "";
  }
}

// ─── Full knowledge index for listing questions ────────────────────────────────

async function getAllKnowledgeSummary(tenantId: number | null): Promise<string> {
  try {
    const result = await db.execute(
      sql`SELECT ki.id, ki.title, ki.type, ki.url, ki.file_name,
                 ff.name AS folder_name
            FROM knowledge_items ki
            LEFT JOIN form_folders ff ON ff.id = ki.folder_id
            WHERE ${tenantId ? sql`ki.tenant_id = ${tenantId}` : sql`ki.tenant_id IS NULL`}
            ORDER BY ki.id`
    );
    const rows: any[] = result.rows as any[];

    if (rows.length === 0) return "## Knowledge Base\nNo documents stored yet.\n";

    const lines = rows.map((r: any) => {
      const loc = r.folder_name ? `📁 ${r.folder_name}` : "📁 Root";
      const ext = r.file_name ? ` [${r.file_name}]` : r.url ? ` → ${r.url}` : "";
      return `- [${r.title}](knowledge://item-${r.id}) | Type: ${r.type} | ${loc}${ext}`;
    });

    return `## All Knowledge Base Documents (${rows.length} total)\n\n${lines.join("\n")}\n`;
  } catch {
    return "";
  }
}

// ─── Detect query intent ───────────────────────────────────────────────────────

function isListingQuery(q: string): boolean {
  const lower = q.toLowerCase();
  return /\b(list|all|every|show me|what (documents?|files?|wikis?|knowledge)|how many docs|find all)\b/.test(lower);
}

// ─── Build comprehensive system prompt ────────────────────────────────────────

async function buildSystemPrompt(tenantId: number | null): Promise<string> {

  const [
    processes,
    workflows,
    activitiesList,
    initiativesList,
    agents,
    forms,
    checklists,
    checklistItems,
  ] = await Promise.all([
    db.select().from(processesTable)
      .where(tenantId ? eq(processesTable.tenantId, tenantId) : sql`1=1`)
      .orderBy(processesTable.number),
    db.select().from(workflowsTable)
      .where(tenantId ? eq(workflowsTable.tenantId, tenantId) : sql`1=1`)
      .orderBy(workflowsTable.workflowNumber),
    db.select().from(activitiesTable)
      .where(tenantId ? eq(activitiesTable.tenantId, tenantId) : sql`1=1`)
      .orderBy(activitiesTable.activityNumber),
    db.select().from(initiatives)
      .where(tenantId ? eq(initiatives.tenantId, tenantId) : sql`1=1`)
      .orderBy(initiatives.id),
    db.select().from(aiAgentsTable)
      .where(tenantId ? eq(aiAgentsTable.tenantId, tenantId) : sql`1=1`)
      .orderBy(aiAgentsTable.agentNumber),
    db.select().from(formsTable)
      .where(tenantId ? eq(formsTable.tenantId, tenantId) : sql`1=1`)
      .orderBy(formsTable.formNumber),
    db.select().from(checklistsTable)
      .where(tenantId ? eq(checklistsTable.tenantId, tenantId) : sql`1=1`)
      .orderBy(checklistsTable.id),
    db.select().from(checklistItemsTable).orderBy(checklistItemsTable.id),
  ]);

  // Processes — split into "in process map" (included=true) vs library (included=false)
  const inMap    = processes.filter(p => p.included);
  const notInMap = processes.filter(p => !p.included);

  const fmtProcess = (p: typeof processes[0]) =>
    `  [#${p.number}] ${p.processName || p.processDescription} | Category: ${p.category} | KPI: ${p.kpi || "—"} | Target: ${p.target || "—"} | Achievement: ${p.achievement || "—"} | Traffic light: ${p.trafficLight || "—"}`;

  const processSummary =
    `### Process Map (included = true): ${inMap.length} processes\n` +
    (inMap.length === 0 ? "  (none)" : inMap.map(fmtProcess).join("\n")) +
    `\n\n### Full Process Library (included = false, NOT in process map): ${notInMap.length} processes\n` +
    (notInMap.length === 0 ? "  (none)" : notInMap.map(fmtProcess).join("\n"));

  // Workflows
  const workflowSummary = workflows.length === 0 ? "None created yet." :
    workflows.map(w => {
      let stepCount = 0;
      try { stepCount = JSON.parse(w.steps).length; } catch {}
      return `[#${w.workflowNumber}] ${w.name} | Steps: ${stepCount} | ${w.description || "No description"}`;
    }).join("\n");

  // Activities
  const activitySummary = activitiesList.length === 0 ? "None created yet." :
    activitiesList.map(a =>
      `[#${a.activityNumber}] ${a.name} | Mode: ${a.mode} | ${a.description || "No description"}`
    ).join("\n");

  // Initiatives
  const initiativeSummary = initiativesList.length === 0 ? "None created yet." :
    initiativesList.map(i =>
      `[${i.initiativeId}] ${i.name} | Goals: ${i.goals || "—"} | Achievement: ${i.achievement || "—"} | Start: ${i.startDate ?? "—"} | End: ${i.endDate ?? "—"}`
    ).join("\n");

  // AI Agents
  const agentSummary = agents.length === 0 ? "None created yet." :
    agents.map(a =>
      `[#${a.agentNumber}] ${a.name} | Mode: ${a.runMode} | Trigger: ${a.trigger || "—"} | ${a.description || "No description"}`
    ).join("\n");

  // Forms
  const formSummary = forms.length === 0 ? "None created yet." :
    forms.map(f => {
      let fieldCount = 0;
      try { fieldCount = JSON.parse(f.fields).length; } catch {}
      return `[#${f.formNumber}] ${f.name} | Fields: ${fieldCount} | Published: ${f.isPublished ? "Yes" : "No"} | ${f.description || "No description"}`;
    }).join("\n");

  // Checklists + their items
  const checklistSummary = checklists.length === 0 ? "None created yet." :
    checklists.map(c => {
      const items = checklistItems.filter(ci => ci.checklistId === c.id);
      const itemLines = items.map(ci => `    • ${ci.name}${(ci as any).met ? " ✓" : ""}`).join("\n");
      return `[#${c.id}] ${c.name} | ${c.description || "No description"} | Items (${items.length}):\n${itemLines || "    (no items)"}`;
    }).join("\n\n");

  return `You are an expert business operations advisor embedded in BusinessOS — a comprehensive multi-tenant operating system. You have READ-ONLY access to the organisation's database.

## Your capabilities

1. Answer any question about processes, workflows, activities, initiatives, AI agents, forms, checklists, and knowledge base documents
2. Provide strategic analysis, gap identification, and actionable recommendations
3. Locate and link to specific knowledge base documents so users can navigate directly to them
4. Analyse performance data (KPIs, benchmarks, targets, achievements)
5. Explain relationships between processes, workflows, activities, and initiatives
6. Answer questions about document content for wikis and uploaded files

## Your identity

You are the **AI Assistant Agent**. Always use "AI Assistant Agent" as your agent_name when calling create_task.

## Task creation rules

You have two task tools — use the right one:

**\`suggest_task\`** — Use when the user explicitly asks to CREATE a task (and optionally assign it to a person or queue). This opens a pre-filled form for the user to review and confirm. The task is NOT saved until they click "Create Task". If you are missing important information (like who to assign to), set \`clarification_needed\` and the user will be prompted. Do not use \`create_task\` for this case.

**\`create_task\`** — Use ONLY when the user asks you to make a database change that needs human approval (update a record, create an activity, set a KPI, etc.). Include detailed \`ai_instructions\` so a human reviewer knows exactly what to do.

You cannot directly update or delete records. For all other database changes, use \`create_task\` with a clear \`ai_instructions\` field. After creating the task, the user will be asked which queue to route it to.

## Final action statement

At the end of EVERY response, add a line in this exact format (always on its own line at the very end):

**Final action taken:** [one-sentence summary of the most important thing you did — e.g. "Queried 12 processes for missing KPIs." or "Created a pending-approval task to update Process #5 KPI."]

## Document navigation links

ALWAYS link to knowledge base documents using: [Document Title](knowledge://item-{id})
This allows users to click and navigate directly. Example: [Employee Handbook](knowledge://item-1)

## Response format

Use markdown. Bold key terms. Tables for comparisons. Always confirm what was changed after tool use.

---

## LIVE DATABASE SNAPSHOT

### Processes (${processes.length} total | ${inMap.length} in process map | ${notInMap.length} in library only)

**IMPORTANT:** The "Process Map" is the organisation's active operational map — it contains only processes where \`included = true\`. When a user asks "how many processes are in the process map" or "how many processes does the organisation have", answer with **${inMap.length}** (not ${processes.length}). The ${notInMap.length} library processes exist in the database but are NOT displayed in the process map.

${processSummary}

---

### Workflows (${workflows.length} total)

${workflowSummary}

---

### Activities (${activitiesList.length} total)

${activitySummary}

---

### Initiatives (${initiativesList.length} total)

${initiativeSummary}

---

### AI Agents (${agents.length} total)

${agentSummary}

---

### Forms (${forms.length} total)

${formSummary}

---

### Checklists (${checklists.length} total)

${checklistSummary}

---`;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const DB_TOOLS: Anthropic.Tool[] = [
  {
    name: "query_database",
    description: "Run a read-only SQL SELECT query against the database to answer specific data questions. ONLY SELECT statements are allowed.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql_query: { type: "string", description: "A valid SQL SELECT query" },
      },
      required: ["sql_query"],
    },
  },
  {
    name: "suggest_task",
    description: "Use this when the user explicitly asks to CREATE a task and optionally assign it to a person or queue. This opens a pre-filled task creation form for the user to review and confirm — the task is NOT written to the database until the user clicks 'Create Task'. Do NOT use this for other database changes (updating records, creating activities, setting KPIs, etc.) — use create_task for those approval workflows.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Short, clear task title" },
        description: { type: "string", description: "What this task is about and why it is needed" },
        priority: { type: "string", enum: ["high", "normal", "low"], description: "Task priority based on what the user indicated" },
        assigned_to_name: { type: "string", description: "Full name of the user to assign to, if the user specified one (must match a real user name in the system)" },
        queue_name: { type: "string", description: "Name of the queue to route to, if the user specified one" },
        due_date: { type: "string", description: "ISO date string YYYY-MM-DD if the user mentioned a due date, otherwise omit" },
        clarification_needed: { type: "string", description: "If something important is missing or unclear (e.g. no assignee mentioned and you need one), describe what you need to know. Leave empty if the form can be shown as-is." },
      },
      required: ["name"],
    },
  },
  {
    name: "create_task",
    description: "Create a task that requires human approval before any action is taken. Use this ONLY when you identify a database change that needs to happen (update a record, create an activity, set a KPI, etc.) — describe exactly what to do in ai_instructions. A human will review and approve or reject. Do NOT use this just for creating a task — use suggest_task for that.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Short, clear task title" },
        description: { type: "string", description: "What this task is about and why it is needed" },
        ai_instructions: { type: "string", description: "Detailed instructions of exactly what actions should be carried out when a human approves this task" },
        priority: { type: "string", enum: ["high", "normal", "low"], description: "Task priority" },
        agent_name: { type: "string", description: "Always use 'AI Assistant Agent' for tasks created through the AI Assistant." },
      },
      required: ["name", "description", "ai_instructions"],
    },
  },
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, any>, tenantId: number | null, createdBy: number | null): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (name) {

      case "query_database": {
        const { sql_query } = input;
        const q = (sql_query as string).trim().toLowerCase();
        if (!q.startsWith("select")) return { success: false, message: "Only SELECT queries are permitted" };
        const result = await db.execute(sql.raw(sql_query));
        const rows = result.rows as any[];
        return { success: true, message: `Query returned ${rows.length} row(s)`, data: rows.slice(0, 50) };
      }

      case "suggest_task": {
        const { name, description = "", priority = "normal", assigned_to_name, queue_name, due_date, clarification_needed } = input;
        return {
          success: true,
          message: clarification_needed
            ? `Task form suggestion ready — clarification needed: ${clarification_needed}`
            : `Task form opened with pre-filled values for "${name}".`,
          data: { name, description, priority, assigned_to_name, queue_name, due_date, clarification_needed },
        };
      }

      case "create_task": {
        const { name, description = "", ai_instructions, priority = "normal", agent_name = "AI Assistant Agent" } = input;
        const fullDescription = description
          ? `${description}\n\nCreated by: ${agent_name}`
          : `Created by: ${agent_name}`;
        const result = await db.execute(sql`
          INSERT INTO tasks (tenant_id, name, description, priority, source, approval_status, ai_instructions, created_by)
          VALUES (${tenantId}, ${name}, ${fullDescription}, ${priority}, 'AI Agents', 'pending', ${ai_instructions}, ${createdBy})
          RETURNING id, task_number, name
        `);
        const task = (result.rows as any[])[0];
        return {
          success: true,
          message: `Task #${task.task_number} "${name}" created by ${agent_name} and is pending human approval. The user will be asked which queue to route this to.`,
          data: { task_id: task.id, task_number: task.task_number, task_name: name, agent_name },
        };
      }

      default:
        return { success: false, message: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { success: false, message: `Tool error: ${err.message}` };
  }
}

// ─── Conversations CRUD ───────────────────────────────────────────────────────

router.get("/anthropic/conversations", async (req, res) => {
  try {
    const convs = await db.select().from(conversationsTable).orderBy(desc(conversationsTable.createdAt));
    res.json(convs);
  } catch (err) {
    req.log.error(err, "Failed to list conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/anthropic/conversations", async (req, res) => {
  try {
    const { title } = req.body as { title: string };
    const [conv] = await db.insert(conversationsTable).values({ title }).returning();
    res.status(201).json(conv);
  } catch (err) {
    req.log.error(err, "Failed to create conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/anthropic/conversations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    const messages = await db.select().from(messagesTable).where(eq(messagesTable.conversationId, id)).orderBy(messagesTable.createdAt);
    res.json({ ...conv, messages });
  } catch (err) {
    req.log.error(err, "Failed to get conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/anthropic/conversations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(messagesTable).where(eq(messagesTable.conversationId, id));
    const [deleted] = await db.delete(conversationsTable).where(eq(conversationsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Conversation not found" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to delete conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/anthropic/conversations/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const messages = await db.select().from(messagesTable).where(eq(messagesTable.conversationId, id)).orderBy(messagesTable.createdAt);
    res.json(messages);
  } catch (err) {
    req.log.error(err, "Failed to list messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Send message (SSE streaming + agentic tool loop) ─────────────────────────

router.post("/anthropic/conversations/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { content } = req.body as { content: string };
    if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    await db.insert(messagesTable).values({ conversationId: id, role: "user", content: content.trim() });

    const history = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(messagesTable.createdAt);

    const tenantId = (req as any).auth?.tenantId ?? null;
    const createdBy = (req as any).auth?.userId ?? null;

    // Build system prompt and knowledge context in parallel
    const listing = isListingQuery(content.trim());
    const [systemPromptBase, knowledgeContext, allDocsContext] = await Promise.all([
      buildSystemPrompt(tenantId),
      searchKnowledgeBase(content.trim(), tenantId),
      listing ? getAllKnowledgeSummary(tenantId) : Promise.resolve(""),
    ]);

    const extraContext = [knowledgeContext, allDocsContext].filter(Boolean).join("\n\n");
    const systemPrompt = extraContext ? `${systemPromptBase}\n\n${extraContext}` : systemPromptBase;

    // Credit check
    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) {
        res.status(402).json({ error: "Insufficient credits. Please contact your administrator." });
        return;
      }
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (payload: object) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

    // Build conversation messages array for the agentic loop
    // We drop the last assistant message (added by the loop below) to avoid duplication
    const loopMessages: Anthropic.MessageParam[] = history
      .slice(0, -1) // exclude the user message we just inserted (we add it below)
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    loopMessages.push({ role: "user", content: content.trim() });

    let fullResponse = "";
    let iterations = 0;
    const MAX_ITERATIONS = 8;

    // ── Agentic loop ──────────────────────────────────────────────────────────
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Stream this turn
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        tools: DB_TOOLS,
        messages: loopMessages,
      });

      // Accumulate content blocks for this turn
      let turnText = "";
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
      let currentToolUse: { id: string; name: string; inputJson: string } | null = null;

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            currentToolUse = { id: event.content_block.id, name: event.content_block.name, inputJson: "" };
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            turnText += event.delta.text;
            fullResponse += event.delta.text;
            send({ content: event.delta.text });
          } else if (event.delta.type === "input_json_delta" && currentToolUse) {
            currentToolUse.inputJson += event.delta.partial_json;
          }
        } else if (event.type === "content_block_stop" && currentToolUse) {
          let parsedInput: Record<string, any> = {};
          try { parsedInput = JSON.parse(currentToolUse.inputJson); } catch {}
          toolUseBlocks.push({ type: "tool_use", id: currentToolUse.id, name: currentToolUse.name, input: parsedInput });
          currentToolUse = null;
        }
      }

      const finalMsg = await stream.finalMessage();

      // Add assistant turn to the loop messages
      const assistantContent: Anthropic.ContentBlock[] = [];
      if (turnText) assistantContent.push({ type: "text", text: turnText });
      for (const tb of toolUseBlocks) assistantContent.push(tb);
      loopMessages.push({ role: "assistant", content: assistantContent });

      // If no tool calls, we're done
      if (finalMsg.stop_reason !== "tool_use" || toolUseBlocks.length === 0) break;

      // Execute each tool and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tb of toolUseBlocks) {
        // Notify client a tool is being called
        send({ tool_call: { id: tb.id, name: tb.name, input: tb.input } });

        const result = await executeTool(tb.name, tb.input as Record<string, any>, tenantId, createdBy);

        // Notify client of result (include data so frontend can react, e.g. queue picker for create_task)
        send({ tool_result: { id: tb.id, name: tb.name, success: result.success, message: result.message, data: result.data } });

        // Add tool result string to fullResponse so it's persisted
        const resultLine = `\n\n> **Tool: ${tb.name}** — ${result.success ? "✓" : "✗"} ${result.message}`;
        fullResponse += resultLine;

        toolResults.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: JSON.stringify({ success: result.success, message: result.message, data: result.data }),
        });
      }

      // Add tool results as user message and continue loop
      loopMessages.push({ role: "user", content: toolResults });
    }

    // Persist final assistant message
    await db.insert(messagesTable).values({ conversationId: id, role: "assistant", content: fullResponse });

    send({ done: true });
    res.end();
  } catch (err) {
    req.log.error(err, "Failed to send message");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
      res.end();
    }
  }
});

export default router;
