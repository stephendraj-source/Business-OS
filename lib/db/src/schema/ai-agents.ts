import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const aiAgentsTable = pgTable("ai_agents", {
  id: serial("id").primaryKey(),
  agentNumber: integer("agent_number").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  tools: text("tools").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentKnowledgeUrlsTable = pgTable("agent_knowledge_urls", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => aiAgentsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  label: text("label").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentKnowledgeFilesTable = pgTable("agent_knowledge_files", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => aiAgentsTable.id, { onDelete: "cascade" }),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  fileSize: integer("file_size").notNull().default(0),
  filePath: text("file_path").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentSchedulesTable = pgTable("agent_schedules", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => aiAgentsTable.id, { onDelete: "cascade" }),
  scheduleType: text("schedule_type").notNull().default("once"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentRunLogsTable = pgTable("agent_run_logs", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => aiAgentsTable.id, { onDelete: "cascade" }),
  scheduleId: integer("schedule_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  output: text("output").notNull().default(""),
  error: text("error"),
});

export type AiAgent = typeof aiAgentsTable.$inferSelect;
export type AgentKnowledgeUrl = typeof agentKnowledgeUrlsTable.$inferSelect;
export type AgentKnowledgeFile = typeof agentKnowledgeFilesTable.$inferSelect;
export type AgentSchedule = typeof agentSchedulesTable.$inferSelect;
export type AgentRunLog = typeof agentRunLogsTable.$inferSelect;
