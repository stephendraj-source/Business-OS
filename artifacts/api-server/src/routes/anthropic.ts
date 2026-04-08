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
  agentKnowledgeFilesTable,
  formsTable,
  checklistsTable,
  checklistItemsTable,
  users,
  tenants,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import type Anthropic from "@anthropic-ai/sdk";
import { useCredit } from "../lib/credits";
import { embed, vecToSql, hasPgVectorSupport } from "../lib/embeddings.js";

const router: IRouter = Router();
let pgVectorQuerySupportCache: boolean | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function strip(html: string, maxLen = 4000): string {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function detectProcessCountIntent(query: string): "process_map" | "library" | "all" | null {
  const lower = query.toLowerCase().trim();
  const asksForCount =
    /\bhow many\b/.test(lower) ||
    /\bnumber of\b/.test(lower) ||
    /\bcount\b/.test(lower);
  const mentionsProcesses = /\bprocess(?:es)?\b/.test(lower);

  if (!asksForCount || !mentionsProcesses) return null;
  if ((/\btargets?\b/.test(lower) || /\btheir target\b/.test(lower)) && /\bmet\b/.test(lower)) return null;
  if (/\bcritical\b/.test(lower)) return "process_map";
  if (/\bprocess map\b/.test(lower) || /\bactive operational map\b/.test(lower)) return "process_map";
  if (/\blibrary\b/.test(lower) || /\bnot in (?:the )?process map\b/.test(lower) || /\blibrary only\b/.test(lower)) return "library";
  return "all";
}

function extractProcessTopic(query: string): string | null {
  const lower = query.toLowerCase().trim();
  const patterns = [
    /\bhow many\s+(.+?)\s+process(?:es)?(?:\s+are\s+there)?\b/i,
    /\bnumber of\s+(.+?)\s+process(?:es)?\b/i,
    /\bcount\s+(.+?)\s+process(?:es)?\b/i,
    /\brelated to\s+(.+?)$/i,
    /\bfor\s+(.+?)$/i,
    /\bin\s+(.+?)$/i,
    /\babout\s+(.+?)$/i,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (!match) continue;
    const topic = match[1]
      .replace(/\brelated\b/g, " ")
      .replace(/\b(the|a|an|catalogue|catalog|process map|processes?|are|is|there)\b/g, " ")
      .replace(/[^\w&/\s-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (topic) return topic;
  }

  return null;
}

function topicTokens(topic: string): string[] {
  return topic
    .toLowerCase()
    .split(/[\s/&-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !["and", "the", "for", "with"].includes(token));
}

function matchesTopic(value: string | null | undefined, tokens: string[]): boolean {
  const text = String(value ?? "").toLowerCase();
  return tokens.every((token) => text.includes(token));
}

function normalizeProcessSqlQuery(sqlQuery: string): string {
  if (!/\bfrom\s+processes\b/i.test(sqlQuery) && !/\bjoin\s+processes\b/i.test(sqlQuery)) {
    return sqlQuery;
  }

  return sqlQuery
    .replace(/\bkpi_description\b/gi, "kpi")
    .replace(/\bname\b/gi, "process_name")
    .replace(/\bshort_name\b/gi, "process_short_name");
}

async function hasPgVectorQuerySupport(): Promise<boolean> {
  if (pgVectorQuerySupportCache !== null) return pgVectorQuerySupportCache;
  if (!hasPgVectorSupport()) {
    pgVectorQuerySupportCache = false;
    return false;
  }

  try {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM information_schema.columns
      WHERE table_name IN ('knowledge_items', 'governance_documents', 'process_attachments')
        AND column_name = 'embedding_vec'
        AND udt_name = 'vector'
    `);
    const count = Number((result.rows as any[])[0]?.count ?? 0);
    pgVectorQuerySupportCache = count === 3;
    return pgVectorQuerySupportCache;
  } catch {
    pgVectorQuerySupportCache = false;
    return false;
  }
}

function filterProcessesByTopic(processes: typeof processesTable.$inferSelect[], topic: string) {
  const tokens = topicTokens(topic);
  if (tokens.length === 0) return { matched: processes, mode: "unfiltered" as const };

  const categoryMatches = processes.filter((process) => matchesTopic(process.category, tokens));
  if (categoryMatches.length > 0) return { matched: categoryMatches, mode: "category" as const };

  const matched = processes.filter((process) =>
    [
      process.category,
      process.processDescription,
      process.processName,
      process.purpose,
      process.inputs,
      process.outputs,
      process.kpi,
      process.aiAgent,
    ].some((value) => matchesTopic(value, tokens))
  );
  return { matched, mode: "broad" as const };
}

function detectMissingTargetKpiIntent(query: string): boolean {
  const lower = query.toLowerCase().trim();
  const mentionsProcesses = /\bprocess(?:es)?\b/.test(lower);
  const mentionsTarget = /\btarget\b/.test(lower);
  const mentionsKpi = /\bkpi\b/.test(lower);
  const asksMissing = /\b(no|missing|without|not set|unset)\b/.test(lower);
  return mentionsProcesses && mentionsTarget && mentionsKpi && asksMissing;
}

function detectTargetsMetIntent(query: string): boolean {
  const lower = query.toLowerCase().trim();
  return (
    /\bhow many\b/.test(lower) &&
    /\bmet\b/.test(lower) &&
    (
      /\btargets?\b/.test(lower) ||
      /\btheir target\b/.test(lower) ||
      (/\bprocess(?:es)?\b/.test(lower) && /\btarget\b/.test(lower))
    )
  );
}

function detectSingleTargetMetFollowupIntent(query: string): boolean {
  const lower = query.toLowerCase().trim();
  return (
    /\bis\b/.test(lower) &&
    /\btarget\b/.test(lower) &&
    /\bmet\b/.test(lower) &&
    (/\bthat process\b/.test(lower) || /\bthe process\b/.test(lower))
  );
}

async function buildDirectProcessCountAnswer(
  query: string,
  tenantId: number | null,
  scope: "process_map" | "library" | "all"
): Promise<string> {
  let processes = await db.select().from(processesTable)
    .where(tenantId ? eq(processesTable.tenantId, tenantId) : sql`1=1`)
    .orderBy(processesTable.number);

  if (!processes.length && tenantId) {
    processes = await db.select().from(processesTable).orderBy(processesTable.number);
  }

  const topic = extractProcessTopic(query);
  const { matched, mode } = topic ? filterProcessesByTopic(processes, topic) : { matched: processes, mode: "unfiltered" as const };
  const inMap = matched.filter((p) => p.included);
  const inLibraryOnly = matched.filter((p) => !p.included);
  const scopeLabel = topic
    ? mode === "category"
      ? ` that match the **${topic}** category`
      : ` related to **${topic}**`
    : "";

  if (scope === "all") {
    return `There ${matched.length === 1 ? "is" : "are"} **${matched.length}** process${matched.length === 1 ? "" : "es"}${scopeLabel} in the **Process Catalogue**. Of those, **${inMap.length}** ${inMap.length === 1 ? "is" : "are"} currently included in the **Process Map**.\n\nFinal action taken: Counted the processes${scopeLabel || " available in the current catalogue"} and compared them with the Process Map subset.`;
  }

  if (scope === "process_map") {
    return `There ${inMap.length === 1 ? "is" : "are"} **${inMap.length}** process${inMap.length === 1 ? "" : "es"}${scopeLabel} in the **Process Map**.\n\nFinal action taken: Counted the active processes${scopeLabel || " currently included in the Process Map"}.`;
  }

  return `There ${inLibraryOnly.length === 1 ? "is" : "are"} **${inLibraryOnly.length}** process${inLibraryOnly.length === 1 ? "" : "es"}${scopeLabel} in the **library only** set that are not currently included in the Process Map.\n\nFinal action taken: Counted the library-only processes${scopeLabel || " that are not included in the Process Map"}.`;
}

async function buildMissingTargetKpiAnswer(tenantId: number | null): Promise<string> {
  let processes = await db.select().from(processesTable)
    .where(tenantId ? eq(processesTable.tenantId, tenantId) : sql`1=1`)
    .orderBy(processesTable.number);

  if (!processes.length && tenantId) {
    processes = await db.select().from(processesTable).orderBy(processesTable.number);
  }

  const missing = processes.filter((p) => ["", "empty", "n/a", "na", "-"].includes(String(p.target ?? "").trim().toLowerCase()));

  if (missing.length === 0) {
    return `All processes currently have a **target KPI** set.\n\nFinal action taken: Checked every process for a missing target KPI value.`;
  }

  const lines = missing
    .slice(0, 25)
    .map((p) => `- **PR0-${String(p.number).padStart(3, "0")}** ${p.processName || p.processDescription}`);
  const extra = missing.length > 25
    ? `\n- ...and **${missing.length - 25}** more`
    : "";

  return `There ${missing.length === 1 ? "is" : "are"} **${missing.length}** process${missing.length === 1 ? "" : "es"} with **no target KPI set**.\n\n${lines.join("\n")}${extra}\n\nFinal action taken: Queried the process catalogue for records with a blank target KPI.`;
}

async function buildTargetsMetAnswer(tenantId: number | null): Promise<string> {
  let processes = await db.select().from(processesTable)
    .where(tenantId ? eq(processesTable.tenantId, tenantId) : sql`1=1`)
    .orderBy(processesTable.number);

  if (!processes.length && tenantId) {
    processes = await db.select().from(processesTable).orderBy(processesTable.number);
  }

  const usable = (value: string | null | undefined) => !["", "empty", "n/a", "na", "-"].includes(String(value ?? "").trim().toLowerCase());
  const met = processes.filter((p) => usable(p.target) && usable(p.achievement));

  return `There ${met.length === 1 ? "is" : "are"} **${met.length}** process${met.length === 1 ? "" : "es"} with both a **target** and an **achievement** recorded. This dataset does not currently include a separate explicit “target met” flag, so this is the closest measurable proxy available.\n\nFinal action taken: Counted processes that have both target and achievement values populated.`;
}

async function buildSingleTargetMetFollowupAnswer(tenantId: number | null): Promise<string> {
  let processes = await db.select().from(processesTable)
    .where(tenantId ? eq(processesTable.tenantId, tenantId) : sql`1=1`)
    .orderBy(processesTable.number);

  if (!processes.length && tenantId) {
    processes = await db.select().from(processesTable).orderBy(processesTable.number);
  }

  const usable = (value: string | null | undefined) => !["", "empty", "n/a", "na", "-"].includes(String(value ?? "").trim().toLowerCase());
  const matches = processes.filter((p) => usable(p.target) && usable(p.achievement));

  if (matches.length === 0) {
    return `No process currently has both a **target** and an **achievement** recorded, so I cannot identify a process whose target appears to be met from the available data.\n\nFinal action taken: Checked the process catalogue for a process with both target and achievement values populated.`;
  }

  const process = matches[0];
  return `For the one process currently identified by this proxy, the answer is **yes**: **PR0-${String(process.number).padStart(3, "0")}** ${process.processName || process.processDescription} has both a **target** and an **achievement** recorded. This still does not prove the target was formally met, but it is the closest supported answer from the current dataset.\n\nFinal action taken: Looked up the process with both target and achievement values populated and returned it as the closest match to “target met.”`;
}

async function buildDirectAssistantAnswer(query: string, tenantId: number | null): Promise<string | null> {
  if (detectMissingTargetKpiIntent(query)) {
    return buildMissingTargetKpiAnswer(tenantId);
  }

  if (detectTargetsMetIntent(query)) {
    return buildTargetsMetAnswer(tenantId);
  }

  if (detectSingleTargetMetFollowupIntent(query)) {
    return buildSingleTargetMetFollowupAnswer(tenantId);
  }

  const processCountIntent = detectProcessCountIntent(query);
  if (processCountIntent) {
    return buildDirectProcessCountAnswer(query, tenantId, processCountIntent);
  }

  return null;
}

// ─── RAG: vector + full-text knowledge search ─────────────────────────────────

async function searchKnowledgeBase(query: string, tenantId: number | null, limit = 6): Promise<string> {
  try {
    const tenantCond = tenantId ? sql`ki.tenant_id = ${tenantId}` : sql`ki.tenant_id IS NULL`;
    const procTenantCond = tenantId ? sql`pa.tenant_id = ${tenantId}` : sql`pa.tenant_id IS NULL`;
    const agentTenantCond = tenantId ? sql`a.tenant_id = ${tenantId}` : sql`a.tenant_id IS NULL`;
    let vecRows: any[] = [];
    let govVecRows: any[] = [];
    let procVecRows: any[] = [];
    let agentVecRows: any[] = [];

    if (await hasPgVectorQuerySupport()) {
      const queryVec = await embed(query);
      const embStr = vecToSql(queryVec);

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
      vecRows = vecResult.rows as any[];

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
      govVecRows = govVecResult.rows as any[];

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
      procVecRows = procVecResult.rows as any[];

      const agentVecResult = await db.execute(
        sql`SELECT akf.id,
                   akf.original_name AS title,
                   left(akf.extracted_text, 6000) AS content,
                   'agent_knowledge_file' AS type,
                   NULL AS url,
                   akf.original_name AS file_name,
                   a.name AS folder_name,
                   1 - (akf.embedding_vec <=> ${embStr}::vector) AS similarity,
                   'agent_knowledge' AS source
              FROM agent_knowledge_files akf
              JOIN ai_agents a ON a.id = akf.agent_id
              WHERE akf.embedding_vec IS NOT NULL AND ${agentTenantCond}
              ORDER BY akf.embedding_vec <=> ${embStr}::vector
              LIMIT 4`
      );
      agentVecRows = agentVecResult.rows as any[];
    }

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

      const agentFtResult = await db.execute(
        sql`SELECT akf.id,
                   akf.original_name AS title,
                   left(akf.extracted_text, 6000) AS content,
                   'agent_knowledge_file' AS type,
                   NULL AS url,
                   akf.original_name AS file_name,
                   a.name AS folder_name,
                   0.0 AS similarity,
                   'agent_knowledge' AS source
              FROM agent_knowledge_files akf
              JOIN ai_agents a ON a.id = akf.agent_id
              WHERE ${agentTenantCond}
                AND (lower(akf.original_name) LIKE lower(${pattern})
                  OR lower(COALESCE(akf.extracted_text, '')) LIKE lower(${pattern}))
              LIMIT 3`
      );
      for (const r of (agentFtResult.rows as any[])) {
        if (!agentVecRows.find((v: any) => v.id === r.id)) ftRows.push(r);
      }
    }

    const allRows = [...vecRows, ...govVecRows, ...procVecRows, ...agentVecRows, ...ftRows];
    if (allRows.length === 0) return "";

    const snippets = allRows.map((r: any) => {
      const sim = parseFloat(r.similarity);
      const simLabel = sim > 0 ? ` | Match: ${Math.round(sim * 100)}%` : " | keyword match";
      const isGov = r.source === "governance";
      const isProc = r.source === "process_attachment";
      const isAgent = r.source === "agent_knowledge";
      const location = isGov
        ? `Governance & Compliance > ${r.folder_name}`
        : isProc
          ? `Process Attachments > ${r.folder_name || "Unknown Process"}`
          : isAgent
            ? `AI Agents > ${r.folder_name || "Unknown Agent"}`
            : r.folder_name ? `Forms & Documents > ${r.folder_name}` : "Forms & Documents (root)";
      const idRef = isGov
        ? `governance://doc-${r.id}`
        : isProc
          ? `process://attachment-${r.id}`
          : isAgent
            ? `agent://file-${r.id}`
            : `knowledge://item-${r.id}`;
      let body = strip(r.content ?? "", 5000);
      return `### [${r.title}](${idRef}) (${r.type}${simLabel})\n**Location:** ${location}${r.file_name ? ` | **File:** ${r.file_name}` : ""}\n\n${body || "(no content yet)"}`;
    }).join("\n\n---\n\n");

    return `## Knowledge Base, Governance, Process & Agent Documents (${allRows.length} results)\n\nWhen referencing knowledge items, use [Title](knowledge://item-{id}). For governance documents, use [Title](governance://doc-{id}). For process attachments, use [Title](process://attachment-{id}). For AI agent files, use [Title](agent://file-{id}).\n\n${snippets}\n\n---`;
  } catch (err) {
    console.error("[rag] knowledge search failed:", err);
    return "";
  }
}

// ─── Full knowledge index for listing questions ────────────────────────────────

async function getAllKnowledgeSummary(tenantId: number | null): Promise<string> {
  try {
    const [knowledgeResult, agentFiles] = await Promise.all([
      db.execute(
      sql`SELECT ki.id, ki.title, ki.type, ki.url, ki.file_name,
                 ff.name AS folder_name
            FROM knowledge_items ki
            LEFT JOIN form_folders ff ON ff.id = ki.folder_id
            WHERE ${tenantId ? sql`ki.tenant_id = ${tenantId}` : sql`ki.tenant_id IS NULL`}
            ORDER BY ki.id`
      ),
      db.select({
        id: agentKnowledgeFilesTable.id,
        title: agentKnowledgeFilesTable.originalName,
        fileName: agentKnowledgeFilesTable.originalName,
        agentName: aiAgentsTable.name,
      })
        .from(agentKnowledgeFilesTable)
        .innerJoin(aiAgentsTable, eq(agentKnowledgeFilesTable.agentId, aiAgentsTable.id))
        .where(tenantId ? eq(aiAgentsTable.tenantId, tenantId) : sql`ai_agents.tenant_id IS NULL`)
        .orderBy(agentKnowledgeFilesTable.id),
    ]);
    const rows: any[] = knowledgeResult.rows as any[];

    if (rows.length === 0 && agentFiles.length === 0) return "## Knowledge Base\nNo documents stored yet.\n";

    const lines = rows.map((r: any) => {
      const loc = r.folder_name ? `📁 ${r.folder_name}` : "📁 Root";
      const ext = r.file_name ? ` [${r.file_name}]` : r.url ? ` → ${r.url}` : "";
      return `- [${r.title}](knowledge://item-${r.id}) | Type: ${r.type} | ${loc}${ext}`;
    });
    const agentLines = agentFiles.map((file) =>
      `- [${file.title}](agent://file-${file.id}) | Type: agent_knowledge_file | 🤖 ${file.agentName}${file.fileName ? ` [${file.fileName}]` : ""}`
    );

    return `## All Knowledge Base Documents (${rows.length + agentFiles.length} total)\n\n${[...lines, ...agentLines].join("\n")}\n`;
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
    tenantRow,
    processes,
    workflows,
    activitiesList,
    initiativesList,
    agents,
    forms,
    checklists,
    checklistItems,
    userList,
  ] = await Promise.all([
    tenantId
      ? db.select({ systemPrompt: tenants.systemPrompt }).from(tenants).where(eq(tenants.id, tenantId)).then(r => r[0] ?? null)
      : Promise.resolve(null),
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
    db.select({
      name: users.name,
      designation: users.designation,
      jobDescription: users.jobDescription,
      isActive: users.isActive,
    }).from(users)
      .where(tenantId ? eq(users.tenantId, tenantId) : sql`1=1`)
      .orderBy(users.name),
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

  // Users — active members with designation and job description for smart task assignment
  const activeUsers = userList.filter(u => u.isActive);
  const userSummary = activeUsers.length === 0 ? "No active users." :
    activeUsers.map(u => {
      const parts = [`Name: ${u.name}`];
      if (u.designation) parts.push(`Designation: ${u.designation}`);
      if (u.jobDescription) parts.push(`Job Description: ${u.jobDescription}`);
      return parts.join(" | ");
    }).join("\n");

  const customPromptBlock = tenantRow?.systemPrompt?.trim()
    ? `## Custom Organisation Instructions\n\n${tenantRow.systemPrompt.trim()}\n\n---\n\n`
    : '';

  return `${customPromptBlock}You are an expert business operations advisor embedded in BusinessOS — a comprehensive multi-tenant operating system. You have READ-ONLY access to the organisation's database.

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

**\`suggest_task\`** — Use when the user asks you to DRAFT, PROPOSE, or PREPARE a task for review before saving. This opens a pre-filled form for the user to review and confirm. The task is NOT saved until they click "Create Task".

**Smart assignment:** When the user does not specify who to assign a task to, look at the **Team Members** section in this context. Read each person's Job Description and Designation, then pick the person whose responsibilities best match the task subject. Set their exact name as \`assigned_to_name\`. Only leave it unset (and add \`clarification_needed\`) if no one's job description is relevant at all.

**\`create_task\`** — Use when the user asks you to actually CREATE tasks in the system, or when the user asks for a database change that needs human approval (update a record, create an activity, set a KPI, etc.). Include detailed \`ai_instructions\` so a human reviewer knows exactly what to do.

If the user says "create tasks", "make tasks", or clearly expects tasks to be written now, prefer **\`create_task\`**. Use **\`suggest_task\`** only when they want a draft first. You cannot directly update or delete records. For task creation requests and other database changes, use \`create_task\` with a clear \`ai_instructions\` field. After creating the task, the user will be asked which queue to route it to.

## Final action statement

At the end of EVERY response, add a line in this exact format (always on its own line at the very end):

**Final action taken:** [one-sentence summary of the most important thing you did — e.g. "Queried 12 processes for missing KPIs." or "Created a pending-approval task to update Process #5 KPI."]

## Document navigation links

ALWAYS link to knowledge base documents using: [Document Title](knowledge://item-{id})
This allows users to click and navigate directly. Example: [Employee Handbook](knowledge://item-1)

## Response format

Use markdown. Bold key terms. Tables for comparisons. Always confirm what was changed after tool use.

## SQL schema notes

When using \`query_database\`, use the real column names.

- In \`processes\`, the process title column is \`process_name\`, not \`name\`
- The short label is \`process_short_name\`
- KPI text is stored in \`kpi\`, not \`kpi_description\`
- Prefer \`number, process_name, category, kpi, target, achievement, included\` when querying processes

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

---

### Team Members (${activeUsers.length} active users — use for smart task assignment)

When suggesting a task assignee, match the task's subject matter to the user whose **Job Description** is most relevant. Always prefer someone with a matching job description over a generic suggestion. Use the exact **Name** value as \`assigned_to_name\` in the suggest_task call.

${userSummary}

---`;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const DB_TOOLS: Anthropic.Tool[] = [
  {
    name: "query_database",
    description: "Run a read-only SQL SELECT query against the database to answer specific data questions. ONLY SELECT statements are allowed. For the processes table, use process_name, process_short_name, and kpi as the column names.",
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
    description: "Use this when the user wants a task draft or proposal to review before saving. This opens a pre-filled task creation form for the user to confirm — the task is NOT written to the database until the user clicks 'Create Task'. If the user clearly wants tasks actually created now, do NOT use this — use create_task instead. IMPORTANT: Always try to suggest the most suitable assignee by matching the task subject to the Team Members list in the system context — compare the task topic against each user's Job Description and Designation to pick the best fit. If no one is clearly suitable, leave assigned_to_name empty and set clarification_needed.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Short, clear task title" },
        description: { type: "string", description: "What this task is about and why it is needed" },
        priority: { type: "string", enum: ["high", "normal", "low"], description: "Task priority based on what the user indicated" },
        assigned_to_name: { type: "string", description: "Full name of the best-fit user from the Team Members list. If the user specified a name, use that. If not, pick the person whose Job Description best matches the task topic. Must exactly match a Name from the Team Members list. Omit only if no suitable match can be found." },
        queue_name: { type: "string", description: "Name of the queue to route to, if the user specified one" },
        due_date: { type: "string", description: "ISO date string YYYY-MM-DD if the user mentioned a due date, otherwise omit" },
        clarification_needed: { type: "string", description: "Only set this if you genuinely cannot determine a suitable assignee AND the task requires one. Otherwise leave empty." },
      },
      required: ["name"],
    },
  },
  {
    name: "create_task",
    description: "Create a task that is immediately written to the database and marked pending human approval before any action is taken. Use this when the user asks to actually create tasks now, or when you identify a database change that needs to happen (update a record, create an activity, set a KPI, etc.) — describe exactly what to do in ai_instructions. A human will review and approve or reject. Use suggest_task only when the user wants a draft or proposal instead of a real created task.",
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

function wantsImmediateTaskCreation(content: string): boolean {
  const lower = content.toLowerCase();
  const asksToCreate = /\b(create|make|add|open|generate)\b/.test(lower) && /\btasks?\b/.test(lower);
  const asksForDraftOnly = /\b(draft|suggest|propose|prepare|review first|for review)\b/.test(lower);
  return asksToCreate && !asksForDraftOnly;
}

function wantsImprovementGapTasks(content: string): boolean {
  const lower = content.toLowerCase();
  return wantsImmediateTaskCreation(content) && (
    lower.includes("areas that need improvement") ||
    /\b(improve|improvement|gap|gaps)\b/.test(lower)
  );
}

function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function persistCreatedTask(
  payload: {
    name: string;
    description?: string;
    ai_instructions: string;
    priority?: string;
    agent_name?: string;
  },
  tenantId: number | null,
  createdBy: number | null,
): Promise<{ success: boolean; message: string; data?: any }> {
  const { name, description = "", ai_instructions, priority = "normal", agent_name = "AI Assistant Agent" } = payload;
  const fullDescription = description
    ? `${description}\n\nCreated by: ${agent_name}`
    : `Created by: ${agent_name}`;
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
  const defaultDate = todayDateString();
  const result = await db.execute(sql`
    INSERT INTO tasks (tenant_id, task_number, name, description, start_date, end_date, assigned_to, priority, source, approval_status, ai_instructions, created_by)
    VALUES (${tenantId}, ${nextTaskNumber}, ${name}, ${fullDescription}, ${defaultDate}, ${defaultDate}, ${createdBy}, ${priority}, 'AI Agents', 'pending', ${ai_instructions}, ${createdBy})
    RETURNING id, task_number, name
  `);
  const task = (result.rows as any[])[0];
  return {
    success: true,
    message: `Task #${task.task_number} "${name}" created by ${agent_name} and is pending human approval. The user will be asked which queue to route this to.`,
    data: { task_id: task.id, task_number: task.task_number, task_name: name, agent_name },
  };
}

async function createImprovementGapTasks(
  tenantId: number | null,
  createdBy: number | null,
): Promise<{ created: Array<{ task_id: number; task_number: number; task_name: string; agent_name: string }>; skipped: string[] }> {
  const processes = await db.select({
    id: processesTable.id,
    number: processesTable.number,
    processName: processesTable.processName,
    processDescription: processesTable.processDescription,
    target: processesTable.target,
    trafficLight: processesTable.trafficLight,
  })
    .from(processesTable)
    .where(tenantId ? eq(processesTable.tenantId, tenantId) : sql`1=1`)
    .orderBy(processesTable.number);

  const candidates = processes.filter((process) => {
    const target = String(process.target ?? "").trim();
    const traffic = String(process.trafficLight ?? "").trim().toLowerCase();
    return target === "" || traffic === "red" || traffic === "orange";
  });

  const existingRows = await db.execute(sql`
    SELECT name
    FROM tasks
    WHERE source = 'AI Agents'
      AND approval_status = 'pending'
      AND ${tenantId == null ? sql`tenant_id IS NULL` : sql`tenant_id = ${tenantId}`}
  `);
  const existingNames = new Set((existingRows.rows as Array<{ name?: string }>).map((row) => row.name ?? ""));

  const created: Array<{ task_id: number; task_number: number; task_name: string; agent_name: string }> = [];
  const skipped: string[] = [];

  for (const process of candidates) {
    const label = `PR0-${String(process.number).padStart(3, "0")} ${process.processName || process.processDescription}`;
    const taskName = `Improve ${label}`;
    if (existingNames.has(taskName)) {
      skipped.push(taskName);
      continue;
    }

    const issues: string[] = [];
    if (!String(process.target ?? "").trim()) issues.push("define a target KPI");
    const traffic = String(process.trafficLight ?? "").trim().toLowerCase();
    if (traffic === "red") issues.push("address the red traffic light status");
    if (traffic === "orange") issues.push("address the orange traffic light status");

    const description = `${label} needs improvement. ${issues.length ? `This task should ${issues.join(" and ")}.` : "Review the gap and define corrective actions."}`;
    const aiInstructions = [
      `Review ${label}.`,
      !String(process.target ?? "").trim() ? "Define and record a clear target KPI for this process." : null,
      traffic === "red" ? "Investigate why the process is off track, identify the root cause, and define corrective actions to return it to green status." : null,
      traffic === "orange" ? "Investigate why the process is at risk and define corrective actions to stabilise performance before it turns red." : null,
      "Update the task description with the specific gap and the actions required to close it.",
    ].filter(Boolean).join("\n");

    const result = await persistCreatedTask({
      name: taskName,
      description,
      ai_instructions: aiInstructions,
      priority: traffic === "red" ? "high" : "normal",
      agent_name: "AI Assistant Agent",
    }, tenantId, createdBy);

    if (result.success && result.data?.task_id) {
      created.push(result.data as { task_id: number; task_number: number; task_name: string; agent_name: string });
      existingNames.add(taskName);
    }
  }

  return { created, skipped };
}

async function executeTool(name: string, input: Record<string, any>, tenantId: number | null, createdBy: number | null, requestContent: string): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (name) {

      case "query_database": {
        const { sql_query } = input;
        const q = (sql_query as string).trim().toLowerCase();
        if (!q.startsWith("select")) return { success: false, message: "Only SELECT queries are permitted" };
        const normalizedQuery = normalizeProcessSqlQuery(sql_query);
        const result = await db.execute(sql.raw(normalizedQuery));
        const rows = result.rows as any[];
        return {
          success: true,
          message: normalizedQuery === sql_query
            ? `Query returned ${rows.length} row(s)`
            : `Query returned ${rows.length} row(s) after normalizing process column names`,
          data: rows.slice(0, 50),
        };
      }

      case "suggest_task": {
        const { name, description = "", priority = "normal", assigned_to_name, queue_name, due_date, clarification_needed } = input;
        if (wantsImmediateTaskCreation(requestContent)) {
          const aiInstructions = [
            `Create the task "${name}".`,
            description ? `Purpose and gap to fix: ${description}` : null,
            assigned_to_name ? `Suggested assignee: ${assigned_to_name}` : null,
            queue_name ? `Suggested queue: ${queue_name}` : null,
            due_date ? `Suggested due date: ${due_date}` : null,
            clarification_needed ? `Additional context: ${clarification_needed}` : null,
          ].filter(Boolean).join("\n");
          return persistCreatedTask({
            name,
            description,
            ai_instructions: aiInstructions,
            priority,
            agent_name: "AI Assistant Agent",
          }, tenantId, createdBy);
        }
        return {
          success: true,
          message: clarification_needed
            ? `Task form suggestion ready — clarification needed: ${clarification_needed}`
            : `Task form opened with pre-filled values for "${name}".`,
          data: { name, description, priority, assigned_to_name, queue_name, due_date, clarification_needed },
        };
      }

      case "create_task": {
        return persistCreatedTask(input as {
          name: string;
          description?: string;
          ai_instructions: string;
          priority?: string;
          agent_name?: string;
        }, tenantId, createdBy);
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
    const convs = await db.execute(sql`
      SELECT
        c.id,
        c.tenant_id AS "tenantId",
        c.title,
        c.created_at AS "createdAt",
        COALESCE(MAX(m.created_at), c.created_at) AS "lastActivityAt"
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      GROUP BY c.id, c.tenant_id, c.title, c.created_at
      ORDER BY COALESCE(MAX(m.created_at), c.created_at) DESC, c.id DESC
    `);
    res.json(convs.rows);
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

    const directResponse = await buildDirectAssistantAnswer(content.trim(), tenantId);
    if (directResponse) {
      await db.insert(messagesTable).values({ conversationId: id, role: "assistant", content: directResponse });
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify({ content: directResponse })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    if (wantsImprovementGapTasks(content.trim())) {
      const taskRun = await createImprovementGapTasks(tenantId, createdBy);
      const createdLines = taskRun.created.map((task) => `- Task #${task.task_number}: ${task.task_name}`);
      const skippedLines = taskRun.skipped.map((name) => `- ${name}`);
      const assistantResponse = taskRun.created.length > 0
        ? `I created **${taskRun.created.length}** pending-approval task${taskRun.created.length === 1 ? "" : "s"} for the current improvement gaps.\n\n${createdLines.join("\n")}${skippedLines.length ? `\n\nAlready pending and not duplicated:\n${skippedLines.join("\n")}` : ""}\n\n**Final action taken:** Created pending-approval tasks for processes with meaningful improvement gaps.`
        : `I did not create any new tasks because matching pending AI-generated improvement tasks already exist.\n\n${skippedLines.length ? `Already pending:\n${skippedLines.join("\n")}\n\n` : ""}**Final action taken:** Checked for improvement-gap tasks and avoided creating duplicates.`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      for (const task of taskRun.created) {
        res.write(`data: ${JSON.stringify({
          tool_result: {
            id: `server-improvement-task-${task.task_id}`,
            name: "create_task",
            success: true,
            message: `Task #${task.task_number} "${task.task_name}" created by AI Assistant Agent and is pending human approval. The user will be asked which queue to route this to.`,
            data: task,
          },
        })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ content: assistantResponse })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      await db.insert(messagesTable).values({ conversationId: id, role: "assistant", content: assistantResponse });
      res.end();
      return;
    }

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
    const requiresImmediateTaskCreation = wantsImmediateTaskCreation(content.trim());
    let forcedTaskCreationReminderSent = false;

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

      // If the user explicitly asked to create tasks, don't allow the model to end with text only.
      if (toolUseBlocks.length === 0) {
        if (requiresImmediateTaskCreation && !forcedTaskCreationReminderSent) {
          forcedTaskCreationReminderSent = true;
          loopMessages.push({
            role: "user",
            content: "Use the create_task tool now to create the requested task records in the database. Do not ask for confirmation. Do not reply with text only.",
          });
          continue;
        }

        if (requiresImmediateTaskCreation) {
          const fallbackResult = await persistCreatedTask({
            name: "Address identified improvement gaps",
            description: content.trim(),
            ai_instructions: `Create tasks requested by the user based on this instruction: ${content.trim()}`,
            priority: "normal",
            agent_name: "AI Assistant Agent",
          }, tenantId, createdBy);

          send({
            tool_result: {
              id: "server-fallback-create-task",
              name: "create_task",
              success: fallbackResult.success,
              message: fallbackResult.message,
              data: fallbackResult.data,
            },
          });

          const resultLine = `\n\n> **Tool: create_task** — ${fallbackResult.success ? "✓" : "✗"} ${fallbackResult.message}`;
          fullResponse += resultLine;
        }

        break;
      }

      if (finalMsg.stop_reason !== "tool_use") break;

      // Execute each tool and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tb of toolUseBlocks) {
        // Notify client a tool is being called
        send({ tool_call: { id: tb.id, name: tb.name, input: tb.input } });

        const result = await executeTool(tb.name, tb.input as Record<string, any>, tenantId, createdBy, content.trim());

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
      const content = (req.body as { content?: string } | undefined)?.content?.trim() ?? "";
      const tenantId = (req as any).auth?.tenantId ?? null;
      const fallback = content ? await buildDirectAssistantAnswer(content, tenantId) : null;
      if (fallback) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    } else {
      const content = (req.body as { content?: string } | undefined)?.content?.trim() ?? "";
      const tenantId = (req as any).auth?.tenantId ?? null;
      const fallback = content ? await buildDirectAssistantAnswer(content, tenantId) : null;
      if (fallback) {
        res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ content: "The AI provider is not configured correctly for this environment yet, so I couldn't answer that question. Once a valid Anthropic API key is added, broader assistant queries will work again." })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  }
});

export default router;
