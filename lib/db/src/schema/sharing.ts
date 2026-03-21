import { pgTable, serial, integer, text, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { users } from "./users";
import { roles } from "./org-structure";
import { groups } from "./org-structure";
import { aiAgentsTable } from "./ai-agents";

// ── Custom Reports ─────────────────────────────────────────────────────────────

export const customReportsTable = pgTable("custom_reports", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  title: text("title").notNull(),
  description: text("description").default(""),
  type: text("type").notNull().default("table"),
  fields: json("fields").$type<string[]>().notNull().default([]),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reportShares = pgTable("report_shares", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => customReportsTable.id, { onDelete: "cascade" }),
  sharedWithUserId: integer("shared_with_user_id").references(() => users.id, { onDelete: "cascade" }),
  sharedWithRoleId: integer("shared_with_role_id").references(() => roles.id, { onDelete: "cascade" }),
  sharedWithGroupId: integer("shared_with_group_id").references(() => groups.id, { onDelete: "cascade" }),
  canEdit: boolean("can_edit").notNull().default(false),
});

// ── Dashboards ─────────────────────────────────────────────────────────────────

export const dashboardsTable = pgTable("dashboards", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  name: text("name").notNull(),
  widgets: json("widgets").$type<object[]>().notNull().default([]),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dashboardShares = pgTable("dashboard_shares", {
  id: serial("id").primaryKey(),
  dashboardId: integer("dashboard_id").notNull().references(() => dashboardsTable.id, { onDelete: "cascade" }),
  sharedWithUserId: integer("shared_with_user_id").references(() => users.id, { onDelete: "cascade" }),
  sharedWithRoleId: integer("shared_with_role_id").references(() => roles.id, { onDelete: "cascade" }),
  sharedWithGroupId: integer("shared_with_group_id").references(() => groups.id, { onDelete: "cascade" }),
  canEdit: boolean("can_edit").notNull().default(false),
});

// ── Agent Shares ───────────────────────────────────────────────────────────────

export const agentShares = pgTable("agent_shares", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => aiAgentsTable.id, { onDelete: "cascade" }),
  sharedWithUserId: integer("shared_with_user_id").references(() => users.id, { onDelete: "cascade" }),
  sharedWithRoleId: integer("shared_with_role_id").references(() => roles.id, { onDelete: "cascade" }),
  sharedWithGroupId: integer("shared_with_group_id").references(() => groups.id, { onDelete: "cascade" }),
  privilege: text("privilege").notNull().default("view"),
});
