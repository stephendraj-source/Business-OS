import { Router, type IRouter } from "express";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, TableLayoutType, LevelFormat,
  convertInchesToTwip, PageBreak, NumberingType,
} from "docx";

const router: IRouter = Router();

// ── colour palette ─────────────────────────────────────────────────────────────
const BRAND   = "1E3A5F";  // deep navy
const ACCENT  = "2563EB";  // blue-600
const MUTED   = "64748B";  // slate-500
const BG_HEAD = "1E3A5F";  // table header bg
const BG_ALT  = "F1F5F9";  // table alt row

// ── helpers ────────────────────────────────────────────────────────────────────
const h1 = (text: string) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    thematicBreak: false,
    spacing: { before: 400, after: 160 },
    run: { color: BRAND, bold: true },
  });

const h2 = (text: string) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    run: { color: ACCENT, bold: true },
  });

const h3 = (text: string) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    run: { color: "374151", bold: true },
  });

const body = (text: string, opts?: { bold?: boolean; italic?: boolean; color?: string }) =>
  new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        italics: opts?.italic,
        color: opts?.color ?? "374151",
        size: 22,
      }),
    ],
  });

const bullet = (text: string, level = 0) =>
  new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: convertInchesToTwip(0.25 + level * 0.25) },
    children: [
      new TextRun({ text: "• ", color: ACCENT, bold: true, size: 22 }),
      new TextRun({ text, size: 22, color: "374151" }),
    ],
  });

const code = (text: string) =>
  new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: convertInchesToTwip(0.3) },
    children: [new TextRun({ text, font: "Courier New", size: 18, color: "1E40AF" })],
  });

const spacer = (n = 1) =>
  Array.from({ length: n }, () => new Paragraph({ text: "", spacing: { before: 40, after: 40 } }));

const pageBreak = () =>
  new Paragraph({ children: [new PageBreak()] });

const divider = () =>
  new Paragraph({ text: "", border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } }, spacing: { before: 160, after: 160 } });

// ── table builder ─────────────────────────────────────────────────────────────
function makeTable(headers: string[], rows: string[][], colWidths?: number[]) {
  const totalWidth = 9000;
  const defaultW = Math.floor(totalWidth / headers.length);
  const widths = colWidths ?? headers.map(() => defaultW);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: BG_HEAD },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 20 })],
          }),
        ],
      })
    ),
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) =>
        new TableCell({
          width: { size: widths[ci], type: WidthType.DXA },
          shading: ri % 2 === 1 ? { type: ShadingType.SOLID, color: BG_ALT } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: cell, size: 20, color: "1F2937" })],
            }),
          ],
        })
      ),
    })
  );

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: totalWidth, type: WidthType.DXA },
    rows: [headerRow, ...dataRows],
  });
}

// ── epic / story helpers ──────────────────────────────────────────────────────
function epicBlock(
  number: string,
  title: string,
  description: string,
  stories: { id: string; role: string; action: string; benefit: string; ac: string[] }[]
): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [
    h2(`Epic ${number}: ${title}`),
    body(description),
    ...spacer(1),
  ];

  for (const s of stories) {
    blocks.push(
      h3(`${s.id} – As a ${s.role}, I want to ${s.action}`),
      body(`So that ${s.benefit}.`),
      ...spacer(1),
      body("Acceptance Criteria:", { bold: true }),
      ...s.ac.map(ac => bullet(ac)),
      ...spacer(1),
    );
  }

  blocks.push(divider());
  return blocks;
}

// ── document assembly ─────────────────────────────────────────────────────────
router.get("/spec-doc/download", async (_req, res) => {
  try {
    const children: (Paragraph | Table)[] = [];

    // ── Cover ──────────────────────────────────────────────────────────────────
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1200, after: 400 },
        children: [new TextRun({ text: "BusinessOS", bold: true, size: 72, color: BRAND })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: "Technical Specification & Reconstruction Guide", size: 36, color: MUTED })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 800 },
        children: [new TextRun({ text: `Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, size: 24, color: MUTED, italics: true })],
      }),
      pageBreak(),
    );

    // ── 1. OVERVIEW ────────────────────────────────────────────────────────────
    children.push(
      h1("1. Project Overview"),
      body("BusinessOS is a multi-tenant, full-stack business operating system for organisations of any type. It provides a unified platform for process management, task tracking, AI-powered automation, knowledge management, strategic planning, and operational workflows — all in one application secured by JWT-based multi-tenancy."),
      ...spacer(1),
      body("Key characteristics:", { bold: true }),
      bullet("Multi-tenant SaaS: every data record is isolated per tenant via tenant_id"),
      bullet("Role-based access: superuser → admin → standard user hierarchy"),
      bullet("AI-native: embedded Claude (Anthropic) assistant with tool-calling for live DB writes"),
      bullet("Real-time save: all editors use debounced auto-save to the REST API"),
      bullet("Dark-mode aware: Tailwind CSS with theme variables (bg-background, bg-card, text-foreground)"),
      ...spacer(1),
      divider(),
    );

    // ── 2. TECH STACK ─────────────────────────────────────────────────────────
    children.push(
      h1("2. Technology Stack"),
      makeTable(
        ["Layer", "Technology", "Version / Notes"],
        [
          ["Runtime",          "Node.js",                     "v24"],
          ["Package manager",  "pnpm workspaces (monorepo)",  "v10"],
          ["Language",         "TypeScript",                  "5.9, strict mode"],
          ["API framework",    "Express",                     "v5"],
          ["Database",         "PostgreSQL",                  "16+, pgvector extension"],
          ["ORM",              "Drizzle ORM",                 "drizzle-orm + drizzle-kit"],
          ["Validation",       "Zod",                         "zod/v4 + drizzle-zod"],
          ["Auth",             "JWT",                         "jsonwebtoken, 30-day expiry"],
          ["Frontend",         "React + Vite",                "React 18, Vite 7"],
          ["Styling",          "Tailwind CSS + shadcn/ui",    "CSS variables, Radix primitives"],
          ["Animation",        "Framer Motion",               "page transitions, panel slides"],
          ["AI",               "Anthropic Claude",            "claude-3-5-sonnet via @anthropic-ai/sdk"],
          ["Logging",          "Pino + pino-http",            "structured JSON logs"],
          ["Build",            "esbuild",                     "API bundle; Vite for frontend"],
        ],
        [2200, 3800, 3000]
      ),
      ...spacer(2),
      divider(),
    );

    // ── 3. MONOREPO STRUCTURE ─────────────────────────────────────────────────
    children.push(
      h1("3. Monorepo Structure"),
      body("The repository is a pnpm workspace monorepo. All packages must use pnpm (not npm or yarn). Every package has composite: true in its tsconfig to enable TypeScript project references."),
      ...spacer(1),
      makeTable(
        ["Path", "Package name", "Purpose"],
        [
          ["artifacts/api-server",      "@workspace/api-server",        "Express REST API, all business logic"],
          ["artifacts/business-os",    "@workspace/business-os",       "React + Vite frontend SPA"],
          ["lib/db",                    "@workspace/db",                 "Drizzle schema + DB connection pool"],
          ["lib/api-zod",               "@workspace/api-zod",            "Generated Zod schemas from OpenAPI"],
          ["lib/api-client-react",      "@workspace/api-client-react",   "Generated React Query hooks (Orval)"],
          ["scripts",                   "@workspace/scripts",            "Seed script (100 processes)"],
        ],
        [3000, 2800, 3200]
      ),
      ...spacer(2),
      divider(),
    );

    // ── 4. DATABASE SCHEMA ────────────────────────────────────────────────────
    children.push(h1("4. Database Schema"));
    children.push(body("All tables are created via Drizzle ORM schema push (pnpm --filter @workspace/db run push). Multi-tenant tables include a tenant_id integer column. The pgvector extension must be enabled for the knowledge_items embedding column."));
    children.push(...spacer(1));

    const tables: [string, string[][]][] = [
      ["tenants", [
        ["id", "serial PK"],["name","text NOT NULL"],["slug","text UNIQUE NOT NULL"],["status","text DEFAULT 'active'"],
        ["industry_blueprint","text"],["credits","integer DEFAULT 10000"],["first_name/last_name","text"],
        ["address / website_url","text"],["contact1_name/phone/email","text"],["contact2_name/phone/email","text"],
        ["display_name / official_name","text NOT NULL DEFAULT ''"],["official_national_id","text NOT NULL DEFAULT ''"],
        ["system_prompt","text"],["color_scheme","text"],["created_at","timestamp DEFAULT now()"],
      ]],
      ["users", [
        ["id","serial PK"],["tenant_id","integer FK → tenants.id"],["name","text NOT NULL"],
        ["first_name / last_name / preferred_name","text NOT NULL DEFAULT ''"],["email","text UNIQUE NOT NULL"],
        ["password_hash","text NOT NULL"],["role","text DEFAULT 'user'"],["designation","text DEFAULT ''"],
        ["phone","text DEFAULT ''"],["data_scope","text DEFAULT 'categories'"],["privilege_mode","text DEFAULT 'user'"],
        ["category","text DEFAULT ''"],["job_description","text DEFAULT ''"],
        ["is_active","boolean DEFAULT true"],["color_scheme","text"],
        ["must_change_password","boolean DEFAULT false"],["created_at","timestamp DEFAULT now()"],
      ]],
      ["user_module_access", [["id","serial PK"],["user_id","integer FK → users.id CASCADE"],["module","text"],["has_access","boolean DEFAULT true"]]],
      ["user_allowed_categories", [["id","serial PK"],["user_id","integer FK → users.id CASCADE"],["category","text"]]],
      ["user_allowed_processes", [["id","serial PK"],["user_id","integer FK"],["process_id","integer"],["can_edit","boolean DEFAULT false"]]],
      ["user_field_permissions", [["id","serial PK"],["user_id","integer FK"],["catalogue_type","text"],["field_key","text"],["can_view","boolean DEFAULT true"],["can_edit","boolean DEFAULT true"]]],
      ["processes", [
        ["id","serial PK"],["tenant_id","integer"],["number","integer NOT NULL"],["category","text NOT NULL"],
        ["process_name","text NOT NULL (= full description)"],["process_short_name","text NOT NULL DEFAULT ''"],
        ["ai_agent","text DEFAULT ''"],["ai_agent_active","boolean DEFAULT false"],
        ["purpose / inputs / outputs / human_in_the_loop / kpi","text DEFAULT ''"],
        ["estimated_value_impact / industry_benchmark","text DEFAULT ''"],
        ["included","boolean DEFAULT false"],["target / achievement / traffic_light","text DEFAULT ''"],
        ["evaluation","text (JSON blob)"],["priority","integer"],
        ["ai_score","integer"],["ai_reasoning","text"],
      ]],
      ["activities", [["id","serial PK"],["tenant_id","integer"],["activity_number","integer DEFAULT 0"],["name","text DEFAULT 'New Activity'"],["mode","text DEFAULT 'others'"],["description","text DEFAULT ''"],["created_at / updated_at","timestamp"]]],
      ["process_activities", [["id","serial PK"],["process_id","integer FK → processes.id CASCADE"],["activity_id","integer FK → activities.id CASCADE"],["created_at","timestamp"]]],
      ["workflows", [["id","serial PK"],["tenant_id","integer"],["workflow_number","integer NOT NULL"],["name","text DEFAULT 'New Workflow'"],["description","text DEFAULT ''"],["steps","text DEFAULT '[]' (JSON array)"],["created_at / updated_at","timestamp"]]],
      ["ai_agents", [["id","serial PK"],["tenant_id","integer"],["agent_number","integer NOT NULL"],["name","text NOT NULL"],["description / instructions","text DEFAULT ''"],["run_mode","text DEFAULT 'adhoc'"],["trigger","text DEFAULT ''"],["tools","text DEFAULT '[]' (JSON)"],["output_dest_type","text"],["output_dest_id","integer"],["agent_type","text DEFAULT 'internal'"],["external_config","text DEFAULT '{}' (JSON)"],["created_by","integer"],["created_at / updated_at","timestamp"]]],
      ["agent_knowledge_urls", [["id","serial PK"],["agent_id","integer FK → ai_agents.id CASCADE"],["url","text NOT NULL"],["label","text DEFAULT ''"],["created_at","timestamp"]]],
      ["agent_knowledge_files", [["id","serial PK"],["agent_id","integer FK CASCADE"],["original_name / stored_name / mime_type / file_path","text"],["file_size","integer DEFAULT 0"],["uploaded_at","timestamp"]]],
      ["agent_schedules", [["id","serial PK"],["agent_id","integer FK CASCADE"],["schedule_type","text DEFAULT 'once'"],["scheduled_at","timestamp NOT NULL"],["next_run_at / last_run_at","timestamp"],["week_days","text"],["is_active","boolean DEFAULT true"],["created_at","timestamp"]]],
      ["agent_run_logs", [["id","serial PK"],["agent_id","integer FK"],["schedule_id","integer"],["started_at","timestamp"],["completed_at","timestamp"],["status","text DEFAULT 'running'"],["output / error","text"]]],
      ["form_folders", [["id","serial PK"],["name","text DEFAULT 'New Folder'"],["parent_id","integer (self-ref, nullable)"],["tenant_id","integer FK → tenants.id CASCADE"],["created_at","timestamp"]]],
      ["forms", [["id","serial PK"],["form_number","integer DEFAULT 1"],["name","text DEFAULT 'New Form'"],["description","text DEFAULT ''"],["fields","text DEFAULT '[]' (JSON)"],["tenant_id","integer FK → tenants.id CASCADE"],["publish_slug","text UNIQUE"],["is_published","boolean DEFAULT false"],["linked_workflow_id","integer FK → workflows.id SET NULL"],["linked_agent_id","integer FK → ai_agents.id SET NULL"],["folder_id","integer FK → form_folders.id SET NULL"],["created_at / updated_at","timestamp"]]],
      ["form_submissions", [["id","serial PK"],["form_id","integer FK → forms.id CASCADE"],["tenant_id","integer FK"],["submitted_by","integer"],["submitted_by_name","text DEFAULT ''"],["submission_data","text DEFAULT '{}' (JSON)"],["created_at","timestamp"]]],
      ["mindmaps", [["id","serial PK"],["name","text DEFAULT 'New Mind Map'"],["tenant_id","integer FK → tenants.id CASCADE"],["folder_id","integer FK → form_folders.id SET NULL"],["data","text DEFAULT '{\"nodes\":[],\"edges\":[]}' (JSON)"],["created_at / updated_at","timestamp"]]],
      ["knowledge_items", [["id","serial PK"],["tenant_id","integer FK → tenants.id CASCADE"],["folder_id","integer FK → form_folders.id SET NULL"],["type","text DEFAULT 'wiki' (wiki|url|file)"],["title","text DEFAULT 'Untitled'"],["content","text DEFAULT ''"],["url","text"],["file_name / file_path / mime_type","text"],["file_size","bigint"],["embedding_vec","vector(384) (pgvector)"],["embedded_at","timestamp"],["created_at / updated_at","timestamp"]]],
      ["checklists", [["id","serial PK"],["tenant_id","integer"],["process_id","integer NOT NULL"],["name / description","text DEFAULT ''"],["created_at / updated_at","timestamp"]]],
      ["checklist_items", [["id","serial PK"],["checklist_id","integer NOT NULL"],["name / description","text DEFAULT ''"],["met","boolean DEFAULT false"],["sort_order","integer DEFAULT 0"],["created_at / updated_at","timestamp"]]],
      ["evidence_items", [["id","serial PK"],["checklist_item_id","integer NOT NULL"],["name / description","text DEFAULT ''"],["created_at","timestamp"]]],
      ["evidence_urls", [["id","serial PK"],["evidence_item_id","integer NOT NULL"],["url / label","text"]]],
      ["evidence_files", [["id","serial PK"],["evidence_item_id","integer NOT NULL"],["original_name / stored_name / mime_type / file_path","text"],["file_size","integer"],["uploaded_at","timestamp"]]],
      ["governance_standards", [["id","serial PK"],["tenant_id","integer"],["compliance_name","text NOT NULL"],["compliance_authority / reference_url","text DEFAULT ''"],["created_at","timestamp"]]],
      ["governance_documents", [["id","serial PK"],["governance_id","integer FK CASCADE"],["original_name / stored_name / mime_type / file_path","text"],["file_size","integer DEFAULT 0"],["uploaded_at","timestamp"]]],
      ["process_governance", [["id","serial PK"],["process_id","integer FK → processes.id CASCADE"],["governance_id","integer FK CASCADE"]]],
      ["initiatives", [["id","serial PK"],["tenant_id","integer"],["initiative_id","text UNIQUE NOT NULL"],["name","text NOT NULL"],["goals / achievement","text DEFAULT ''"],["start_date / end_date","date"],["goal_id","integer (FK → strategic_goals)"],["created_at","timestamp"]]],
      ["initiative_urls", [["id","serial PK"],["initiative_id","integer FK CASCADE"],["label","text DEFAULT ''"],["url","text NOT NULL"]]],
      ["initiative_assignees", [["id","serial PK"],["initiative_id","integer FK CASCADE"],["user_id","integer FK CASCADE"]]],
      ["initiative_processes", [["id","serial PK"],["initiative_id","integer FK CASCADE"],["process_id","integer FK CASCADE"]]],
      ["meetings (raw SQL)", [["id","serial PK"],["tenant_id","integer"],["title","text NOT NULL DEFAULT 'New Meeting'"],["type","text DEFAULT 'virtual' (physical|virtual|hybrid)"],["meeting_date","date"],["start_time / end_time","text"],["location / virtual_link","text DEFAULT ''"],["organiser_id","integer FK → users.id"],["process_id","integer FK → processes.id SET NULL"],["agenda","text DEFAULT '[]' (JSON)"],["attendees","text DEFAULT '[]' (JSON)"],["discussion","text DEFAULT ''"],["actions","text DEFAULT '[]' (JSON)"],["created_at / updated_at","timestamp"]]],
      ["calendar_events (raw SQL)", [["id","serial PK"],["tenant_id","integer"],["title","text NOT NULL"],["start_date / end_date","date NOT NULL"],["start_time / end_time","text"],["color","text DEFAULT '#10b981'"],["description","text DEFAULT ''"],["all_day","boolean DEFAULT false"],["created_at / updated_at","timestamp"]]],
      ["tasks (raw SQL)", [["id","serial PK"],["tenant_id","integer"],["task_number","integer"],["name","text NOT NULL DEFAULT 'New Task'"],["description","text DEFAULT ''"],["status","text DEFAULT 'todo'"],["priority","text DEFAULT 'medium'"],["due_date","date"],["assigned_to","text (user:ID|agent:ID|workflow:ID|queue:ID)"],["queue_id","integer"],["approval_status","text DEFAULT 'pending'"],["process_id","integer FK → processes.id"],["source","text DEFAULT 'manual'"],["created_at / updated_at","timestamp"]]],
      ["queues (raw SQL)", [["id","serial PK"],["tenant_id","integer"],["name","text NOT NULL"],["description","text DEFAULT ''"],["created_at / updated_at","timestamp"]]],
    ];

    for (const [tableName, cols] of tables) {
      children.push(
        h3(`Table: ${tableName}`),
        makeTable(["Column", "Type / Constraint"], cols, [3800, 5200]),
        ...spacer(1),
      );
    }
    children.push(divider());

    // ── 5. API ENDPOINTS ─────────────────────────────────────────────────────
    children.push(h1("5. REST API Endpoints"));
    children.push(body("Base URL: /api  —  all routes require Bearer JWT unless noted. The API server binds to the PORT environment variable."));
    children.push(...spacer(1));

    const apiGroups: [string, string[][]][] = [
      ["Authentication", [
        ["POST",  "/auth/login",                     "Login. Body: {email, password}. Returns {token, user}. No auth required."],
        ["GET",   "/auth/me",                        "Return current user from JWT."],
        ["POST",  "/auth/logout",                    "Invalidate session."],
        ["GET",   "/auth/tenants",                   "Superuser only: list all tenants."],
        ["POST",  "/auth/tenants",                   "Superuser only: create tenant."],
        ["PATCH", "/auth/tenants/:id",               "Superuser only: update tenant."],
        ["DELETE","/auth/tenants/:id",               "Superuser only: delete tenant."],
        ["POST",  "/auth/tenants/:id/admin",         "Superuser only: create admin user for tenant."],
      ]],
      ["Processes", [
        ["GET",   "/processes",                      "List all processes for tenant (optional ?category= filter)."],
        ["POST",  "/processes",                      "Create process."],
        ["GET",   "/processes/:id",                  "Get single process."],
        ["PUT",   "/processes/:id",                  "Full update of process."],
        ["DELETE","/processes/:id",                  "Delete process."],
        ["GET",   "/categories",                     "List distinct category values."],
        ["GET",   "/processes/:id/attachments",      "List file attachments for process."],
        ["POST",  "/processes/:id/attachments",      "Upload file attachment (multipart/form-data)."],
        ["DELETE","/processes/:id/attachments/:fid", "Delete attachment."],
      ]],
      ["Activities", [
        ["GET",   "/activities",             "List all activities for tenant."],
        ["POST",  "/activities",             "Create activity."],
        ["GET",   "/activities/:id",         "Get single activity."],
        ["PUT",   "/activities/:id",         "Update activity."],
        ["DELETE","/activities/:id",         "Delete activity."],
        ["GET",   "/processes/:id/activities","List activities linked to a process."],
        ["POST",  "/processes/:id/activities","Link an activity to a process."],
        ["DELETE","/processes/:id/activities/:aid","Unlink activity from process."],
      ]],
      ["Workflows", [
        ["GET",   "/workflows",              "List workflows for tenant."],
        ["POST",  "/workflows",              "Create workflow. Body: {name, description, steps}."],
        ["GET",   "/workflows/:id",          "Get single workflow."],
        ["PATCH", "/workflows/:id",          "Partial update (name, description, steps)."],
        ["DELETE","/workflows/:id",          "Delete workflow."],
      ]],
      ["AI Agents", [
        ["GET",   "/ai-agents",                           "List agents for tenant."],
        ["POST",  "/ai-agents",                           "Create agent."],
        ["GET",   "/ai-agents/:id",                       "Get agent with knowledge + schedules."],
        ["PATCH", "/ai-agents/:id",                       "Update agent."],
        ["DELETE","/ai-agents/:id",                       "Delete agent."],
        ["POST",  "/ai-agents/:id/run",                   "Execute agent immediately via Claude."],
        ["GET",   "/ai-agents/:id/logs",                  "List run logs."],
        ["POST",  "/ai-agents/:id/knowledge-urls",        "Add knowledge URL."],
        ["DELETE","/ai-agents/:id/knowledge-urls/:uid",   "Remove knowledge URL."],
        ["POST",  "/ai-agents/:id/knowledge-files",       "Upload knowledge file (multipart)."],
        ["DELETE","/ai-agents/:id/knowledge-files/:fid",  "Remove knowledge file."],
        ["GET",   "/ai-agents/:id/schedules",             "List schedules."],
        ["POST",  "/ai-agents/:id/schedules",             "Create schedule."],
        ["PATCH", "/ai-agents/:id/schedules/:sid",        "Update schedule."],
        ["DELETE","/ai-agents/:id/schedules/:sid",        "Delete schedule."],
        ["GET",   "/ai-agents/:id/permissions",           "Get agent permissions."],
        ["PUT",   "/ai-agents/:id/permissions",           "Set agent permissions (modules, categories, processes, fields)."],
      ]],
      ["Anthropic / Chat", [
        ["POST",  "/anthropic/chat",         "Streaming Claude response with tool-calling. Body: {messages, systemPrompt?}. Returns SSE stream. Tools: get_processes, update_process, create_activity, create_initiative, create_workflow, run_sql_query, mark_checklist_item, etc."],
      ]],
      ["Documents (Forms)", [
        ["GET",   "/forms/folders",              "List folder tree for tenant."],
        ["POST",  "/forms/folders",              "Create folder. Body: {name, parentId?}."],
        ["PATCH", "/forms/folders/:id",          "Rename folder."],
        ["DELETE","/forms/folders/:id",          "Delete folder (and contents)."],
        ["GET",   "/forms",                      "List forms for tenant."],
        ["POST",  "/forms",                      "Create form. Body: {name, folderId?}."],
        ["GET",   "/forms/:id",                  "Get form with fields."],
        ["PUT",   "/forms/:id",                  "Update form (name, fields, publish settings)."],
        ["DELETE","/forms/:id",                  "Delete form."],
        ["GET",   "/forms/:id/submissions",      "List submissions for form."],
        ["POST",  "/forms/:id/submissions",      "Submit form data."],
        ["DELETE","/forms/:id/submissions/:sid", "Delete submission."],
      ]],
      ["Mind Maps", [
        ["GET",   "/mindmaps",               "List mindmaps for tenant."],
        ["POST",  "/mindmaps",               "Create mindmap. Body: {name, folderId?}."],
        ["GET",   "/mindmaps/:id",           "Get mindmap with full JSON data."],
        ["PATCH", "/mindmaps/:id",           "Update mindmap. Body: {name?, data?, folderId?}."],
        ["DELETE","/mindmaps/:id",           "Delete mindmap."],
      ]],
      ["Knowledge Base", [
        ["GET",   "/knowledge",              "List knowledge items for tenant."],
        ["POST",  "/knowledge",              "Create wiki item. Body: {title, type, folderId?}."],
        ["GET",   "/knowledge/:id",          "Get single item."],
        ["PATCH", "/knowledge/:id",          "Update item (title, content, url)."],
        ["DELETE","/knowledge/:id",          "Delete item."],
        ["POST",  "/knowledge/:id/embed",    "Generate and store vector embedding for the item."],
        ["POST",  "/knowledge/search",       "Semantic search. Body: {query}. Returns ranked results."],
        ["POST",  "/knowledge/upload",       "Upload file as knowledge item (multipart)."],
      ]],
      ["Tasks", [
        ["GET",   "/tasks",                  "List tasks for tenant. Supports ?queueId=, ?status=, ?assignedTo= filters."],
        ["POST",  "/tasks",                  "Create task."],
        ["GET",   "/tasks/:id",              "Get task."],
        ["PATCH", "/tasks/:id",              "Update task fields."],
        ["DELETE","/tasks/:id",              "Delete task."],
        ["GET",   "/queues",                 "List queues for tenant."],
        ["POST",  "/queues",                 "Create queue."],
        ["PATCH", "/queues/:id",             "Update queue."],
        ["DELETE","/queues/:id",             "Delete queue."],
      ]],
      ["Calendar", [
        ["GET",   "/calendar-events",                   "List events for tenant."],
        ["POST",  "/calendar-events",                   "Create event."],
        ["PATCH", "/calendar-events/:id",               "Update event."],
        ["DELETE","/calendar-events/:id",               "Delete event."],
      ]],
      ["Meetings", [
        ["GET",   "/meetings",                          "List meetings for tenant."],
        ["POST",  "/meetings",                          "Create meeting."],
        ["GET",   "/meetings/:id",                      "Get meeting with full detail."],
        ["PATCH", "/meetings/:id",                      "Update meeting (title, type, date, agenda, etc.)."],
        ["DELETE","/meetings/:id",                      "Delete meeting."],
        ["POST",  "/meetings/:id/actions/:aid/create-task","Convert meeting action item to real task record."],
      ]],
      ["Strategy", [
        ["GET",   "/strategy",               "Get mission/vision/values/strategic goals for tenant."],
        ["PUT",   "/strategy",               "Upsert strategy record."],
        ["GET",   "/strategy/goals",         "List strategic goals."],
        ["POST",  "/strategy/goals",         "Create strategic goal."],
        ["PATCH", "/strategy/goals/:id",     "Update goal."],
        ["DELETE","/strategy/goals/:id",     "Delete goal."],
        ["GET",   "/initiatives",            "List initiatives (with optional ?goalId= filter)."],
        ["POST",  "/initiatives",            "Create initiative."],
        ["GET",   "/initiatives/:id",        "Get initiative with assignees, processes, URLs."],
        ["PATCH", "/initiatives/:id",        "Update initiative."],
        ["DELETE","/initiatives/:id",        "Delete initiative."],
      ]],
      ["Governance & Compliance", [
        ["GET",   "/governance",                     "List governance standards for tenant."],
        ["POST",  "/governance",                     "Create standard."],
        ["GET",   "/governance/:id",                 "Get standard with linked documents and processes."],
        ["PATCH", "/governance/:id",                 "Update standard."],
        ["DELETE","/governance/:id",                 "Delete standard."],
        ["POST",  "/governance/:id/documents",       "Upload compliance document (multipart)."],
        ["DELETE","/governance/:id/documents/:did",  "Delete document."],
        ["POST",  "/governance/:id/populate-ai",     "Auto-populate linked processes using Claude."],
        ["POST",  "/governance/:id/processes",       "Link process to standard."],
        ["DELETE","/governance/:id/processes/:pid",  "Unlink process."],
      ]],
      ["Users & Org Structure", [
        ["GET",   "/users",                          "List users for tenant."],
        ["POST",  "/users",                          "Create user."],
        ["GET",   "/users/:id",                      "Get user with permissions."],
        ["PATCH", "/users/:id",                      "Update user fields."],
        ["DELETE","/users/:id",                      "Delete user."],
        ["GET",   "/users/:id/permissions",          "Get module/data/field permissions."],
        ["PUT",   "/users/:id/permissions",          "Set permissions."],
        ["GET",   "/org/roles",                      "List org roles."],
        ["POST",  "/org/roles",                      "Create role."],
        ["PATCH", "/org/roles/:id",                  "Update role."],
        ["DELETE","/org/roles/:id",                  "Delete role."],
        ["GET",   "/org/roles/:id/members",          "List role members."],
        ["PUT",   "/org/roles/:id/members",          "Set role members."],
        ["GET|POST|PATCH|DELETE", "/org/divisions",  "CRUD divisions."],
        ["GET|POST|PATCH|DELETE", "/org/departments","CRUD departments."],
        ["GET|POST|PATCH|DELETE", "/org/projects",   "CRUD projects."],
        ["GET",   "/org/tree",                       "Full org tree snapshot."],
        ["GET|PUT","/org/users/:id/memberships",     "Get/set user org memberships."],
        ["GET",   "/org/user-categories",            "List user categories."],
      ]],
      ["Checklists & Evidence", [
        ["GET|POST",        "/checklists",                      "List/create checklists."],
        ["GET|PATCH|DELETE","/checklists/:id",                  "Get/update/delete checklist."],
        ["POST",            "/checklists/:id/items",            "Add checklist item."],
        ["PATCH|DELETE",    "/checklists/:id/items/:iid",       "Update/delete item."],
        ["POST",            "/checklists/:id/items/:iid/evidence","Add evidence to item."],
        ["POST",            "/evidence/:eid/urls",              "Add URL to evidence."],
        ["POST",            "/evidence/:eid/files",             "Upload file to evidence."],
      ]],
      ["Reports & Dashboards", [
        ["GET",   "/reports",                "List custom reports for tenant."],
        ["POST",  "/reports",                "Create report."],
        ["GET",   "/reports/:id",            "Get report config."],
        ["PUT",   "/reports/:id",            "Update report config."],
        ["DELETE","/reports/:id",            "Delete report."],
        ["GET",   "/dashboards",             "Get dashboard widget layout for tenant."],
        ["PUT",   "/dashboards",             "Save dashboard widget layout."],
      ]],
      ["Miscellaneous", [
        ["GET",   "/healthz",                "Health check, no auth required."],
        ["GET",   "/audit-logs",             "List audit log entries for tenant."],
        ["GET",   "/favourites",             "List favourited process IDs for user."],
        ["POST",  "/favourites/:id",         "Toggle favourite."],
        ["GET",   "/nav-preferences",        "Get sidebar order preferences for user."],
        ["PUT",   "/nav-preferences",        "Save sidebar order preferences."],
        ["GET",   "/credits",                "Get remaining AI credits for tenant."],
        ["GET|POST|PATCH|DELETE", "/connector-configs", "CRUD external connector configs (e.g. Salesforce)."],
        ["GET",   "/spec-doc/download",      "Download this Word specification document."],
      ]],
    ];

    for (const [group, endpoints] of apiGroups) {
      children.push(
        h2(group),
        makeTable(
          ["Method", "Path", "Description"],
          endpoints,
          [1600, 3800, 3600]
        ),
        ...spacer(1),
      );
    }
    children.push(divider());

    // ── 6. FRONTEND ARCHITECTURE ─────────────────────────────────────────────
    children.push(
      h1("6. Frontend Architecture"),
      body("The frontend is a React 18 SPA built with Vite. It lives at artifacts/business-os. Routing is state-based (no URL router) — a single activeView state drives which view component renders inside the Layout shell."),
      ...spacer(1),
      h2("Key Frontend Patterns"),
      bullet("Auth: AuthContext (useAuth hook) stores JWT token in localStorage under the key business-os-auth-token. All fetch calls include Authorization: Bearer <token>."),
      bullet("API base: const API = '/api' — never use a dynamic hook for this. Vite proxies /api → Express in dev."),
      bullet("Theme: all colours use CSS variables (bg-background, bg-card, text-foreground, text-muted-foreground). Never hardcode hex colours."),
      bullet("Tenant isolation: the JWT payload contains tenantId which the API uses to filter all queries."),
      bullet("Dark mode: Tailwind dark-mode class strategy; theme stored in localStorage as color-scheme."),
      bullet("Optimistic updates: most edits update local state immediately, then call the API in the background."),
      bullet("Debounced auto-save: editors (mindmap, forms, wiki) debounce saves by ~800ms."),
      ...spacer(1),
      h2("View Components (ActiveView states)"),
      makeTable(
        ["activeView value", "Component file", "Navigation label", "Section"],
        [
          ["table",              "process-table.tsx",          "Process Catalogue",    "Core Views"],
          ["tree",               "horizontal-tree.tsx",        "Master Map",           "Core Views"],
          ["portfolio",          "process-table.tsx (filtered)","Process Catalogue",   "Core Views"],
          ["process-map",        "process-map.tsx",            "Process Map",          "Core Views"],
          ["strategy",           "strategy-view.tsx",          "Mission & Vision",     "Strategy"],
          ["strategic-planning", "strategic-planning-view.tsx","Strategic Planning",   "Strategy"],
          ["initiatives",        "initiatives-view.tsx",       "Initiatives",          "Strategy"],
          ["governance",         "governance-view.tsx",        "Governance",           "Governance"],
          ["workflows",          "workflows-view.tsx",         "Workflows",            "Productivity"],
          ["forms",              "forms-view.tsx",             "Documents",            "Productivity"],
          ["meetings",           "meetings-view.tsx",          "Meetings",             "Productivity"],
          ["calendar",           "calendar-view.tsx",          "Calendar",             "Productivity"],
          ["activities",         "activities-view.tsx",        "Activities",           "Productivity"],
          ["tasks",              "tasks-view.tsx",             "Tasks",                "Productivity"],
          ["queues",             "queues-view.tsx",            "Queues",               "Productivity"],
          ["ai-agents",          "ai-agents-view.tsx",         "AI Agents",            "AI"],
          ["connectors",         "connectors.tsx",             "Connectors",           "Integrations"],
          ["dashboards",         "dashboards-view.tsx",        "Dashboards",           "System"],
          ["reports",            "reports-view.tsx",           "Reports",              "System"],
          ["audit-logs",         "audit-logs-view.tsx",        "Audit & Logs",         "System"],
          ["settings",           "settings-view.tsx",          "Settings",             "System"],
          ["users",              "users-view.tsx",             "Users",                "Admin"],
          ["configuration",      "configuration-view.tsx",     "Configuration",        "Admin"],
        ],
        [2400, 2800, 2000, 1800]
      ),
      ...spacer(1),
      divider(),
    );

    // ── 7. EPICS & USER STORIES ───────────────────────────────────────────────
    children.push(h1("7. Epics & Detailed User Stories"));
    children.push(body("The following epics and user stories describe every functional area of BusinessOS in exact detail. Each story follows the standard format: As a [role], I want to [action] so that [benefit], with explicit acceptance criteria."));
    children.push(...spacer(1));

    const epics = [
      {
        num: "1", title: "Multi-Tenant Authentication & Access Control",
        desc: "The platform supports multiple isolated tenants on a single deployment. Authentication uses JWT stored in localStorage. A superuser account exists outside any tenant and manages the platform. All data queries are scoped to the authenticated user's tenantId.",
        stories: [
          {
            id: "US-1.1", role: "unauthenticated visitor", action: "log in with email and password",
            benefit: "I can access my organisation's dashboard",
            ac: [
              "POST /api/auth/login accepts {email, password} and returns {token, user}",
              "JWT contains {userId, tenantId, role} and expires in 30 days",
              "Token stored in localStorage under key business-os-auth-token",
              "Invalid credentials return HTTP 401 with message 'Invalid credentials'",
              "Login page shows email + password fields with show/hide toggle",
            ],
          },
          {
            id: "US-1.2", role: "authenticated user", action: "have my session persist across page reloads",
            benefit: "I don't need to log in every time I open the app",
            ac: [
              "On app load, AuthContext reads the JWT from localStorage",
              "GET /api/auth/me is called to validate the token and fetch current user",
              "If token is expired or invalid, user is redirected to login page",
              "AuthContext exposes useAuth() and useUser() (backward-compat alias) hooks",
            ],
          },
          {
            id: "US-1.3", role: "superuser", action: "manage all tenants from a dedicated tenant management page",
            benefit: "I can create, update, and delete client organisations without touching the database",
            ac: [
              "Superuser account has tenantId=null in JWT payload",
              "On login, isSuperUser flag routes to TenantManagementPage instead of Dashboard",
              "Superuser can CRUD tenants via GET/POST/PATCH/DELETE /api/auth/tenants",
              "Superuser can create an admin user for any tenant via POST /api/auth/tenants/:id/admin",
              "Tenant fields: name, slug (unique), status (active/suspended), credits, industry_blueprint, display_name, official_name, contact details, system_prompt, color_scheme",
            ],
          },
          {
            id: "US-1.4", role: "tenant admin", action: "manage user permissions at the module, data, and field level",
            benefit: "I can control exactly what each user can see and edit",
            ac: [
              "User detail panel has tabs: Profile, Modules, Data Access, Fields, Org",
              "Modules tab: toggle on/off access to each named module",
              "Data Access tab: data_scope field (categories | processes | all); select allowed categories; select allowed process IDs with can_edit toggle",
              "Fields tab: per-field canView/canEdit toggles for each catalogue type",
              "Permissions saved to user_module_access, user_allowed_categories, user_allowed_processes, user_field_permissions tables",
            ],
          },
          {
            id: "US-1.5", role: "user", action: "change my profile details including preferred name, phone, designation, job description",
            benefit: "My profile accurately reflects who I am",
            ac: [
              "Profile tab in user detail panel: firstName, lastName, preferredName, email, phone, designation, category, jobDescription, colorScheme",
              "must_change_password flag forces password reset on next login",
              "PATCH /api/users/:id persists changes",
            ],
          },
        ],
      },
      {
        num: "2", title: "Process Management (Master Catalogue & Maps)",
        desc: "The core of BusinessOS is a catalogue of operational processes. Processes are organised by category, have detailed metadata, and can be analysed with AI. Four views present the same data in different ways: spreadsheet table, hierarchical tree, process map, and portfolio filtered view.",
        stories: [
          {
            id: "US-2.1", role: "business analyst", action: "view all processes in an editable spreadsheet (Process Catalogue)",
            benefit: "I can browse, search, filter, and edit all processes in one place",
            ac: [
              "GET /api/processes returns all processes for tenant, sorted by number",
              "Table columns: Include, #, Category, Short Name, Full Description, AI Agent, Purpose, Inputs, Outputs, Human-in-the-Loop, KPI, Target, Achievement, Value Impact, Industry Benchmark, Traffic Light, Delete",
              "Click any cell → inline edit input appears; blur or Enter saves via PUT /api/processes/:id",
              "Optimistic update: local state updates immediately before API call",
              "Column headers are drag-reorderable (grip icon) and resizable (drag right edge)",
              "Search box filters by name/description; category dropdown filters by category",
              "Include checkbox toggles process into Portfolio/Process Map views",
            ],
          },
          {
            id: "US-2.2", role: "business analyst", action: "view processes as a horizontal tree diagram (Master Map)",
            benefit: "I can see the hierarchical relationships between categories and processes at a glance",
            ac: [
              "Horizontal tree: Level 1 = 8 category nodes; Level 2 = process short names; Level 3 = detail card",
              "Detail card shows: short name, full description, KPI, target, achievement, traffic light",
              "Clicking a category node expands/collapses its processes",
              "Clicking a process node opens the Level 3 detail card",
            ],
          },
          {
            id: "US-2.3", role: "operations manager", action: "drill into processes that are marked as 'included' via the Process Map",
            benefit: "I can navigate my live operational processes without noise from excluded items",
            ac: [
              "Three-panel navigation showing only processes where included=true",
              "Panel 1: category list; Panel 2: short process names for selected category; Panel 3: detail info card",
              "Info card prominently shows: Industry Benchmark, Target KPI, Achievement KPI, traffic light status",
              "Empty state shown if no processes are marked as included",
            ],
          },
          {
            id: "US-2.4", role: "process owner", action: "evaluate a process with AI to get a performance score",
            benefit: "I can quickly understand how my process is performing relative to its target",
            ac: [
              "Each process detail panel has an 'Evaluate with AI' button in an Evaluation section",
              "Button calls Claude (Anthropic) via internal API endpoint",
              "AI compares Achievement vs Target, returns: score (1–10), rating badge, analysis text, gaps list, recommendation",
              "Result stored as JSON in processes.evaluation column",
              "React state is updated directly without a separate GET call (no double-fetch)",
            ],
          },
          {
            id: "US-2.5", role: "administrator", action: "import processes from a blueprint template",
            benefit: "New tenants can be pre-populated with industry-standard processes",
            ac: [
              "Settings view has Blueprint import/export (admin only)",
              "Export: downloads processes as JSON blueprint file",
              "Import: accepts JSON file, bulk-inserts processes with correct tenant_id",
              "Seed script (scripts/src/seed.ts) seeds 100 nonprofit processes with pnpm --filter @workspace/scripts run seed",
            ],
          },
        ],
      },
      {
        num: "3", title: "Task Tracking & Queue Management",
        desc: "Tasks are the primary unit of work in BusinessOS. They can be created manually, generated from meeting action items, or created from mindmap nodes. Tasks have priority, status, assignee, due date, queue assignment, and approval status. Queues are pools of tasks that can be assigned to teams.",
        stories: [
          {
            id: "US-3.1", role: "team member", action: "view all tasks in a list or board view",
            benefit: "I can see what work needs to be done across the organisation",
            ac: [
              "Tasks view has List/Board toggle in the toolbar",
              "List view: sortable table with columns: #, Name, Priority, Status, Assignee, Queue, Due Date, Approval",
              "Board view: tasks grouped by queue in collapsible sections with Kanban-style cards",
              "Board cards show: name, priority badge, status, due date",
              "Filter toolbar: by queue, status, assignee, priority",
            ],
          },
          {
            id: "US-3.2", role: "team member", action: "create a task with full metadata",
            benefit: "I can track new work items immediately",
            ac: [
              "Create modal: name (required), description, priority (low/medium/high/urgent), status (todo/in-progress/done/blocked), due date, assigned_to (user:ID | agent:ID | workflow:ID | queue:ID), queue_id, approval_status",
              "POST /api/tasks creates the record with tenant_id from JWT",
              "task_number auto-incremented per tenant",
            ],
          },
          {
            id: "US-3.3", role: "queue manager", action: "manage task queues and pick up tasks from a queue",
            benefit: "I can organise work distribution across my team",
            ac: [
              "CRUD queues via GET/POST/PATCH/DELETE /api/queues",
              "Board view shows each queue as a column/section",
              "Inline actions on board cards: 'Pick Up' (assigns to current user), 'Approve', 'Reject'",
              "Pick Up action: PATCH /api/tasks/:id with {assignedTo: 'user:currentUserId', approvalStatus: 'approved'}",
            ],
          },
          {
            id: "US-3.4", role: "process owner", action: "convert a mindmap node into a real task",
            benefit: "I can capture action items from brainstorming sessions as trackable tasks",
            ac: [
              "Mindmap node context menu or node type selector has 'Convert to Task' option",
              "Converts node to task type (teal styling) and POST /api/tasks to create the record",
              "Task ID stored on the mindmap node as taskId",
              "Right-side panel appears for task nodes: all task fields editable, syncs via PATCH /api/tasks/:id",
            ],
          },
        ],
      },
      {
        num: "4", title: "AI Agent Configuration & Automation",
        desc: "AI Agents are configurable automation units powered by Claude. Each agent has a name, description, instructions prompt, run mode (adhoc or scheduled), tools (which BusinessOS data they can read/write), and optional knowledge base (URLs + uploaded files). Agents can be executed manually or on a schedule.",
        stories: [
          {
            id: "US-4.1", role: "automation engineer", action: "create and configure an AI agent",
            benefit: "I can define an intelligent automation that runs on my business data",
            ac: [
              "Agent form fields: name, description, instructions (system prompt for Claude), run_mode (adhoc | scheduled), trigger, tools (JSON array), output_dest_type, output_dest_id, agent_type (internal | external), external_config",
              "POST /api/ai-agents creates the agent with tenant_id",
              "Agent list shows all agents with: number, name, type badge, run mode, last run status",
            ],
          },
          {
            id: "US-4.2", role: "automation engineer", action: "add knowledge URLs and upload knowledge files to an agent",
            benefit: "The agent can reference specific documents and web pages when generating responses",
            ac: [
              "Knowledge URLs: POST /api/ai-agents/:id/knowledge-urls with {url, label}",
              "Knowledge files: POST /api/ai-agents/:id/knowledge-files (multipart/form-data), supports PDF, Word, Excel",
              "Files stored on disk under a configured upload path; metadata in agent_knowledge_files table",
              "List and delete endpoints for both URLs and files",
            ],
          },
          {
            id: "US-4.3", role: "automation engineer", action: "schedule an agent to run automatically",
            benefit: "Recurring automation tasks run without manual intervention",
            ac: [
              "Schedule types: once, daily, weekly",
              "Schedule fields: scheduled_at (timestamp), week_days (for weekly), is_active toggle",
              "CRUD schedules via /api/ai-agents/:id/schedules",
              "next_run_at and last_run_at tracked on schedule record",
              "POST /api/ai-agents/:id/run executes the agent immediately and logs to agent_run_logs",
            ],
          },
          {
            id: "US-4.4", role: "automation engineer", action: "set granular permissions for what data an agent can access",
            benefit: "Agents are restricted to only the data they need (principle of least privilege)",
            ac: [
              "Agent permissions mirror user permissions: module access, allowed categories, allowed processes, field-level canView/canEdit",
              "Stored in agent_module_access, agent_allowed_categories, agent_allowed_processes, agent_field_permissions tables",
              "GET/PUT /api/ai-agents/:id/permissions endpoint",
            ],
          },
          {
            id: "US-4.5", role: "user", action: "chat with the built-in AI assistant that can read and write business data",
            benefit: "I can query and update my process data using natural language",
            ac: [
              "Floating chatbot panel in the bottom-right of every view",
              "POST /api/anthropic/chat sends messages to Claude via SSE streaming",
              "Claude has access to tool functions: get_processes, update_process, create_activity, create_initiative, create_workflow, mark_checklist_item, run_sql_query (read-only)",
              "Tool calls shown live in the chat with amber (running) / green (success) / red (error) badges",
              "Up to 8 agentic tool-call iterations per message turn",
              "Conversation history maintained in messages table",
            ],
          },
        ],
      },
      {
        num: "5", title: "Mind Mapping & Visual Thinking",
        desc: "The mind map editor is an SVG-based canvas for visual brainstorming. Mind maps are stored in JSON format (nodes + edges). They live inside the Documents section's folder tree. Nodes can be freely positioned, connected, coloured, and converted to real task records.",
        stories: [
          {
            id: "US-5.1", role: "user", action: "create and open a mind map inside a folder",
            benefit: "I can organise brainstorming maps alongside my documents",
            ac: [
              "Mind maps are created from the Documents view by clicking '+ Mind Map' on a folder",
              "POST /api/mindmaps creates the record with {name, folderId, data: '{nodes:[],edges:[]}'}",
              "Clicking a mind map in the folder tree opens MindmapEditor in the right panel",
              "MindmapEditor loads data via GET /api/mindmaps/:id",
            ],
          },
          {
            id: "US-5.2", role: "user", action: "add, move, connect, colour, and delete nodes on the canvas",
            benefit: "I can freely structure my thoughts visually",
            ac: [
              "'Add Node' toolbar button creates a node at the canvas centre",
              "Nodes are draggable; releasing triggers auto-arrange (tree layout)",
              "'Connect' mode: click source node, then target node to draw a bezier edge",
              "Hover/select a node to reveal +Child and +Peer buttons for quick node creation",
              "Right-click context menu: change colour (colour picker with presets), delete node",
              "Click edge to select it; Delete key removes selected edge or node",
              "Node labels: click to select → click again to enter inline edit mode; Enter/Escape to commit",
              "Toolbar: Zoom In, Zoom Out, Fit View, Auto Arrange, Connect, Add Node",
              "Canvas: pan by dragging background; scroll to zoom; dot-grid background",
            ],
          },
          {
            id: "US-5.3", role: "user", action: "auto-save my mind map as I work",
            benefit: "I never lose my work if I close the tab or navigate away",
            ac: [
              "Every change calls updateMapData which debounces a PATCH /api/mindmaps/:id call by 800ms",
              "Header shows 'Saving…' during save and 'Saved ✓' with timestamp on success",
              "mapDataRef keeps a synchronous reference for pointer-event handlers (avoids stale closures)",
            ],
          },
          {
            id: "US-5.4", role: "project manager", action: "convert a mind map node into a tracked task",
            benefit: "Action items from brainstorming sessions flow directly into the task management system",
            ac: [
              "Node type can be changed to 'task' (from context menu or node panel)",
              "Converting creates a real task record via POST /api/tasks",
              "Task node shows teal border/background and a task badge icon",
              "Right-side panel opens for task nodes with editable fields: name, description, priority, status, assigned to, queue, due date, approval status",
              "Any field change in the panel fires PATCH /api/tasks/:id immediately",
            ],
          },
        ],
      },
      {
        num: "6", title: "Workflow Automation (Process Designer)",
        desc: "Workflows are visual, step-based automation processes. Each workflow has an ordered list of steps stored as JSON. Step types include: Action, Condition, Form, Call Another Workflow, and Run AI Agent. Workflows can be linked to forms and referenced from meetings and initiatives.",
        stories: [
          {
            id: "US-6.1", role: "operations analyst", action: "create and design a workflow with multiple step types",
            benefit: "I can formalise how work flows through my organisation",
            ac: [
              "Workflow list shows: number, name, description, step count, created date",
              "Workflow editor: drag-and-drop step reordering; add step by type; delete step",
              "Step types and colours: Action (blue), Condition (amber), Form (violet), Call Another Workflow (cyan), Run AI Agent (emerald)",
              "Each step: name, description; Action steps can declare 'Receives Data From' (Agent or Form) shown as a badge",
              "Steps stored as JSON array in workflows.steps column",
              "PATCH /api/workflows/:id auto-saves after every change",
            ],
          },
          {
            id: "US-6.2", role: "operations analyst", action: "link a workflow to a form document",
            benefit: "Form submissions can automatically trigger a workflow",
            ac: [
              "Form editor has a 'Linked Workflow' dropdown populated from GET /api/workflows",
              "Selected workflow ID stored in forms.linked_workflow_id",
              "Form view shows workflow badge when a workflow is linked",
            ],
          },
        ],
      },
      {
        num: "7", title: "Document Management (Forms & Templates)",
        desc: "The Documents section (internally 'forms') is a multi-purpose file cabinet. It contains: form templates with drag-and-drop field builder, form submission viewer, mind maps, and the wiki knowledge base — all organised in an infinitely-nestable folder tree.",
        stories: [
          {
            id: "US-7.1", role: "user", action: "organise documents, forms, mind maps, and wiki articles in a folder tree",
            benefit: "I can structure my organisation's knowledge and documents logically",
            ac: [
              "Left panel shows collapsible folder tree with +Folder and rename/delete actions",
              "Folders are infinitely nestable (parent_id self-reference on form_folders table)",
              "Folder tree items: Folders (📁), Forms (📋), Mind Maps (🧠), Wiki/URL/File knowledge items",
              "CRUD folders via GET/POST/PATCH/DELETE /api/forms/folders",
              "Deleting a folder deletes all its contents (CASCADE)",
            ],
          },
          {
            id: "US-7.2", role: "form builder", action: "design a form template with typed fields",
            benefit: "I can create structured data collection forms for my team or the public",
            ac: [
              "Form editor has 5 tabs: Fields, Settings, Preview, Linked, Submissions",
              "Drag-and-drop field reordering; field types: text, textarea, number, email, phone (with country selector), date, select (options list), checkbox, radio, file upload",
              "Each field: label, placeholder, required toggle, help text",
              "Settings tab: form name, description, publish slug, is_published toggle",
              "Published forms accessible at /forms/:slug without authentication",
              "Submissions tab: table of all submissions with view/delete actions",
            ],
          },
          {
            id: "US-7.3", role: "team member", action: "fill in and submit a form",
            benefit: "I can submit structured data that is stored and viewable by administrators",
            ac: [
              "Data Entry mode shows the form fields for filling in",
              "Submission sidebar shows previous submissions for the same form",
              "POST /api/forms/:id/submissions stores {submittedBy, submittedByName, submissionData}",
              "Submitted data shown in the Submissions tab of the form editor",
            ],
          },
        ],
      },
      {
        num: "8", title: "Wiki Knowledge Base",
        desc: "The knowledge base stores wiki articles, URL bookmarks, and uploaded files (PDF, Word, Excel). Items have vector embeddings (via @huggingface/transformers, 384-dimension) stored in a pgvector column for semantic search. The AI assistant can search the knowledge base when answering questions.",
        stories: [
          {
            id: "US-8.1", role: "knowledge manager", action: "create wiki articles with a rich text editor",
            benefit: "I can document processes, policies, and procedures in a structured way",
            ac: [
              "Wiki editor: title field + rich text content area (supports markdown-style formatting)",
              "Auto-save on blur/change via PATCH /api/knowledge/:id",
              "Wiki items stored in knowledge_items table with type='wiki'",
            ],
          },
          {
            id: "US-8.2", role: "knowledge manager", action: "add URL bookmarks and upload files to the knowledge base",
            benefit: "I can centralise all reference material regardless of format",
            ac: [
              "URL items: type='url', stores url + title + content (fetched description)",
              "File upload: POST /api/knowledge/upload (multipart); supports PDF, Word, Excel, text; stores file_path, file_size, mime_type, file_name",
              "All item types shown in the folder tree with type-appropriate icons",
            ],
          },
          {
            id: "US-8.3", role: "user", action: "search the knowledge base using natural language",
            benefit: "I can find relevant documents without knowing the exact title",
            ac: [
              "Search input triggers POST /api/knowledge/search with {query}",
              "Server generates a 384-dim embedding for the query using @huggingface/transformers (all-MiniLM-L6-v2 model)",
              "pgvector cosine similarity search against knowledge_items.embedding_vec",
              "Returns ranked results; clicking a result navigates to the item",
              "POST /api/knowledge/:id/embed generates and stores the embedding for an item",
            ],
          },
        ],
      },
      {
        num: "9", title: "Calendar & Event Management",
        desc: "The Calendar view shows a monthly grid of events. Events have a title, start/end date, optional start/end time, colour, description, and all-day flag. Events are tenant-isolated.",
        stories: [
          {
            id: "US-9.1", role: "team member", action: "view, create, edit, and delete calendar events",
            benefit: "I can track important dates and deadlines in a visual monthly view",
            ac: [
              "Monthly grid calendar view; today highlighted; events shown as coloured pills on their date",
              "Click empty date → create event modal with: title (required), start_date, end_date, start_time, end_time, color picker (default #10b981), description, all_day toggle",
              "Click existing event → edit modal pre-filled with event data",
              "Delete button in edit modal with confirmation",
              "CRUD via GET/POST/PATCH/DELETE /api/calendar-events",
              "Events crossing multiple days shown on each day they span",
            ],
          },
        ],
      },
      {
        num: "10", title: "Meetings Management",
        desc: "Meetings are structured records with agenda, attendees, discussion minutes, and action items. Action items can be converted to real task records with one click. Meetings can be linked to workflows and AI agents.",
        stories: [
          {
            id: "US-10.1", role: "meeting organiser", action: "create and manage meetings with full agenda and attendee tracking",
            benefit: "I can run structured, documented meetings that produce traceable outcomes",
            ac: [
              "Meeting list: title, type badge (Physical/Virtual/Hybrid), date, organiser, linked process",
              "Create modal: title, type, meeting_date, start_time, end_time, location, virtual_link, organiser_id, process_id",
              "Meeting detail panel has 6 tabs: Overview, Agenda, Attendees, Discussions, Actions, Links",
              "Agenda tab: ordered list of agenda items; drag-to-reorder; add/delete items",
              "Attendees tab: select from users list or add external attendee (name + email)",
              "Discussions tab: free-text minutes textarea",
              "Actions tab: action items with assignee, due date, priority; '→ Task' button to create real task",
              "Links tab: select linked workflows and AI agents from dropdowns",
              "All changes auto-saved via PATCH /api/meetings/:id",
            ],
          },
          {
            id: "US-10.2", role: "meeting organiser", action: "convert a meeting action item to a tracked task with one click",
            benefit: "Commitments made in meetings immediately appear in the task management system",
            ac: [
              "Each action item in the Actions tab has a '→ Task' button",
              "POST /api/meetings/:id/actions/:aid/create-task creates a task record with name, assignee, due date, priority from the action item",
              "Button changes to a 'View Task' link after conversion showing the task ID",
            ],
          },
        ],
      },
      {
        num: "11", title: "Strategic Planning & Initiatives",
        desc: "The Strategy section covers mission, vision, values, strategic goals, and initiatives. Initiatives can be linked to strategic goals, assigned to users, and associated with specific processes. The AI assistant can create and update initiatives via tool calls.",
        stories: [
          {
            id: "US-11.1", role: "executive", action: "define and edit the organisation's mission, vision, and values",
            benefit: "The entire organisation has a clear, documented strategic direction",
            ac: [
              "Strategy view has editable sections: Mission, Vision, Core Values (list), Strategic Goals",
              "PUT /api/strategy upserts the strategy record for the tenant",
              "Rich text editing for mission and vision; bullet list for values",
            ],
          },
          {
            id: "US-11.2", role: "strategy manager", action: "create strategic goals and link initiatives to them",
            benefit: "I can track how operational initiatives ladder up to strategic objectives",
            ac: [
              "Strategic goals: name, description, target date; CRUD via /api/strategy/goals",
              "Initiatives list grouped by strategic goal with sticky headers",
              "Goal badges shown on initiative cards and in detail panel",
              "Create Initiative modal has 'Strategic Goal' dropdown populated from GET /api/strategy/goals",
              "Initiative fields: name, goals text, achievement text, start_date, end_date, goal_id, assignees (multi-user), linked processes, URLs",
            ],
          },
          {
            id: "US-11.3", role: "strategy manager", action: "view all initiatives in a grouped list with a slide-out detail panel",
            benefit: "I can monitor all ongoing initiatives and their alignment to strategic goals at a glance",
            ac: [
              "Initiatives list: grouped by strategic goal, sorted by start date",
              "Each row: initiative_id, name, goal badge, start date, end date, assignee avatars, status indicator",
              "Click a row → slide-out right panel with tabs: Overview, Links",
              "Overview tab: all fields editable inline; goal selector dropdown",
              "Links tab: assignees (select users), linked processes (select from process list), URL list (add/remove)",
            ],
          },
        ],
      },
      {
        num: "12", title: "Governance & Compliance",
        desc: "The Governance section manages compliance standards (ISO, GDPR, local regulations, etc.). Each standard can have uploaded reference documents and can be linked to relevant processes. Claude can auto-suggest which processes relate to a standard.",
        stories: [
          {
            id: "US-12.1", role: "compliance officer", action: "create and manage compliance standards with supporting documents",
            benefit: "I can maintain a structured record of all regulatory requirements the organisation must meet",
            ac: [
              "Governance standards list: compliance_name, compliance_authority, reference_url",
              "CRUD via /api/governance",
              "Each standard has a detail panel with: standard details, uploaded documents, linked processes",
              "Document upload: POST /api/governance/:id/documents (multipart); stores file on disk",
              "Document list shows: original_name, file_size, upload date, download link, delete button",
            ],
          },
          {
            id: "US-12.2", role: "compliance officer", action: "use AI to identify which processes relate to a compliance standard",
            benefit: "I can quickly discover compliance gaps without manually reviewing every process",
            ac: [
              "Each governance standard detail panel has an 'Auto-populate with AI' button",
              "POST /api/governance/:id/populate-ai calls Claude with the standard name and all process descriptions",
              "Claude returns a list of relevant process IDs with reasoning",
              "Matched processes are automatically linked via the process_governance junction table",
              "User can manually add/remove process links via the Linked Processes section",
            ],
          },
        ],
      },
      {
        num: "13", title: "Reporting & Dashboards",
        desc: "Reports can be built from any process data fields using a drag-and-drop field configurator. Dashboards are configurable widget grids stored per-tenant. Both are designed for non-technical users to build their own views without writing queries.",
        stories: [
          {
            id: "US-13.1", role: "manager", action: "build a custom report by selecting and ordering fields from process data",
            benefit: "I can generate targeted reports without needing SQL or developer help",
            ac: [
              "Reports list: name, field count, created date",
              "Report builder: left panel = available fields; right panel = selected fields (drag to reorder)",
              "Available fields sourced from process schema (category, name, KPI, target, achievement, traffic light, etc.)",
              "Generated report rendered as a filterable table",
              "CRUD reports via /api/reports; report config (field list + order) stored in custom_reports table",
            ],
          },
          {
            id: "US-13.2", role: "manager", action: "configure a dashboard with widgets showing key metrics",
            benefit: "I can see the health of my operations at a glance on my home screen",
            ac: [
              "Dashboard view shows a grid of configurable widgets",
              "Widget types: process count by category, traffic light summary, KPI vs target chart, top tasks, recent activities",
              "Drag-and-drop widget reordering; add/remove widgets from a widget picker",
              "Dashboard layout stored per-tenant via PUT /api/dashboards",
              "Dashboard stored in localStorage as fallback if API is unavailable",
            ],
          },
        ],
      },
      {
        num: "14", title: "Navigation, Settings & Personalisation",
        desc: "The sidebar navigation is fully customisable per user. Items can be reordered within sections and sections can be reordered. Settings include colour theme selection (5 themes). All preferences are persisted to the database and restored on login.",
        stories: [
          {
            id: "US-14.1", role: "user", action: "reorder sidebar navigation items and sections by dragging",
            benefit: "I can put the features I use most at the top of my navigation",
            ac: [
              "Sidebar items and section headers have a drag handle (grip icon)",
              "Items can be reordered within their section; sections can be reordered",
              "Order saved to nav_preferences table via PUT /api/nav-preferences",
              "Preferences restored from GET /api/nav-preferences on login",
              "'Reset to Default' button restores original order",
            ],
          },
          {
            id: "US-14.2", role: "user", action: "switch between 5 colour themes (light, dark, and variants)",
            benefit: "I can personalise the app's appearance to my preference",
            ac: [
              "Settings view has a theme selector with 5 options: Default Light, Default Dark, Ocean, Forest, Sunset",
              "Theme applied by setting a class on the <html> element and persisted to localStorage",
              "All UI uses CSS variables (--background, --foreground, --card, --primary, etc.) so themes apply globally",
              "User's color_scheme preference also saved to users.color_scheme column",
            ],
          },
          {
            id: "US-14.3", role: "user", action: "see breadcrumb navigation showing my current location in the app",
            benefit: "I always know where I am and can navigate up the hierarchy",
            ac: [
              "Layout header shows: Section > View label breadcrumb",
              "Breadcrumb uses VIEW_META record keyed by activeView to get label and section",
              "null-safety: meta?.section, meta?.label ?? activeView (fallback to raw view ID)",
              "Back button appears when there is navigation history (navHistory stack)",
            ],
          },
        ],
      },
      {
        num: "15", title: "Audit Trail & System Administration",
        desc: "Every create, update, delete, import, export, and AI action is recorded in the audit_logs table with user, tenant, action type, entity, and payload. The Configuration view provides admin-only settings like user category management. Remaining AI credits are tracked per tenant.",
        stories: [
          {
            id: "US-15.1", role: "administrator", action: "view a full audit log of all actions taken in the system",
            benefit: "I can investigate any change and maintain a compliance record of all activity",
            ac: [
              "Audit & Logs view: paginated table of log entries",
              "Columns: timestamp, user, action type (CREATE/UPDATE/DELETE/AI/IMPORT/EXPORT), entity type, entity ID, summary",
              "Filter by: date range, action type, user",
              "GET /api/audit-logs returns entries for tenant, sorted by created_at DESC",
              "All route handlers write to audit_logs after successful mutations",
            ],
          },
          {
            id: "US-15.2", role: "administrator", action: "manage user category types in the Configuration view",
            benefit: "I can define the categories that users are assigned to, tailored to my organisation",
            ac: [
              "Configuration view has a 'User Categories' section",
              "Default categories auto-seeded: Employee, Director, Customer, Partner, Owner, Regulator",
              "Add/rename/delete categories via /api/org/user-categories",
              "category dropdown in user Create/Edit form uses these values",
            ],
          },
        ],
      },
    ];

    for (const epic of epics) {
      const blocks = epicBlock(epic.num, epic.title, epic.desc, epic.stories);
      children.push(...blocks);
    }

    // ── 8. CLOUD CODE RECONSTRUCTION INSTRUCTIONS ─────────────────────────────
    children.push(
      pageBreak(),
      h1("8. Cloud Code Reconstruction Instructions"),
      body("The following instructions tell an AI coding assistant (e.g. Claude Code, Cursor, Windsurf) exactly how to recreate BusinessOS from scratch in a Replit-hosted pnpm monorepo environment."),
      ...spacer(1),

      h2("Step 1 — Scaffold the monorepo"),
      bullet("Create a pnpm workspace with pnpm-workspace.yaml listing artifacts/* and lib/*"),
      bullet("Root tsconfig.base.json: target ESNext, module Node16, strict true, composite true, emitDeclarationOnly true"),
      bullet("Root tsconfig.json: references all packages"),
      bullet("Root package.json: scripts for typecheck (tsc --build) and build (pnpm -r build)"),
      ...spacer(1),

      h2("Step 2 — Create lib/db"),
      bullet("Package: @workspace/db. Install drizzle-orm, pg, drizzle-kit, @types/pg"),
      bullet("src/index.ts: read DATABASE_URL from process.env; create a pg Pool; export drizzle(pool, {schema})"),
      bullet("src/schema/: one file per domain entity as shown in Section 4"),
      bullet("Add dotenv loading as the first import in the API server entry point (src/env.ts)"),
      bullet("Push schema with: pnpm --filter @workspace/db run push"),
      bullet("Enable pgvector extension in PostgreSQL before push: CREATE EXTENSION IF NOT EXISTS vector;"),
      ...spacer(1),

      h2("Step 3 — Create artifacts/api-server"),
      bullet("Package: @workspace/api-server. Install express@5, pino, pino-http, jsonwebtoken, bcryptjs, cors, cookie-parser, multer, dotenv, @anthropic-ai/sdk, docx"),
      bullet("src/env.ts: import dotenv and call config({path: '../../../.env'}) — this must be the FIRST import in index.ts"),
      bullet("src/index.ts: import './env' first; then app and logger; bind to process.env.PORT"),
      bullet("src/app.ts: create Express app; register pino-http; apply authMiddleware globally; mount all routers at /api"),
      bullet("src/middleware/auth.ts: extract Bearer token; verify JWT_SECRET; set req.auth = {userId, tenantId, role}; skip /api/auth/login and /api/healthz"),
      bullet("src/routes/: one router file per domain as shown in Section 5; register all routers in src/routes/index.ts"),
      bullet("Tenant isolation pattern: const auth = (req as any).auth; const tenantId = auth?.tenantId ?? null; add WHERE tenant_id = ${tenantId} to all queries"),
      bullet("Superuser pattern: tenantId=null skips tenant filtering and routes to TenantManagementPage on the frontend"),
      ...spacer(1),

      h2("Step 4 — Create artifacts/business-os"),
      bullet("Package: @workspace/business-os. Scaffold with Vite + React + TypeScript template"),
      bullet("Install: tailwindcss, shadcn/ui components, framer-motion, lucide-react, @tanstack/react-query"),
      bullet("Configure Vite server.proxy: '/api' → 'http://localhost:<API_PORT>'"),
      bullet("vite.config.ts: server.allowedHosts = true (required for Replit proxy)"),
      bullet("src/contexts/AuthContext.tsx: read/write JWT from localStorage key business-os-auth-token; useAuth() and useUser() hooks"),
      bullet("src/components/layout.tsx: defines ActiveView union type; SECTIONS_DEF; ITEMS_DEF (all nav items with sectionId); VIEW_META (label + section per view); getIcon() switch; drag-reorder sidebar; breadcrumb header"),
      bullet("src/pages/dashboard.tsx: useState<ActiveView>; renders correct view component inside AnimatePresence"),
      bullet("API calls: const API = '/api'; always pass Authorization: Bearer ${token} header from useAuth()"),
      bullet("Theme: CSS variables on :root; 5 themes as class variants on <html>; stored in localStorage and users.color_scheme"),
      ...spacer(1),

      h2("Step 5 — Environment variables"),
      bullet("DATABASE_URL — PostgreSQL connection string (required)"),
      bullet("JWT_SECRET — secret for signing/verifying JWTs (defaults to 'business-os-jwt-secret-2024' if not set)"),
      bullet("PORT — port for the API server (assigned by Replit automatically)"),
      bullet("NODE_ENV — 'development' | 'production'"),
      bullet("Create .env at repo root; add .env to .gitignore"),
      ...spacer(1),

      h2("Step 6 — Seed initial data"),
      bullet("Run the seed script: pnpm --filter @workspace/scripts run seed"),
      bullet("This inserts 100 nonprofit processes across 8 categories into the processes table"),
      bullet("Create the superuser and default tenant admin accounts via POST /api/auth/tenants and POST /api/auth/tenants/:id/admin"),
      ...spacer(1),

      h2("Step 7 — Critical implementation notes"),
      bullet("DB schema naming quirk: processDescription (TypeScript) maps to process_name (DB column); processName maps to process_short_name"),
      bullet("Mindmap + buttons: both Add Child and Add Peer SVG <g> elements need BOTH onPointerDown AND onPointerUp with e.stopPropagation() to prevent parent node's handleNodePointerUp from firing and removing the button before click registers"),
      bullet("SVG pointer capture: handleNodePointerDown calls svgRef.current.setPointerCapture(e.pointerId) so all subsequent pointer events go to the SVG; handleNodePointerUp on the node <g> only fires when there is no SVG pointer capture (i.e. for child element clicks that stop pointerdown propagation)"),
      bullet("Initiative field naming: raw SQL returns snake_case; use helper functions ini_id(), ini_start(), ini_end() to normalise field access in the frontend"),
      bullet("Anthropic chat: use SSE (Server-Sent Events) for streaming; the agentic loop calls Claude up to 8 times per turn; tool results are sent back as tool_result content blocks"),
      bullet("Vector search: run the @huggingface/transformers pipeline lazily (first call initialises the model); use cosine similarity operator <=> with pgvector"),
      bullet("File storage: store uploaded files on disk (not in DB); record file_path, stored_name (UUID filename), original_name, mime_type, file_size in the relevant table"),
      ...spacer(1),
      divider(),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 },
        children: [new TextRun({ text: "— End of Document —", italics: true, color: MUTED, size: 20 })],
      }),
    );

    // ── Build & send ───────────────────────────────────────────────────────────
    const doc = new Document({
      creator: "BusinessOS",
      title: "BusinessOS Technical Specification",
      description: "Complete technical specification, epics, user stories, and reconstruction instructions for BusinessOS",
      numbering: {
        config: [{
          reference: "default",
          levels: [{
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
          }],
        }],
      },
      styles: {
        default: {
          document: {
            run: { font: "Calibri", size: 22 },
          },
        },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            run: { size: 40, bold: true, color: BRAND, font: "Calibri" },
            paragraph: { spacing: { before: 400, after: 160 } },
          },
          {
            id: "Heading2",
            name: "Heading 2",
            basedOn: "Normal",
            run: { size: 32, bold: true, color: ACCENT, font: "Calibri" },
            paragraph: { spacing: { before: 320, after: 120 } },
          },
          {
            id: "Heading3",
            name: "Heading 3",
            basedOn: "Normal",
            run: { size: 26, bold: true, color: "374151", font: "Calibri" },
            paragraph: { spacing: { before: 200, after: 80 } },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1.1),
                right: convertInchesToTwip(1.1),
              },
            },
          },
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    const filename = `BusinessOS-Specification-${new Date().toISOString().slice(0, 10)}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err: any) {
    console.error("spec-doc error:", err);
    res.status(500).json({ error: "Failed to generate document", detail: String(err?.message ?? err) });
  }
});

export { router as specDocRouter };
