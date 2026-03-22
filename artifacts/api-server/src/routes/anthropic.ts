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
import { eq, desc, sql, max } from "drizzle-orm";
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
      const itemLines = items.map(ci => `    • ${ci.name}${(ci as any).met ? " ✓" : ""}`).join("\n");
      return `[#${c.id}] ${c.name} | ${c.description || "No description"} | Items (${items.length}):\n${itemLines || "    (no items)"}`;
    }).join("\n\n");

  return `You are an expert business operations advisor embedded in BusinessOS — a comprehensive multi-tenant operating system. You have FULL READ AND WRITE ACCESS to the organisation's database.

## Your capabilities

1. Answer any question about processes, workflows, activities, initiatives, AI agents, forms, checklists, and knowledge base documents
2. **Make direct database updates** — update process KPIs, targets, achievements, traffic lights; create activities, initiatives, workflows; manage checklist items
3. Provide strategic analysis, gap identification, and actionable recommendations
4. Locate and link to specific knowledge base documents so users can navigate directly to them
5. Analyse performance data (KPIs, benchmarks, targets, achievements)
6. Explain relationships between processes, workflows, activities, and initiatives
7. Answer questions about document content for wikis and uploaded files

## Write operations

When the user asks you to update, create, or change data — USE THE TOOLS. Do not just describe what should be done. Confirm the change after making it.

## Document navigation links

ALWAYS link to knowledge base documents using: [Document Title](knowledge://item-{id})
This allows users to click and navigate directly. Example: [Employee Handbook](knowledge://item-1)

## Response format

Use markdown. Bold key terms. Tables for comparisons. Always confirm what was changed after tool use.

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

// ─── Tool definitions ─────────────────────────────────────────────────────────

const DB_TOOLS: Anthropic.Tool[] = [
  {
    name: "update_process",
    description: "Update fields on an existing process (KPI, target, achievement, traffic light, benchmark, included status, process name/description). Use the process number (#N) to identify it.",
    input_schema: {
      type: "object" as const,
      properties: {
        process_number: { type: "number", description: "The process number (#N) shown in the system" },
        kpi: { type: "string", description: "New KPI value" },
        target: { type: "string", description: "New target value" },
        achievement: { type: "string", description: "New achievement value" },
        traffic_light: { type: "string", enum: ["red", "amber", "green"], description: "New traffic light status" },
        industry_benchmark: { type: "string", description: "New industry benchmark value" },
        included: { type: "boolean", description: "Whether this process is included/active" },
        process_name: { type: "string", description: "New process name" },
        process_description: { type: "string", description: "New process description" },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["process_number"],
    },
  },
  {
    name: "create_activity",
    description: "Create a new activity in the system.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Activity name" },
        description: { type: "string", description: "Activity description" },
        mode: { type: "string", enum: ["meeting", "call", "task", "event", "review", "training", "others"], description: "Activity mode/type" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_activity",
    description: "Update an existing activity by its activity number.",
    input_schema: {
      type: "object" as const,
      properties: {
        activity_number: { type: "number", description: "The activity number (#N)" },
        name: { type: "string", description: "New name" },
        description: { type: "string", description: "New description" },
        mode: { type: "string", enum: ["meeting", "call", "task", "event", "review", "training", "others"], description: "New mode" },
      },
      required: ["activity_number"],
    },
  },
  {
    name: "create_initiative",
    description: "Create a new strategic initiative.",
    input_schema: {
      type: "object" as const,
      properties: {
        initiative_id: { type: "string", description: "Short unique identifier, e.g. INIT-001" },
        name: { type: "string", description: "Initiative name" },
        goals: { type: "string", description: "Goals and objectives" },
        achievement: { type: "string", description: "Current achievement/progress" },
        start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
        end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_initiative",
    description: "Update an existing initiative by name or initiative ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        initiative_id: { type: "string", description: "The text initiative ID (e.g. INIT-001) or numeric DB id" },
        name: { type: "string", description: "New name" },
        goals: { type: "string", description: "New goals" },
        achievement: { type: "string", description: "New achievement" },
        start_date: { type: "string", description: "New start date" },
        end_date: { type: "string", description: "New end date" },
      },
      required: ["initiative_id"],
    },
  },
  {
    name: "create_workflow",
    description: "Create a new workflow with a name and description.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Workflow name" },
        description: { type: "string", description: "What this workflow does" },
      },
      required: ["name"],
    },
  },
  {
    name: "set_checklist_item",
    description: "Mark a checklist item as met (completed) or not met.",
    input_schema: {
      type: "object" as const,
      properties: {
        checklist_item_id: { type: "number", description: "The numeric ID of the checklist item" },
        is_completed: { type: "boolean", description: "True to mark as met/complete, false to mark as not met" },
      },
      required: ["checklist_item_id", "is_completed"],
    },
  },
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
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, any>, tenantId: number | null): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (name) {

      case "update_process": {
        const { process_number, kpi, target, achievement, traffic_light, industry_benchmark, included, process_name, process_description, notes } = input;
        const [proc] = await db.select().from(processesTable).where(eq(processesTable.number, process_number));
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
        await db.update(processesTable).set(updates).where(eq(processesTable.number, process_number));
        const changed = Object.entries(updates).map(([k, v]) => `${k}: ${v}`).join(", ");
        return { success: true, message: `Process #${process_number} updated — ${changed}`, data: { process_number, updates } };
      }

      case "create_activity": {
        const { name, description = "", mode = "others" } = input;
        const maxRes = await db.select({ val: max(activitiesTable.activityNumber) }).from(activitiesTable);
        const nextNum = (maxRes[0]?.val ?? 0) + 1;
        const [act] = await db.insert(activitiesTable).values({
          activityNumber: nextNum, name, description, mode,
          ...(tenantId ? { tenantId } : {}),
        }).returning();
        return { success: true, message: `Activity #${nextNum} "${name}" created successfully`, data: act };
      }

      case "update_activity": {
        const { activity_number, name, description, mode } = input;
        const [act] = await db.select().from(activitiesTable).where(eq(activitiesTable.activityNumber, activity_number));
        if (!act) return { success: false, message: `Activity #${activity_number} not found` };
        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (mode !== undefined) updates.mode = mode;
        await db.update(activitiesTable).set(updates).where(eq(activitiesTable.activityNumber, activity_number));
        return { success: true, message: `Activity #${activity_number} updated`, data: updates };
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
        return { success: true, message: `Initiative "${name}" (${initId}) created`, data: init };
      }

      case "update_initiative": {
        const { initiative_id, name, goals, achievement, start_date, end_date } = input;
        const rows = await db.execute(sql`SELECT id FROM initiatives WHERE initiative_id = ${initiative_id} OR id::text = ${String(initiative_id)} LIMIT 1`);
        const row = (rows.rows as any[])[0];
        if (!row) return { success: false, message: `Initiative "${initiative_id}" not found` };
        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (goals !== undefined) updates.goals = goals;
        if (achievement !== undefined) updates.achievement = achievement;
        if (start_date !== undefined) updates.startDate = start_date;
        if (end_date !== undefined) updates.endDate = end_date;
        await db.update(initiatives).set(updates).where(eq(initiatives.id, row.id));
        return { success: true, message: `Initiative "${initiative_id}" updated`, data: updates };
      }

      case "create_workflow": {
        const { name, description = "" } = input;
        const maxRes = await db.select({ val: max(workflowsTable.workflowNumber) }).from(workflowsTable);
        const nextNum = (maxRes[0]?.val ?? 0) + 1;
        const [wf] = await db.insert(workflowsTable).values({
          workflowNumber: nextNum, name, description,
          steps: "[]",
          ...(tenantId ? { tenantId } : {}),
        }).returning();
        return { success: true, message: `Workflow #${nextNum} "${name}" created`, data: wf };
      }

      case "set_checklist_item": {
        const { checklist_item_id, is_completed } = input;
        const [item] = await db.select().from(checklistItemsTable).where(eq(checklistItemsTable.id, checklist_item_id));
        if (!item) return { success: false, message: `Checklist item #${checklist_item_id} not found` };
        await db.update(checklistItemsTable).set({ met: is_completed }).where(eq(checklistItemsTable.id, checklist_item_id));
        return { success: true, message: `Checklist item #${checklist_item_id} "${item.name}" marked as ${is_completed ? "complete ✓" : "incomplete"}`, data: { id: checklist_item_id, met: is_completed } };
      }

      case "query_database": {
        const { sql_query } = input;
        const q = (sql_query as string).trim().toLowerCase();
        if (!q.startsWith("select")) return { success: false, message: "Only SELECT queries are permitted" };
        const result = await db.execute(sql.raw(sql_query));
        const rows = result.rows as any[];
        return { success: true, message: `Query returned ${rows.length} row(s)`, data: rows.slice(0, 50) };
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

        const result = await executeTool(tb.name, tb.input as Record<string, any>, tenantId);

        // Notify client of result
        send({ tool_result: { id: tb.id, name: tb.name, success: result.success, message: result.message } });

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
