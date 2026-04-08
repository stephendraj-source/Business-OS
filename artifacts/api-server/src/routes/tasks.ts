import { Router, type IRouter } from "express";
import { db, processesTable, activitiesTable, initiatives, workflowsTable, checklistItemsTable } from "@workspace/db";
import { sql, eq, max, and } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import type Anthropic from "@anthropic-ai/sdk";
import { useCredit } from "../lib/credits";

const router: IRouter = Router();

function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TASK_COLS = sql`
  t.*,
  u.name  AS assigned_to_name, u.email AS assigned_to_email,
  c.name  AS created_by_name,
  a.name  AS ai_agent_name,
  q.name  AS queue_name,
  ap.name AS approved_by_name,
  w.name  AS workflow_name,
  (SELECT string_agg(p.process_name, ', ' ORDER BY p.number)
   FROM task_processes tp JOIN processes p ON p.id = tp.process_id
   WHERE tp.task_id = t.id) AS process_names
`;

const TASK_JOINS = sql`
  LEFT JOIN users      u  ON u.id  = t.assigned_to
  LEFT JOIN users      c  ON c.id  = t.created_by
  LEFT JOIN ai_agents  a  ON a.id  = t.ai_agent_id
  LEFT JOIN task_queues q ON q.id  = t.queue_id
  LEFT JOIN users      ap ON ap.id = t.approved_by
  LEFT JOIN workflows  w  ON w.id  = t.workflow_id
`;

// ── List tasks ────────────────────────────────────────────────────────────────
router.get("/tasks", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const userId: number | null = auth?.userId ?? null;
    const role: string = auth?.role ?? "user";
    const tenantId: number | null = auth?.tenantId ?? null;

    let rows;
    if (role === "superuser") {
      rows = await db.execute(sql`
        SELECT ${TASK_COLS} FROM tasks t ${TASK_JOINS} ORDER BY t.created_at DESC
      `);
    } else if (role === "admin") {
      rows = await db.execute(sql`
        SELECT ${TASK_COLS} FROM tasks t ${TASK_JOINS}
        WHERE t.tenant_id = ${tenantId} ORDER BY t.created_at DESC
      `);
    } else {
      rows = await db.execute(sql`
        SELECT ${TASK_COLS} FROM tasks t ${TASK_JOINS}
        WHERE (t.assigned_to = ${userId} OR t.created_by = ${userId}) ORDER BY t.created_at DESC
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
      SELECT ${TASK_COLS} FROM tasks t ${TASK_JOINS} WHERE t.id = ${id} LIMIT 1
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
    const {
      name, description, startDate, endDate,
      assignedTo, priority, aiAgentId,
      source, queueId, workflowId, approvalStatus, aiInstructions,
    } = req.body;
    const defaultDate = todayDateString();
    const effectiveStartDate = startDate ?? defaultDate;
    const effectiveEndDate = endDate ?? defaultDate;
    const effectiveAssignedTo = assignedTo ?? (source === "AI Agents" ? createdBy : null);

    const nextTaskNumberRows = tenantId == null
      ? await db.execute(sql`
          SELECT COALESCE(MAX(task_number), 0) + 1 AS next_task_number
          FROM tasks
          WHERE tenant_id IS NULL
        `)
      : await db.execute(sql`
          SELECT COALESCE(MAX(task_number), 0) + 1 AS next_task_number
          FROM tasks
          WHERE tenant_id = ${tenantId}
        `);
    const nextTaskNumber = Number((nextTaskNumberRows.rows as any[])[0]?.next_task_number ?? 1);

    const rows = await db.execute(sql`
      INSERT INTO tasks (
        tenant_id, task_number, name, description, start_date, end_date,
        assigned_to, created_by, priority, ai_agent_id,
        source, queue_id, workflow_id, approval_status, ai_instructions
      ) VALUES (
        ${tenantId},
        ${nextTaskNumber},
        ${name ?? ''},
        ${description ?? ''},
        ${effectiveStartDate},
        ${effectiveEndDate},
        ${effectiveAssignedTo},
        ${createdBy},
        ${priority ?? 'normal'},
        ${aiAgentId ?? null},
        ${source ?? 'Users'},
        ${queueId ?? null},
        ${workflowId ?? null},
        ${approvalStatus ?? 'none'},
        ${aiInstructions ?? ''}
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
    const {
      name, description, startDate, endDate,
      assignedTo, priority, status, aiAgentId, aiResult,
      source, queueId, workflowId, approvalStatus, aiInstructions,
    } = req.body;

    const existing = await db.execute(sql`SELECT * FROM tasks WHERE id = ${id} LIMIT 1`);
    if (!(existing.rows as any[]).length) return res.status(404).json({ error: "Not found" });
    const cur = (existing.rows as any[])[0];

    await db.execute(sql`
      UPDATE tasks SET
        name             = ${name             ?? cur.name},
        description      = ${description      ?? cur.description},
        start_date       = ${startDate       !== undefined ? startDate       : cur.start_date},
        end_date         = ${endDate         !== undefined ? endDate         : cur.end_date},
        assigned_to      = ${assignedTo      !== undefined ? assignedTo      : cur.assigned_to},
        priority         = ${priority         ?? cur.priority},
        status           = ${status           ?? cur.status},
        ai_agent_id      = ${aiAgentId       !== undefined ? aiAgentId       : cur.ai_agent_id},
        ai_result        = ${aiResult         ?? cur.ai_result},
        source           = ${source           ?? cur.source},
        queue_id         = ${queueId         !== undefined ? queueId         : cur.queue_id},
        workflow_id      = ${workflowId      !== undefined ? workflowId      : cur.workflow_id},
        approval_status  = ${approvalStatus   ?? cur.approval_status},
        ai_instructions  = ${aiInstructions   ?? cur.ai_instructions},
        updated_at       = now()
      WHERE id = ${id}
    `);

    const updated = await db.execute(sql`
      SELECT ${TASK_COLS} FROM tasks t ${TASK_JOINS} WHERE t.id = ${id} LIMIT 1
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

// ── Approve task (human approval + execute AI instructions) ───────────────────
router.post("/tasks/:id/approve", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const auth = (req as any).auth;
    const approvedBy: number | null = auth?.userId ?? null;

    const existing = await db.execute(sql`SELECT * FROM tasks WHERE id = ${id} LIMIT 1`);
    if (!(existing.rows as any[]).length) return res.status(404).json({ error: "Not found" });
    const task = (existing.rows as any[])[0];

    // Mark approved
    await db.execute(sql`
      UPDATE tasks SET
        approval_status = 'approved',
        approved_by     = ${approvedBy},
        approved_at     = now(),
        status          = 'in_progress',
        updated_at      = now()
      WHERE id = ${id}
    `);

    // If there are AI instructions, execute them via Claude with write tools
    let aiResult = "";
    if (task.ai_instructions && task.ai_instructions.trim()) {
      if (task.tenant_id !== null && task.tenant_id !== undefined) {
        const credit = await useCredit(task.tenant_id);
        if (!credit.ok) {
          aiResult = "Insufficient credits — AI instructions were not executed.";
          await db.execute(sql`
            UPDATE tasks SET ai_result = ${aiResult}, updated_at = now() WHERE id = ${id}
          `);
          const updated = await db.execute(sql`
            SELECT ${TASK_COLS} FROM tasks t ${TASK_JOINS} WHERE t.id = ${id} LIMIT 1
          `);
          res.json({ task: (updated.rows as any[])[0], aiResult });
          return;
        }
      }
      try {
        aiResult = await executeAiInstructions(task.ai_instructions, task.tenant_id);
      } catch (execErr: any) {
        aiResult = `Execution error: ${execErr.message}`;
      }
      await db.execute(sql`
        UPDATE tasks SET ai_result = ${aiResult}, status = 'done', updated_at = now() WHERE id = ${id}
      `);
    }

    const updated = await db.execute(sql`
      SELECT ${TASK_COLS} FROM tasks t ${TASK_JOINS} WHERE t.id = ${id} LIMIT 1
    `);
    res.json({ task: (updated.rows as any[])[0], aiResult });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Reject task ───────────────────────────────────────────────────────────────
router.post("/tasks/:id/reject", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const auth = (req as any).auth;
    const approvedBy: number | null = auth?.userId ?? null;

    const existing = await db.execute(sql`SELECT * FROM tasks WHERE id = ${id} LIMIT 1`);
    if (!(existing.rows as any[]).length) return res.status(404).json({ error: "Not found" });

    await db.execute(sql`
      UPDATE tasks SET
        approval_status = 'rejected',
        approved_by     = ${approvedBy},
        approved_at     = now(),
        status          = 'cancelled',
        updated_at      = now()
      WHERE id = ${id}
    `);

    const updated = await db.execute(sql`
      SELECT ${TASK_COLS} FROM tasks t ${TASK_JOINS} WHERE t.id = ${id} LIMIT 1
    `);
    res.json((updated.rows as any[])[0]);
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

    const systemPrompt = task.ai_agent_instructions
      ? `You are an AI agent named "${task.ai_agent_name}". ${task.ai_agent_instructions}`
      : `You are an AI agent named "${task.ai_agent_name}". Complete the task provided.`;

    const tenantIdForRun: number | null = task.tenant_id ?? null;
    if (tenantIdForRun !== null) {
      const credit = await useCredit(tenantIdForRun);
      if (!credit.ok) { res.status(402).json({ error: "Insufficient credits. Please contact your administrator." }); return; }
    }

    const userMessage = `Task: ${task.name}\n\nDescription: ${task.description}\n\nPriority: ${task.priority}\nStatus: ${task.status}`;
    const message = await anthropic.messages.create({
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

// ── Execute AI instructions with write tools ──────────────────────────────────
async function executeAiInstructions(instructions: string, tenantId: number | null): Promise<string> {
  const WRITE_TOOLS: Anthropic.Tool[] = [
    {
      name: "update_process",
      description: "Update fields on an existing process (KPI, target, achievement, traffic light, benchmark, included status, process name/description).",
      input_schema: {
        type: "object" as const,
        properties: {
          process_number: { type: "number" },
          kpi: { type: "string" }, target: { type: "string" },
          achievement: { type: "string" },
          traffic_light: { type: "string", enum: ["red", "amber", "green"] },
          industry_benchmark: { type: "string" },
          included: { type: "boolean" },
          process_name: { type: "string" },
          process_description: { type: "string" },
          notes: { type: "string" },
        },
        required: ["process_number"],
      },
    },
    {
      name: "create_activity",
      description: "Create a new activity.",
      input_schema: {
        type: "object" as const,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          mode: { type: "string", enum: ["meeting", "call", "task", "event", "review", "training", "others"] },
        },
        required: ["name"],
      },
    },
    {
      name: "create_initiative",
      description: "Create a new strategic initiative.",
      input_schema: {
        type: "object" as const,
        properties: {
          initiative_id: { type: "string" }, name: { type: "string" },
          goals: { type: "string" }, achievement: { type: "string" },
          start_date: { type: "string" }, end_date: { type: "string" },
        },
        required: ["name"],
      },
    },
    {
      name: "set_checklist_item",
      description: "Mark a checklist item as met or not met.",
      input_schema: {
        type: "object" as const,
        properties: {
          checklist_item_id: { type: "number" },
          is_completed: { type: "boolean" },
        },
        required: ["checklist_item_id", "is_completed"],
      },
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `You are an AI agent executing an approved task. Carry out the following instructions precisely using the available tools:\n\n${instructions}` },
  ];

  let resultSummary = "";

  for (let i = 0; i < 6; i++) {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: "You are an AI agent executing approved task instructions. Use the provided tools to carry out the instructions. When done, provide a brief summary of what was accomplished.",
      tools: WRITE_TOOLS,
      messages,
    });

    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    const toolUses = assistantContent.filter((b: any) => b.type === "tool_use") as Anthropic.ToolUseBlock[];

    if (toolUses.length === 0 || response.stop_reason === "end_turn") {
      const textBlock = assistantContent.find((b: any) => b.type === "text") as Anthropic.TextBlock | undefined;
      resultSummary = textBlock?.text ?? "Task completed.";
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tb of toolUses) {
      const result = await runWriteTool(tb.name, tb.input as Record<string, any>, tenantId);
      toolResults.push({
        type: "tool_result",
        tool_use_id: tb.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return resultSummary;
}

async function runWriteTool(name: string, input: Record<string, any>, tenantId: number | null): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (name) {
      case "update_process": {
        const { process_number, kpi, target, achievement, traffic_light, industry_benchmark, included, process_name, process_description, notes } = input;
        const procWhere = tenantId
          ? and(eq(processesTable.number, process_number), eq(processesTable.tenantId, tenantId))
          : eq(processesTable.number, process_number);
        const [proc] = await db.select().from(processesTable).where(procWhere);
        if (!proc) return { success: false, message: `Process #${process_number} not found` };
        const updates: Record<string, any> = {};
        if (kpi !== undefined) updates.kpi = kpi;
        if (target !== undefined) updates.target = target;
        if (achievement !== undefined) updates.achievement = achievement;
        if (traffic_light !== undefined) updates.trafficLight = traffic_light;
        if (industry_benchmark !== undefined) updates.industryBenchmark = industry_benchmark;
        if (included !== undefined) updates.included = included;
        if (process_name !== undefined) updates.processName = process_name;
        if (process_description !== undefined) updates.processDescription = process_description;
        if (notes !== undefined) updates.notes = notes;
        if (Object.keys(updates).length === 0) return { success: false, message: "No fields to update" };
        await db.update(processesTable).set(updates).where(procWhere);
        return { success: true, message: `Process #${process_number} updated`, data: updates };
      }
      case "create_activity": {
        const { name, description = "", mode = "others" } = input;
        const maxRes = await db.select({ val: max(activitiesTable.activityNumber) }).from(activitiesTable);
        const nextNum = (maxRes[0]?.val ?? 0) + 1;
        const [act] = await db.insert(activitiesTable).values({
          activityNumber: nextNum, name, description, mode,
          ...(tenantId ? { tenantId } : {}),
        }).returning();
        return { success: true, message: `Activity #${nextNum} "${name}" created`, data: act };
      }
      case "create_initiative": {
        const { initiative_id, name, goals = "", achievement = "", start_date, end_date } = input;
        const maxRes = await db.execute(sql`SELECT MAX(id) AS m FROM initiatives`);
        const nextId = ((maxRes.rows[0] as any)?.m ?? 0) + 1;
        const initId = initiative_id || `INIT-${String(nextId).padStart(3, "0")}`;
        const [init] = await db.insert(initiatives).values({
          initiativeId: initId, name, goals, achievement,
          startDate: start_date ?? null, endDate: end_date ?? null,
          ...(tenantId ? { tenantId } : {}),
        }).returning();
        return { success: true, message: `Initiative "${name}" created`, data: init };
      }
      case "set_checklist_item": {
        const { checklist_item_id, is_completed } = input;
        const [item] = await db.select().from(checklistItemsTable).where(eq(checklistItemsTable.id, checklist_item_id));
        if (!item) return { success: false, message: `Checklist item #${checklist_item_id} not found` };
        await db.update(checklistItemsTable).set({ met: is_completed }).where(eq(checklistItemsTable.id, checklist_item_id));
        return { success: true, message: `Checklist item #${checklist_item_id} marked ${is_completed ? "complete" : "incomplete"}`, data: { id: checklist_item_id, met: is_completed } };
      }
      default:
        return { success: false, message: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { success: false, message: `Tool error: ${err.message}` };
  }
}

// ── Auto-detect affected processes ───────────────────────────────────────────
router.post("/tasks/:id/processes/auto-detect", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const tenantId = req.auth?.tenantId ?? null;

    // Get task details (including its own tenant_id for credit deduction)
    const taskResult = await db.execute(sql`SELECT name, description, tenant_id FROM tasks WHERE id = ${id}`);
    const task = taskResult.rows[0] as any;
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    // Use task's tenant_id for billing (fallback to auth tenantId)
    const billingTenantId: number | null = task.tenant_id ?? tenantId;

    // Get all processes — try tenant-scoped first, fall back to all
    let processResult = billingTenantId
      ? await db.execute(sql`SELECT id, number, process_name, category, purpose FROM processes WHERE tenant_id = ${billingTenantId} ORDER BY number`)
      : await db.execute(sql`SELECT id, number, process_name, category, purpose FROM processes ORDER BY number`);

    if (!processResult.rows.length) {
      processResult = await db.execute(sql`SELECT id, number, process_name, category, purpose FROM processes ORDER BY number`);
    }

    const processes = processResult.rows as any[];
    if (!processes.length) { res.json({ process_ids: [] }); return; }

    if (billingTenantId !== null) {
      const credit = await useCredit(billingTenantId);
      if (!credit.ok) { res.status(402).json({ error: "Insufficient credits. Please contact your administrator." }); return; }
    }

    const processList = processes.map(p =>
      `#${p.number}: ${p.process_name}${p.category ? ` [${p.category}]` : ''}${p.purpose ? ` — ${p.purpose}` : ''}`
    ).join('\n');

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `You are analyzing which organizational processes are affected by a task.

Task: ${task.name}
Description: ${task.description || '(none)'}

Processes:
${processList}

Return ONLY a JSON array of process numbers (integers) that are directly affected by or relevant to this task. Return [] if none are clearly relevant. Example: [3, 7, 12]`,
      }],
    });

    const text = message.content.map((c: any) => c.type === "text" ? c.text : "").join("");
    const match = text.match(/\[[\d,\s]*\]/);
    const numbers: number[] = match ? JSON.parse(match[0]) : [];

    const ids = processes
      .filter(p => numbers.includes(Number(p.number)))
      .map(p => Number(p.id));

    // Persist the detected links
    await db.execute(sql`DELETE FROM task_processes WHERE task_id = ${id}`);
    for (const pid of ids) {
      await db.execute(sql`INSERT INTO task_processes (task_id, process_id) VALUES (${id}, ${pid}) ON CONFLICT DO NOTHING`);
    }

    res.json({ process_ids: ids });
  } catch (err) {
    req.log.error(err, "Failed to auto-detect processes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Affected processes ────────────────────────────────────────────────────────
router.get("/tasks/:id/processes", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.execute(sql`
      SELECT p.id, p.number, p.process_name, p.category
      FROM task_processes tp
      JOIN processes p ON p.id = tp.process_id
      WHERE tp.task_id = ${id}
      ORDER BY p.number ASC
    `);
    res.json(result.rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/tasks/:id/processes", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { process_ids } = req.body as { process_ids: number[] };
    await db.execute(sql`DELETE FROM task_processes WHERE task_id = ${id}`);
    if (Array.isArray(process_ids) && process_ids.length > 0) {
      for (const pid of process_ids) {
        await db.execute(sql`
          INSERT INTO task_processes (task_id, process_id) VALUES (${id}, ${pid})
          ON CONFLICT DO NOTHING
        `);
      }
    }
    res.json({ task_id: id, process_ids: process_ids ?? [] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
