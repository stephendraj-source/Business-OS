import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { workflowsTable } from "./workflows";
import { aiAgentsTable } from "./ai-agents";

export const formFoldersTable = pgTable("form_folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("New Folder"),
  parentId: integer("parent_id"),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FormFolder = typeof formFoldersTable.$inferSelect;

export const formsTable = pgTable("forms", {
  id: serial("id").primaryKey(),
  formNumber: integer("form_number").notNull().default(1),
  name: text("name").notNull().default("New Form"),
  description: text("description").notNull().default(""),
  fields: text("fields").notNull().default("[]"),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  publishSlug: text("publish_slug").unique(),
  isPublished: boolean("is_published").notNull().default(false),
  linkedWorkflowId: integer("linked_workflow_id").references(() => workflowsTable.id, { onDelete: "set null" }),
  linkedAgentId: integer("linked_agent_id").references(() => aiAgentsTable.id, { onDelete: "set null" }),
  folderId: integer("folder_id").references(() => formFoldersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Form = typeof formsTable.$inferSelect;
