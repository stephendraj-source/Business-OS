# Workspace

## Overview

Nonprofit Operating System — a full-stack business operating system for nonprofits, built on a pnpm workspace monorepo using TypeScript.

## Navigation (sidebar names)
- **Process Catalogue** (was "Process Matrix") — editable process table
- **Process Map** (was "Architecture Tree") — horizontal tree diagram
- **Portfolio Map** (was "Process Map") — drill-down category/process info card view
- **Portfolio Catalogue** (was "Portfolio") — filtered process table for included processes
- **Connectors** — Salesforce and integration config
- **Dashboards** — configurable widget dashboard (stored in localStorage)
- **Audit & Logs** — full audit trail of all create/update/delete/import/export/AI actions
- **Settings** — colour theme selector (5 themes, persisted in localStorage)

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

### API Endpoints

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
