# Workspace

## Overview

Nonprofit Operating System — a full-stack business operating system for nonprofits, built on a pnpm workspace monorepo using TypeScript.

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

- **Process Matrix**: Editable spreadsheet of all 100 operational processes across 8 categories
  - Inline cell editing with save to backend
  - Search and filter by category
  - 10 fields per process: #, Category, Process Name, AI Agent, Purpose, Inputs, Outputs, Human-in-the-Loop, KPI, Estimated Value Impact
- **Architecture Tree**: Horizontal tree view (expands left-to-right)
  - Level 1: 8 category nodes
  - Level 2: Process names under selected category
  - Level 3: Full process detail card
- Dark professional UI with sidebar navigation

### Database Schema

- `processes` table: All 100 nonprofit processes pre-seeded with data from the XLSX file
  - `id`, `number`, `category`, `process_name`, `ai_agent`, `purpose`, `inputs`, `outputs`, `human_in_the_loop`, `kpi`, `estimated_value_impact`

### API Endpoints

- `GET /api/processes` — list all 100 processes
- `GET /api/processes/:id` — get one process
- `PUT /api/processes/:id` — update a process
- `GET /api/categories` — list distinct categories
- `GET /api/healthz` — health check

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/scripts run seed` — seed 100 processes into database
- `pnpm --filter @workspace/api-spec run codegen` — re-generate API client from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push schema changes to database
