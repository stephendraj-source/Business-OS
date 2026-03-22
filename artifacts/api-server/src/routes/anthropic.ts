import { Router, type IRouter } from "express";
import { db, conversations as conversationsTable, messages as messagesTable, processesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { useCredit } from "../lib/credits";
import { embed, vecToSql } from "../lib/embeddings.js";

const router: IRouter = Router();

// Search knowledge base for context relevant to the user's query
async function searchKnowledgeBase(query: string, tenantId: number | null, limit = 5): Promise<string> {
  try {
    const queryVec = await embed(query);
    const embStr = vecToSql(queryVec);
    const tenantCondition = tenantId
      ? sql`tenant_id = ${tenantId}`
      : sql`tenant_id IS NULL`;

    const rows = await db.execute(
      sql`SELECT id, title, content, type,
             1 - (embedding_vec <=> ${embStr}::vector) AS similarity
          FROM knowledge_items
          WHERE embedding_vec IS NOT NULL
            AND ${tenantCondition}
          ORDER BY embedding_vec <=> ${embStr}::vector
          LIMIT ${limit}`
    ) as any[];

    const relevant = rows.filter((r: any) => parseFloat(r.similarity) >= 0.15);
    if (relevant.length === 0) return "";

    const snippets = relevant.map((r: any) => {
      const plainText = (r.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
      const sim = Math.round(parseFloat(r.similarity) * 100);
      return `### ${r.title} (${r.type}, ${sim}% match)\n${plainText}`;
    }).join("\n\n");

    return `## Relevant Knowledge Base Documents\n\nThe following documents from the organisation's knowledge base are relevant to the user's question. Use them to answer accurately:\n\n${snippets}\n\n---`;
  } catch (err) {
    console.error("[rag] knowledge search failed:", err);
    return "";
  }
}

// Build system prompt with process context
async function buildSystemPrompt(): Promise<string> {
  const processes = await db.select().from(processesTable).orderBy(processesTable.number);

  const processSummary = processes.map(p =>
    `[${p.number}] ${p.processName || p.processDescription} (${p.category}) | KPI: ${p.kpi} | Benchmark: ${p.industryBenchmark} | Target: ${p.target || 'Not set'} | Achievement: ${p.achievement || 'Not recorded'}`
  ).join("\n");

  return `You are an expert nonprofit operations advisor embedded in a Nonprofit Operating System. You have full access to the organisation's 101 operational processes across 8 categories, and you can assist with Salesforce data queries.

## Your capabilities

1. Answer questions about any process, category, AI agent, KPI, benchmark, target, or achievement
2. Suggest 3-5 specific, actionable recommendations to help the organisation meet benchmark KPI metrics for any process
3. Identify performance gaps (where achievement is below target or benchmark)
4. Provide strategic guidance for nonprofit operations improvement
5. Analyse trends and patterns across categories
6. Help users construct and interpret Salesforce SOQL queries to retrieve data (Contacts, Accounts, Opportunities, Campaigns, Donations, Cases, etc.)
7. Explain Salesforce object relationships, field names, and data structures relevant to nonprofits (NPSP / Salesforce for Nonprofits)

## CRITICAL: Salesforce data access rules

You may ONLY assist with READ operations on Salesforce. This means:
- **Allowed**: SELECT queries (SOQL), describing objects, listing fields, filtering/reporting on records, COUNT, GROUP BY, ORDER BY, LIMIT
- **Strictly FORBIDDEN**: Any operation that creates, updates, deletes, or modifies Salesforce data — including INSERT, UPDATE, DELETE, UPSERT, Apex DML statements, Flow triggers, API POST/PATCH/DELETE calls, bulk imports, or mass updates
- If a user asks you to write to, update, delete, or modify any Salesforce record — politely decline and explain that write access is not permitted through this assistant
- Always remind the user that queries should be run in Salesforce's Query Editor, Workbench, or via their own authenticated API session — you provide the query logic only

## Format guidelines

Format your responses clearly using markdown. Use bullet points for lists, bold for key terms, and code blocks for SOQL queries or data tables.

## Current Process Database (${processes.length} processes)

${processSummary}`;
}

// List conversations
router.get("/anthropic/conversations", async (req, res) => {
  try {
    const convs = await db.select().from(conversationsTable).orderBy(desc(conversationsTable.createdAt));
    res.json(convs);
  } catch (err) {
    req.log.error(err, "Failed to list conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create conversation
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

// Get conversation with messages
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

// Delete conversation
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

// List messages
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

// Send message (SSE streaming)
router.post("/anthropic/conversations/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { content } = req.body as { content: string };

    if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    // Save user message
    await db.insert(messagesTable).values({ conversationId: id, role: "user", content: content.trim() });

    // Get conversation history
    const history = await db.select().from(messagesTable).where(eq(messagesTable.conversationId, id)).orderBy(messagesTable.createdAt);

    const chatMessages = history.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    const tenantId = req.auth?.tenantId ?? null;

    // RAG: search knowledge base for context relevant to the user's message
    const [systemPromptBase, knowledgeContext] = await Promise.all([
      buildSystemPrompt(),
      searchKnowledgeBase(content.trim(), tenantId),
    ]);
    const systemPrompt = knowledgeContext
      ? `${systemPromptBase}\n\n${knowledgeContext}`
      : systemPromptBase;

    // Deduct 1 credit for this AI call
    if (tenantId) {
      const credit = await useCredit(tenantId);
      if (!credit.ok) {
        res.status(402).json({ error: "Insufficient credits. Please contact your administrator." });
        return;
      }
    }

    // Set SSE headers
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

    // Save assistant message
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
