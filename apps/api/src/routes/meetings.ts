import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import multer from "multer";
import mammoth from "mammoth";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = _require("pdf-parse");

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ── Helpers for document parsing ──────────────────────────────────────────────

function extractDate(text: string): string {
  const patterns = [
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i,
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
    /\b(\d{4})[\/\-](\d{2})[\/\-](\d{2})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      try {
        const d = new Date(m[0]);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 16);
      } catch {}
    }
  }
  return "";
}


function extractSection(text: string, keywords: string[]): string[] {
  const lines = text.split(/\r?\n/);
  const results: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (keywords.some(k => lower.startsWith(k))) {
      inSection = true;
      const afterColon = line.indexOf(":") >= 0 ? line.slice(line.indexOf(":") + 1).trim() : "";
      if (afterColon) results.push(afterColon);
      continue;
    }
    if (inSection) {
      if (/^[A-Z][A-Z\s]{3,}:/.test(line.trim()) && line.trim().endsWith(":")) { inSection = false; continue; }
      const cleaned = line.replace(/^[\s\-\•\*\d+\.]+/, "").trim();
      if (cleaned) results.push(cleaned);
    }
  }
  return results.filter(Boolean);
}

function parseMeetingText(text: string): Record<string, any> {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Title: first substantial non-date line
  let title = "";
  for (const line of lines.slice(0, 10)) {
    if (line.length > 4 && line.length < 120 && !/^\d/.test(line) && !extractDate(line)) {
      title = line.replace(/^(meeting minutes?|minutes of meeting|minutes|meeting):?\s*/i, "").trim();
      if (title) break;
    }
  }

  // Date
  let meetingDate = "";
  for (const line of lines.slice(0, 20)) {
    const d = extractDate(line);
    if (d) { meetingDate = d; break; }
  }

  // Meeting type
  let meetingType = "physical";
  const fullLower = text.toLowerCase();
  if (fullLower.includes("zoom") || fullLower.includes("teams") || fullLower.includes("google meet") || fullLower.includes("webex") || fullLower.includes("virtual") || fullLower.includes("online") || fullLower.includes("video call")) {
    if (fullLower.includes("in-person") || fullLower.includes("on-site") || fullLower.includes("conference room") || fullLower.includes("office")) {
      meetingType = "hybrid";
    } else {
      meetingType = "virtual";
    }
  }

  // Location
  const locationLines = extractSection(text, ["location:", "venue:", "held at:", "place:", "room:", "address:"]);
  let location = locationLines[0] || "";
  if (!location) {
    for (const line of lines.slice(0, 15)) {
      if (/^(room|venue|location|place|address|held at)[\s:]/i.test(line)) {
        location = line.replace(/^[^:]+:\s*/, "").trim();
        break;
      }
    }
  }

  // Organizer / Chair
  const chairLines = extractSection(text, ["chair:", "chairperson:", "facilitator:", "organizer:", "organiser:", "led by:", "chaired by:"]);
  const organizer = chairLines[0] || "";

  // Attendees / Participants
  const attendeeLines = extractSection(text, ["attendees:", "attendance:", "participants:", "present:", "in attendance:", "members present:"]);
  const attendees = attendeeLines.map(l => {
    const parts = l.split(/[,\-–]/).map(p => p.trim()).filter(Boolean);
    return parts.map(name => ({ id: Math.random().toString(36).slice(2, 9), name }));
  }).flat().filter(a => a.name.length > 1 && a.name.length < 80);

  // Agenda
  const agendaLines = extractSection(text, ["agenda:", "agenda items:", "items for discussion:"]);
  const agenda = agendaLines.slice(0, 20).map(text => ({ id: Math.random().toString(36).slice(2, 9), text }));

  // Discussions / Minutes
  const discussionLines = extractSection(text, ["discussions:", "discussion:", "minutes:", "notes:", "key discussions:", "proceedings:", "matters arising:"]);
  const discussions = discussionLines.join("\n");

  // Action items
  const actionLines = extractSection(text, ["action items:", "actions:", "next steps:", "follow-up:", "action points:"]);
  const actions = actionLines.slice(0, 30).map(text => ({
    id: Math.random().toString(36).slice(2, 9),
    text,
    status: "open" as const,
  }));

  return { title: title || "Imported Meeting", meetingDate, meetingType, location, organizer, attendees, agenda, discussions, actions };
}

// ── Parse file endpoint ───────────────────────────────────────────────────────

router.post("/meetings/parse-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const mime = req.file.mimetype;
    const name = req.file.originalname.toLowerCase();
    let text = "";

    if (mime === "application/pdf" || name.endsWith(".pdf")) {
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mime === "application/msword" ||
      name.endsWith(".docx") || name.endsWith(".doc")
    ) {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value;
    } else {
      return res.status(400).json({ error: "Unsupported file type. Please upload a PDF or Word document." });
    }

    const parsed = parseMeetingText(text);
    res.json(parsed);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to parse file" });
  }
});

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
    const defaultDate = todayDateString();

    const taskRows = await db.execute(sql`
      INSERT INTO tasks
        (tenant_id, name, description, start_date, end_date, priority, status, approval_status, source, assigned_to, created_by)
      VALUES
        (${tenantId}, ${name}, ${"From meeting: " + meeting.title}, ${defaultDate}, ${defaultDate}, ${priority}, ${"open"}, ${"none"}, ${"Meeting"}, ${assignedTo ?? null}, ${userId})
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
