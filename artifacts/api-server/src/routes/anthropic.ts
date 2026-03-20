import { Router, type IRouter } from "express";
import { db, conversations as conversationsTable, messages as messagesTable, processesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

// Build system prompt with process context
async function buildSystemPrompt(): Promise<string> {
  const processes = await db.select().from(processesTable).orderBy(processesTable.number);

  const processSummary = processes.map(p =>
    `[${p.number}] ${p.processName || p.processDescription} (${p.category}) | KPI: ${p.kpi} | Benchmark: ${p.industryBenchmark} | Target: ${p.target || 'Not set'} | Achievement: ${p.achievement || 'Not recorded'}`
  ).join("\n");

  return `You are an expert nonprofit operations advisor embedded in a Nonprofit Operating System. You have full access to the organisation's 101 operational processes across 8 categories.

Your capabilities:
1. Answer questions about any process, category, AI agent, KPI, benchmark, target, or achievement
2. Suggest 3-5 specific, actionable recommendations to help the organisation meet benchmark KPI metrics for any process
3. Identify performance gaps (where achievement is below target or benchmark)
4. Provide strategic guidance for nonprofit operations improvement
5. Analyse trends and patterns across categories

When making recommendations, be specific and practical. Reference the exact benchmark and suggest concrete steps to close gaps.

Format your responses clearly using markdown. Use bullet points for lists, bold for key terms, and code blocks only for data.

Current Process Database (${processes.length} processes):
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
    const systemPrompt = await buildSystemPrompt();

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
