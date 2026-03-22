import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// ── List tasks (role-aware) ───────────────────────────────────────────────────
router.get("/tasks", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const userId: number | null = auth?.userId ?? null;
    const role: string = auth?.role ?? "user";
    const tenantId: number | null = auth?.tenantId ?? null;

    let rows;
    if (role === "superuser") {
      rows = await db.execute(sql`
        SELECT t.*,
          u.name AS assigned_to_name, u.email AS assigned_to_email,
          c.name AS created_by_name,
          a.name AS ai_agent_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assigned_to
        LEFT JOIN users c ON c.id = t.created_by
        LEFT JOIN ai_agents a ON a.id = t.ai_agent_id
        ORDER BY t.created_at DESC
      `);
    } else if (role === "admin") {
      rows = await db.execute(sql`
        SELECT t.*,
          u.name AS assigned_to_name, u.email AS assigned_to_email,
          c.name AS created_by_name,
          a.name AS ai_agent_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assigned_to
        LEFT JOIN users c ON c.id = t.created_by
        LEFT JOIN ai_agents a ON a.id = t.ai_agent_id
        WHERE t.tenant_id = ${tenantId}
        ORDER BY t.created_at DESC
      `);
    } else {
      // Regular users see tasks assigned to them or created by them
      rows = await db.execute(sql`
        SELECT t.*,
          u.name AS assigned_to_name, u.email AS assigned_to_email,
          c.name AS created_by_name,
          a.name AS ai_agent_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assigned_to
        LEFT JOIN users c ON c.id = t.created_by
        LEFT JOIN ai_agents a ON a.id = t.ai_agent_id
        WHERE (t.assigned_to = ${userId} OR t.created_by = ${userId})
        ORDER BY t.created_at DESC
      `);
    }
    res.json(rows.rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get single task ───────────────────────────────────────────────────────────
router.get("/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.execute(sql`
      SELECT t.*,
        u.name AS assigned_to_name, u.email AS assigned_to_email,
        c.name AS created_by_name,
        a.name AS ai_agent_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN users c ON c.id = t.created_by
      LEFT JOIN ai_agents a ON a.id = t.ai_agent_id
      WHERE t.id = ${id} LIMIT 1
    `);
    if (!(rows.rows as any[]).length) return res.status(404).json({ error: "Not found" });
    res.json((rows.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create task ───────────────────────────────────────────────────────────────
router.post("/tasks", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const createdBy: number | null = auth?.userId ?? null;
    const tenantId: number | null = auth?.tenantId ?? null;
    const { name, description, startDate, endDate, revisedEndDate, assignedTo, priority, aiAgentId } = req.body;
    const rows = await db.execute(sql`
      INSERT INTO tasks (tenant_id, name, description, start_date, end_date, revised_end_date, assigned_to, created_by, priority, ai_agent_id)
      VALUES (
        ${tenantId},
        ${name ?? ''},
        ${description ?? ''},
        ${startDate ?? null},
        ${endDate ?? null},
        ${revisedEndDate ?? null},
        ${assignedTo ?? null},
        ${createdBy},
        ${priority ?? 'normal'},
        ${aiAgentId ?? null}
      )
      RETURNING *
    `);
    res.status(201).json((rows.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update task ───────────────────────────────────────────────────────────────
router.patch("/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, startDate, endDate, revisedEndDate, assignedTo, priority, status, aiAgentId, aiResult } = req.body;

    const existing = await db.execute(sql`SELECT * FROM tasks WHERE id = ${id} LIMIT 1`);
    if (!(existing.rows as any[]).length) return res.status(404).json({ error: "Not found" });
    const cur = (existing.rows as any[])[0];

    await db.execute(sql`
      UPDATE tasks SET
        name = ${name ?? cur.name},
        description = ${description ?? cur.description},
        start_date = ${startDate !== undefined ? startDate : cur.start_date},
        end_date = ${endDate !== undefined ? endDate : cur.end_date},
        revised_end_date = ${revisedEndDate !== undefined ? revisedEndDate : cur.revised_end_date},
        assigned_to = ${assignedTo !== undefined ? assignedTo : cur.assigned_to},
        priority = ${priority ?? cur.priority},
        status = ${status ?? cur.status},
        ai_agent_id = ${aiAgentId !== undefined ? aiAgentId : cur.ai_agent_id},
        ai_result = ${aiResult ?? cur.ai_result},
        updated_at = now()
      WHERE id = ${id}
    `);

    const updated = await db.execute(sql`
      SELECT t.*, u.name AS assigned_to_name, c.name AS created_by_name, a.name AS ai_agent_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN users c ON c.id = t.created_by
      LEFT JOIN ai_agents a ON a.id = t.ai_agent_id
      WHERE t.id = ${id} LIMIT 1
    `);
    res.json((updated.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete task ───────────────────────────────────────────────────────────────
router.delete("/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM tasks WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Send task to AI agent ─────────────────────────────────────────────────────
router.post("/tasks/:id/run-agent", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const taskRows = await db.execute(sql`
      SELECT t.*, a.name AS ai_agent_name, a.instructions AS ai_agent_instructions
      FROM tasks t
      LEFT JOIN ai_agents a ON a.id = t.ai_agent_id
      WHERE t.id = ${id} LIMIT 1
    `);
    if (!(taskRows.rows as any[]).length) return res.status(404).json({ error: "Not found" });
    const task = (taskRows.rows as any[])[0];
    if (!task.ai_agent_id) return res.status(400).json({ error: "No AI agent assigned to this task" });

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = task.ai_agent_instructions
      ? `You are an AI agent named "${task.ai_agent_name}". ${task.ai_agent_instructions}`
      : `You are an AI agent named "${task.ai_agent_name}". Complete the task provided.`;

    const userMessage = `Task: ${task.name}\n\nDescription: ${task.description}\n\nPriority: ${task.priority}\nStatus: ${task.status}`;

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const aiResult = message.content.map((c: any) => c.type === "text" ? c.text : "").join("");

    await db.execute(sql`UPDATE tasks SET ai_result = ${aiResult}, updated_at = now() WHERE id = ${id}`);
    res.json({ aiResult });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
