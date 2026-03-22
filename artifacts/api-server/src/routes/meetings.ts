import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// ── List meetings ─────────────────────────────────────────────────────────────
router.get("/meetings", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const role: string = auth?.role ?? "user";

    let rows;
    if (role === "superuser") {
      rows = await db.execute(sql`
        SELECT m.*,
          p.process_name AS process_name,
          u.name AS organizer_user_name,
          c.name AS created_by_name
        FROM meetings m
        LEFT JOIN processes p ON p.id = m.process_id
        LEFT JOIN users u ON u.id = m.organizer_id
        LEFT JOIN users c ON c.id = m.created_by
        ORDER BY m.meeting_date DESC NULLS LAST, m.created_at DESC
      `);
    } else {
      rows = await db.execute(sql`
        SELECT m.*,
          p.process_name AS process_name,
          u.name AS organizer_user_name,
          c.name AS created_by_name
        FROM meetings m
        LEFT JOIN processes p ON p.id = m.process_id
        LEFT JOIN users u ON u.id = m.organizer_id
        LEFT JOIN users c ON c.id = m.created_by
        WHERE m.tenant_id = ${tenantId}
        ORDER BY m.meeting_date DESC NULLS LAST, m.created_at DESC
      `);
    }
    res.json(rows.rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get single meeting with linked workflows/agents ────────────────────────────
router.get("/meetings/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const role: string = auth?.role ?? "user";
    const id = Number(req.params.id);

    const rows = await db.execute(sql`
      SELECT m.*,
        p.process_name AS process_name,
        u.name AS organizer_user_name,
        c.name AS created_by_name
      FROM meetings m
      LEFT JOIN processes p ON p.id = m.process_id
      LEFT JOIN users u ON u.id = m.organizer_id
      LEFT JOIN users c ON c.id = m.created_by
      WHERE m.id = ${id}
        ${role !== "superuser" ? sql`AND m.tenant_id = ${tenantId}` : sql``}
    `);
    if (!rows.rows.length) return res.status(404).json({ error: "Not found" });

    const meeting = rows.rows[0];

    const wfRows = await db.execute(sql`
      SELECT mw.workflow_id, w.name AS workflow_name
      FROM meeting_workflows mw
      LEFT JOIN workflows w ON w.id = mw.workflow_id
      WHERE mw.meeting_id = ${id}
    `);

    const agentRows = await db.execute(sql`
      SELECT ma.agent_id, a.name AS agent_name
      FROM meeting_agents ma
      LEFT JOIN ai_agents a ON a.id = ma.agent_id
      WHERE ma.meeting_id = ${id}
    `);

    res.json({
      ...meeting,
      linked_workflows: wfRows.rows,
      linked_agents: agentRows.rows,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create meeting ────────────────────────────────────────────────────────────
router.post("/meetings", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const userId: number | null = auth?.userId ?? null;
    const {
      title = "New Meeting",
      meeting_type = "physical",
      meeting_date = null,
      location = "",
      organizer_id = null,
      organizer_name = "",
      agenda = "[]",
      attendees = "[]",
      discussions = "",
      actions = "[]",
      process_id = null,
      workflow_ids = [],
      agent_ids = [],
    } = req.body;

    const rows = await db.execute(sql`
      INSERT INTO meetings
        (tenant_id, title, meeting_type, meeting_date, location, organizer_id, organizer_name,
         agenda, attendees, discussions, actions, process_id, created_by)
      VALUES
        (${tenantId}, ${title}, ${meeting_type}, ${meeting_date ?? null}, ${location},
         ${organizer_id ?? null}, ${organizer_name}, ${agenda}, ${attendees}, ${discussions},
         ${actions}, ${process_id ?? null}, ${userId})
      RETURNING *
    `);
    const meeting = rows.rows[0] as any;

    for (const wfId of workflow_ids) {
      await db.execute(sql`
        INSERT INTO meeting_workflows (meeting_id, workflow_id) VALUES (${meeting.id}, ${wfId})
        ON CONFLICT DO NOTHING
      `);
    }
    for (const agId of agent_ids) {
      await db.execute(sql`
        INSERT INTO meeting_agents (meeting_id, agent_id) VALUES (${meeting.id}, ${agId})
        ON CONFLICT DO NOTHING
      `);
    }

    res.status(201).json({ ...meeting, linked_workflows: [], linked_agents: [] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update meeting ────────────────────────────────────────────────────────────
router.patch("/meetings/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const role: string = auth?.role ?? "user";
    const id = Number(req.params.id);
    const {
      title, meeting_type, meeting_date, location, organizer_id, organizer_name,
      agenda, attendees, discussions, actions, process_id,
      workflow_ids, agent_ids,
    } = req.body;

    const existing = await db.execute(sql`
      SELECT id FROM meetings WHERE id = ${id}
        ${role !== "superuser" ? sql`AND tenant_id = ${tenantId}` : sql``}
    `);
    if (!existing.rows.length) return res.status(404).json({ error: "Not found" });

    const sets: any[] = [];
    if (title !== undefined)          sets.push(sql`title = ${title}`);
    if (meeting_type !== undefined)   sets.push(sql`meeting_type = ${meeting_type}`);
    if (meeting_date !== undefined)   sets.push(sql`meeting_date = ${meeting_date ?? null}`);
    if (location !== undefined)       sets.push(sql`location = ${location}`);
    if (organizer_id !== undefined)   sets.push(sql`organizer_id = ${organizer_id ?? null}`);
    if (organizer_name !== undefined) sets.push(sql`organizer_name = ${organizer_name}`);
    if (agenda !== undefined)         sets.push(sql`agenda = ${agenda}`);
    if (attendees !== undefined)      sets.push(sql`attendees = ${attendees}`);
    if (discussions !== undefined)    sets.push(sql`discussions = ${discussions}`);
    if (actions !== undefined)        sets.push(sql`actions = ${actions}`);
    if (process_id !== undefined)     sets.push(sql`process_id = ${process_id ?? null}`);
    sets.push(sql`updated_at = now()`);

    if (sets.length > 1) {
      const setClauses = sets.reduce((acc, s, i) => i === 0 ? s : sql`${acc}, ${s}`);
      await db.execute(sql`UPDATE meetings SET ${setClauses} WHERE id = ${id}`);
    }

    // Sync linked workflows
    if (Array.isArray(workflow_ids)) {
      await db.execute(sql`DELETE FROM meeting_workflows WHERE meeting_id = ${id}`);
      for (const wfId of workflow_ids) {
        await db.execute(sql`
          INSERT INTO meeting_workflows (meeting_id, workflow_id) VALUES (${id}, ${wfId})
          ON CONFLICT DO NOTHING
        `);
      }
    }

    // Sync linked agents
    if (Array.isArray(agent_ids)) {
      await db.execute(sql`DELETE FROM meeting_agents WHERE meeting_id = ${id}`);
      for (const agId of agent_ids) {
        await db.execute(sql`
          INSERT INTO meeting_agents (meeting_id, agent_id) VALUES (${id}, ${agId})
          ON CONFLICT DO NOTHING
        `);
      }
    }

    const updated = await db.execute(sql`
      SELECT m.*,
        p.process_name AS process_name,
        u.name AS organizer_user_name,
        c.name AS created_by_name
      FROM meetings m
      LEFT JOIN processes p ON p.id = m.process_id
      LEFT JOIN users u ON u.id = m.organizer_id
      LEFT JOIN users c ON c.id = m.created_by
      WHERE m.id = ${id}
    `);

    const wfRows = await db.execute(sql`
      SELECT mw.workflow_id, w.name AS workflow_name
      FROM meeting_workflows mw LEFT JOIN workflows w ON w.id = mw.workflow_id
      WHERE mw.meeting_id = ${id}
    `);
    const agentRows = await db.execute(sql`
      SELECT ma.agent_id, a.name AS agent_name
      FROM meeting_agents ma LEFT JOIN ai_agents a ON a.id = ma.agent_id
      WHERE ma.meeting_id = ${id}
    `);

    res.json({ ...updated.rows[0], linked_workflows: wfRows.rows, linked_agents: agentRows.rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete meeting ────────────────────────────────────────────────────────────
router.delete("/meetings/:id", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const role: string = auth?.role ?? "user";
    const id = Number(req.params.id);

    const existing = await db.execute(sql`
      SELECT id FROM meetings WHERE id = ${id}
        ${role !== "superuser" ? sql`AND tenant_id = ${tenantId}` : sql``}
    `);
    if (!existing.rows.length) return res.status(404).json({ error: "Not found" });

    await db.execute(sql`DELETE FROM meetings WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Convert action to task ────────────────────────────────────────────────────
router.post("/meetings/:id/actions/:actionId/create-task", async (req, res) => {
  try {
    const auth = (req as any).auth;
    const tenantId: number | null = auth?.tenantId ?? null;
    const userId: number | null = auth?.userId ?? null;
    const role: string = auth?.role ?? "user";
    const id = Number(req.params.id);
    const { actionId } = req.params;

    const mRows = await db.execute(sql`
      SELECT * FROM meetings WHERE id = ${id}
        ${role !== "superuser" ? sql`AND tenant_id = ${tenantId}` : sql``}
    `);
    if (!mRows.rows.length) return res.status(404).json({ error: "Meeting not found" });

    const meeting = mRows.rows[0] as any;
    const actionsArr: any[] = JSON.parse(meeting.actions || "[]");
    const action = actionsArr.find((a: any) => a.id === actionId);
    if (!action) return res.status(404).json({ error: "Action not found" });
    if (action.taskId) return res.status(400).json({ error: "Action already linked to a task" });

    const { name = action.text, priority = "medium", assignedTo = null } = req.body;

    const taskRows = await db.execute(sql`
      INSERT INTO tasks
        (tenant_id, name, description, priority, status, approval_status, source, assigned_to, created_by)
      VALUES
        (${tenantId}, ${name}, ${"From meeting: " + meeting.title}, ${priority}, ${"open"}, ${"none"}, ${"Meeting"}, ${assignedTo ?? null}, ${userId})
      RETURNING *
    `);
    const task = taskRows.rows[0] as any;

    action.taskId = task.id;
    action.status = action.status || "open";
    const updatedActions = JSON.stringify(actionsArr);
    await db.execute(sql`UPDATE meetings SET actions = ${updatedActions}, updated_at = now() WHERE id = ${id}`);

    res.status(201).json({ task, actionId, actions: actionsArr });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
