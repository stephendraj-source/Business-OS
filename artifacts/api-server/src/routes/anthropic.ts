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
    // 1. Vector similarity search
    const queryVec = await embed(query);
    const embStr = vecToSql(queryVec);
    const tenantCond = tenantId ? sql`ki.tenant_id = ${tenantId}` : sql`ki.tenant_id IS NULL`;

    const vecRows = await db.execute(
      sql`SELECT ki.id, ki.title, ki.content, ki.type, ki.url, ki.file_name,
               ff.name AS folder_name,
               1 - (ki.embedding_vec <=> ${embStr}::vector) AS similarity
            FROM knowledge_items ki
            LEFT JOIN form_folders ff ON ff.id = ki.folder_id
            WHERE ki.embedding_vec IS NOT NULL AND ${tenantCond}
            ORDER BY ki.embedding_vec <=> ${embStr}::vector
            LIMIT ${limit}`
    ) as any[];

    // 2. Full-text keyword fallback for docs without embeddings
    const words = query.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
    const ftRows: any[] = [];
    if (words.length > 0) {
      const pattern = `%${words.join("%")}%`;
      const ft = await db.execute(
        sql`SELECT ki.id, ki.title, ki.content, ki.type, ki.url, ki.file_name,
                   ff.name AS folder_name, 0.0 AS similarity
              FROM knowledge_items ki
              LEFT JOIN form_folders ff ON ff.id = ki.folder_id
              WHERE ${tenantCond}
                AND (lower(ki.title) LIKE lower(${pattern}) OR lower(ki.content) LIKE lower(${pattern}))
              LIMIT 4`
      ) as any[];
      for (const r of ft) {
        if (!vecRows.find((v: any) => v.id === r.id)) ftRows.push(r);
      }
    }

    const allRows = [...vecRows, ...ftRows];
    if (allRows.length === 0) return "";

    // Top results regardless of threshold (always at least show best matches)
    const snippets = allRows.map((r: any) => {
      const sim = parseFloat(r.similarity);
      const simLabel = sim > 0 ? ` | Match: ${Math.round(sim * 100)}%` : " | keyword match";
      const location = r.folder_name ? `Forms & Documents > ${r.folder_name}` : "Forms & Documents (root)";
      let body = "";
      if (r.type === "wiki" || r.type === "document" || r.type === "file") {
        body = strip(r.content ?? "", 4000);
      } else if (r.type === "url") {
        body = r.url ? `URL: ${r.url}` : strip(r.content ?? "", 800);
      } else {
        body = strip(r.content ?? "", 2000);
      }
      return `### [${r.title}](knowledge://item-${r.id}) (${r.type}${simLabel})\n**Location:** ${location}${r.file_name ? ` | **File:** ${r.file_name}` : ""}\n\n${body || "(no content yet)"}`;
    }).join("\n\n---\n\n");

    return `## Knowledge Base Documents (${allRows.length} results)\n\nWhen referencing these documents, use the clickable link format [Title](knowledge://item-{id}).\n\n${snippets}\n\n---`;
  } catch (err) {
    console.error("[rag] knowledge search failed:", err);
    return "";
  }
}

// ─── Full knowledge index for listing questions ────────────────────────────────

async function getAllKnowledgeSummary(tenantId: number | null): Promise<string> {
  try {
    const rows = await db.execute(
      sql`SELECT ki.id, ki.title, ki.type, ki.url, ki.file_name,
                 ff.name AS folder_name
            FROM knowledge_items ki
            LEFT JOIN form_folders ff ON ff.id = ki.folder_id
            WHERE ${tenantId ? sql`ki.tenant_id = ${tenantId}` : sql`ki.tenant_id IS NULL`}
            ORDER BY ki.id`
    ) as any[];

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
