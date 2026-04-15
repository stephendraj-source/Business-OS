import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const checklistsTable = pgTable("checklists", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  processId: integer("process_id").notNull(),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const checklistItemsTable = pgTable("checklist_items", {
  id: serial("id").primaryKey(),
  checklistId: integer("checklist_id").notNull(),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  met: boolean("met").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const evidenceItemsTable = pgTable("evidence_items", {
  id: serial("id").primaryKey(),
  checklistItemId: integer("checklist_item_id").notNull(),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const evidenceUrlsTable = pgTable("evidence_urls", {
  id: serial("id").primaryKey(),
  evidenceItemId: integer("evidence_item_id").notNull(),
  url: text("url").notNull(),
  label: text("label").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const evidenceFilesTable = pgTable("evidence_files", {
  id: serial("id").primaryKey(),
  evidenceItemId: integer("evidence_item_id").notNull(),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  filePath: text("file_path").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Checklist = typeof checklistsTable.$inferSelect;
export type ChecklistItem = typeof checklistItemsTable.$inferSelect;
export type EvidenceItem = typeof evidenceItemsTable.$inferSelect;
export type EvidenceUrl = typeof evidenceUrlsTable.$inferSelect;
export type EvidenceFile = typeof evidenceFilesTable.$inferSelect;
