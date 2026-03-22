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
               p.name AS folder_name,
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
                   p.name AS folder_name, 0.0 AS similarity, 'process_attachment' AS source
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
    db.select().from(processesTable).orderBy(processesTable.number),
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

  // Processes
  const processSummary = processes.map(p =>
    `[#${p.number}] ${p.processName || p.processDescription} | Category: ${p.category} | KPI: ${p.kpi || "—"} | Benchmark: ${p.industryBenchmark || "—"} | Target: ${p.target || "—"} | Achievement: ${p.achievement || "—"} | Traffic light: ${p.trafficLight || "—"} | Included: ${p.included ? "Yes" : "No"}`
  ).join("\n");

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
      const itemLines = items.map(ci => `    • ${ci.title}${ci.required ? " (required)" : ""}`).join("\n");
      return `[#${c.id}] ${c.name} | ${c.description || "No description"} | Items (${items.length}):\n${itemLines || "    (no items)"}`;
    }).join("\n\n");

  return `You are an expert business operations advisor embedded in BusinessOS — a comprehensive multi-tenant operating system. You have FULL ACCESS to the organisation's entire database and knowledge base.

## Your capabilities

1. Answer any question about processes, workflows, activities, initiatives, AI agents, forms, checklists, and knowledge base documents
2. Provide strategic analysis, gap identification, and actionable recommendations
3. Locate and link to specific knowledge base documents so users can navigate directly to them
4. Analyse performance data (KPIs, benchmarks, targets, achievements)
5. Explain relationships between processes, workflows, activities, and initiatives
6. Assist with Salesforce SOQL queries (READ ONLY — never suggest write operations)
7. Answer questions about document content for wikis and uploaded files

## Document navigation links

ALWAYS link to knowledge base documents using: [Document Title](knowledge://item-{id})
This allows users to click and navigate directly. Example: [Employee Handbook](knowledge://item-1)

## Salesforce rules

READ ONLY. Never generate INSERT/UPDATE/DELETE/UPSERT/DML. Provide SOQL query text only; remind users to run it in Query Editor or Workbench.

## Response format

Use markdown. Bold key terms. Tables for comparisons. Code blocks for SOQL.

---

## LIVE DATABASE SNAPSHOT

### Processes (${processes.length} total)

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

// ─── Send message (SSE streaming) ─────────────────────────────────────────────

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

    const chatMessages = history.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    const tenantId = (req as any).auth?.tenantId ?? null;

    // Build system prompt and retrieve knowledge context in parallel
    const listing = isListingQuery(content.trim());
    const [systemPromptBase, knowledgeContext, allDocsContext] = await Promise.all([
      buildSystemPrompt(tenantId),
      searchKnowledgeBase(content.trim(), tenantId),
      listing ? getAllKnowledgeSummary(tenantId) : Promise.resolve(""),
    ]);

    const extraContext = [knowledgeContext, allDocsContext].filter(Boolean).join("\n\n");
    const systemPrompt = extraContext
      ? `${systemPromptBase}\n\n${extraContext}`
      : systemPromptBase;

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

    let fullResponse = "";

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    await db.insert(messagesTable).values({ conversationId: id, role: "assistant", content: fullResponse });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
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
