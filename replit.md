# Workspace

## Overview

Nonprofit Operating System — a full-stack business operating system for nonprofits, built on a pnpm workspace monorepo using TypeScript.

## Recent Features Added
- **Mind Map Tool**: Full SVG-based mind map editor integrated into the Forms & Documents section. Create mind maps under any folder. Features: pan+zoom canvas, draggable nodes, bezier edge connections, double-click label editing, color picker, Connect mode (click two nodes to draw an edge), Fit View, Delete. Node "Convert to Task" button creates a real task record in the Tasks system (POST /api/tasks); editing task fields (priority, status, assigned to, queue, due date, approval status, etc.) in the side panel immediately syncs to the real task record (PATCH /api/tasks/:id). Task nodes show teal styling + status/priority summary. Mindmaps stored in `mindmaps` table (id, name, tenant_id, folder_id, data TEXT as JSON, created_at, updated_at). API: GET/POST/GET/:id/PATCH/:id/DELETE /api/mindmaps.
- **Queue Board View for Tasks**: List/Board toggle in the Tasks view. Board groups tasks by queue in collapsible sections; "Pick Up", "Approve", "Reject" inline actions.
- **AI assistant database writes**: The chat assistant now uses Anthropic tool calling with an agentic loop. It can update process fields (KPI, target, achievement, traffic light, benchmark, included), create/update activities, create/update initiatives, create workflows, mark checklist items as met/not met, and run read-only SQL queries. Tool calls are shown live during streaming with amber/green/red badges. Supports up to 8 tool call iterations per message.
- **User Categories**: `category` column on `users` table; `user_categories` table with CRUD API at `/org/user-categories`; category dropdown in CreateUserModal and ProfileTab; category badge column in users list; "User Categories" section in Configuration view (auto-seeded defaults: Employee, Director, Customer, Partner, Owner, Regulator).
- **Forms module restructured**: The Forms section now has two modes — "Report Templates" (the template designer) and "Data Entry" (form fill-in with stored submissions). Submissions stored in `form_submissions` DB table (form_id, tenant_id, submitted_by, submitted_by_name, submission_data jsonb, created_at). Template builder now has a 5th "Submissions" tab to view/delete all responses. Data Entry mode shows a split panel: fill-in form on the left + submission history sidebar on the right.
- **Phone field in forms**: `phone` field type with country selector (30+ countries, Singapore default) in both form builder and public forms
- **User phone field**: `phone` column on `users` table, editable via CreateUserModal and ProfileTab
- **Workflow step data sources**: Action steps can declare "Receives Data From" (Agent or Form) — shown as a badge in view mode
- **Workflow step types**: Call Another Workflow (cyan) and Run AI Agent (emerald) — new step types in the designer alongside Action, Condition, Form
- **AI Evaluation on processes**: Every process detail panel has an "Evaluation" section with an "Evaluate with AI" button — calls Claude to compare Achievement vs Target, returns score (1–10), rating badge, analysis, gaps, and recommendation; stored as JSON in `processes.evaluation` column; updates React Query cache directly (no double PUT)

## Navigation (sidebar names)
- **Process Catalogue** (was "Process Matrix") — editable process table
- **Process Map** (was "Architecture Tree") — horizontal tree diagram
- **Portfolio Map** (was "Process Map") — drill-down category/process info card view
- **Portfolio Catalogue** (was "Portfolio") — filtered process table for included processes
- **Governance** — compliance standards management with document uploads and AI population
- **AI Agents** — AI agent management with knowledge bases, schedulers, and Claude-powered execution
- **Connectors** — Salesforce and integration config
- **Dashboards** — configurable widget dashboard (stored in localStorage)
- **Reports** — built-in and custom reports with drag-and-drop field configuration
- **Audit & Logs** — full audit trail of all create/update/delete/import/export/AI actions
- **Settings** — colour theme selector (5 themes, persisted in localStorage); Blueprint export/import (admin only)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, Tailwind CSS, shadcn/ui, Framer Motion

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── nonprofit-os/       # React + Vite frontend (served at /)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed.ts         # Seeds 100 nonprofit processes into DB
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Features

### Nonprofit OS (`artifacts/nonprofit-os`)

#### Process Matrix
- Editable spreadsheet of all 101 operational processes across 8 categories (101 = original 100 + Grant Approval)
- **Include checkbox** — toggle processes into Portfolio / Process Map
- **Delete row** — two-click confirmation trash icon on each row
- **Inline cell editing** — click any cell to edit; saves to backend instantly with optimistic update
- **Column reordering** — drag column headers (grip icon) to rearrange
- **Column resizing** — drag right edge of column header to resize
- **Horizontal scroll** — table scrolls horizontally to fit all 16 columns
- **Search + category filter** in toolbar
- Columns: Include, #, Category, Process Name (short), Process Description, AI Agent, Purpose, Inputs, Outputs, Human-in-the-Loop, KPI, Target, Achievement, Value Impact, Industry Benchmark, Delete

#### Architecture Tree
- Horizontal tree view (expands left-to-right), all processes
- Level 1: 8 category nodes; Level 2: Process names; Level 3: Full detail card
- Detail card now shows short process name + full description

#### Process Map
- Horizontal three-panel navigation showing only **included** processes
- Level 1: Categories; Level 2: Short process names; Level 3: Info card
- Info card prominently shows: Industry Benchmark, Target KPI, Achievement KPIs
- Empty state prompt if no processes are included

#### Portfolio
- Table showing only included processes (same table as Process Matrix, pre-filtered)
- Same editing, reorder, resize capabilities

### Database Schema

- `processes` table: 101 processes (100 original + Grant Approval at #23)
  - Core: `id`, `number`, `category`
  - Names: `process_name` (= processDescription, full description), `process_short_name` (= processName, 2-4 word summary)
  - Agent/ops: `ai_agent`, `purpose`, `inputs`, `outputs`, `human_in_the_loop`, `kpi`
  - Financial: `estimated_value_impact`, `industry_benchmark`
  - New: `included` (boolean), `target` (text), `achievement` (text)
- Grant Writing (#22) replaced by Grant Assessment; Grant Approval added at #23

### Multi-Tenancy & Authentication

The platform is fully multi-tenant with JWT-based authentication.

### Auth Architecture
- **JWT tokens**: 30-day expiry, stored in `localStorage` key `nonprofit-os-auth-token`
- **Payload**: `{ userId, tenantId, role }`
- **Middleware**: `artifacts/api-server/src/middleware/auth.ts` — `authMiddleware` applied globally in `app.ts`; sets `req.auth = { userId, tenantId, role }`
- **AuthContext**: `artifacts/nonprofit-os/src/contexts/AuthContext.tsx` — replaces old UserContext; exports `useAuth()`, `useUser()` (backward compat), `AuthProvider`
- **UserContext**: now a re-export shim for `AuthContext` — all existing components using `useUser()` work unchanged

### Users & Roles
- **superuser** (`stephen.raj@insead.edu` / `stryker`): `tenantId=null`, routes to `TenantManagementPage`
- **admin** (`stephen.raj@coryphaeus.ai` / `admin123`): `tenantId=1`, routes to main app dashboard
- All existing data migrated to **default tenant** (id=1, slug='default')

### DB Schema
- `tenants` table: `id`, `name`, `slug`, `status`
- `tenant_id` column added to: `users`, `processes`, `workflows`, `ai_agents`, `groups`, `roles`, `initiatives`, `conversations`, `governance_standards`, `checklists`, `custom_reports`, `dashboards`

### Tenant Isolation
All route handlers filter by `auth.tenantId` when present:
- `processes.ts`, `users.ts`, `workflows.ts`, `ai-agents.ts`, `reports.ts`, `dashboards.ts`, `org.ts`

### Auth API Endpoints
- `POST /api/auth/login` → `{ token, user }`
- `GET /api/auth/me` → current user (requires Bearer token)
- `POST /api/auth/logout` → clears session
- `GET /api/auth/tenants` (superuser only) → list all tenants
- `POST /api/auth/tenants` (superuser only) → create tenant
- `PATCH /api/auth/tenants/:id` (superuser only) → update tenant
- `DELETE /api/auth/tenants/:id` (superuser only) → delete tenant
- `POST /api/auth/tenants/:id/admin` (superuser only) → create tenant admin user

### Frontend Routing
`App.tsx` renders based on auth state:
- No `currentUser` → `<LoginPage />`
- `isSuperUser` → `<TenantManagementPage />`
- Authenticated tenant user → main app with `<Layout>` + sidebar

## API Endpoints

- `GET /api/processes` — list all 101 processes
- `GET /api/processes/:id` — get one process
- `PUT /api/processes/:id` — update any field(s)
- `DELETE /api/processes/:id` — delete a process
- `GET /api/categories` — list distinct categories
- `GET /api/healthz` — health check

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/scripts run seed` — seed processes into database
- `pnpm --filter @workspace/api-spec run codegen` — re-generate API client from OpenAPI spec (run after every OpenAPI change)
- `pnpm --filter @workspace/db run push` — push schema changes to database (run after every schema change)

## User Management — Org Structure & Roles

The Users admin section (Admin → Users) has three top-level views:

### Users
- List, create, edit, delete users
- Per-user detail panel with tabs: Profile, Modules, Data Access, Fields, Org

### Roles
- Create/edit/delete custom roles (name, description, colour)
- Add/remove multiple users per role

### Org Structure
- **Divisions** (top-level grouping, blue)
- **Departments** — belong to a division (violet)
- **Projects** — belong to a division and/or department (green)
- Hierarchical tree view: Divisions → Departments → Projects
- Inline edit panel (name, description, parent assignment)

### User Org Tab
Each user's detail panel has an "Org" tab for assigning:
- Roles, Divisions, Departments, Projects

### Schema Tables Added
- `org_roles`, `org_role_memberships`
- `divisions`, `departments`, `projects`
- `user_divisions`, `user_departments`, `user_projects`

### API Endpoints Added
- `GET/POST /api/org/roles` — list/create roles
- `PATCH/DELETE /api/org/roles/:id` — update/delete role
- `GET/PUT /api/org/roles/:id/members` — get/set role members
- `GET/POST/PATCH/DELETE /api/org/divisions` — CRUD divisions
- `GET/POST/PATCH/DELETE /api/org/departments` — CRUD departments
- `GET/POST/PATCH/DELETE /api/org/projects` — CRUD projects
- `GET/PUT /api/org/users/:id/memberships` — get/set user org memberships
- `GET /api/org/tree` — full org tree snapshot
