import { pgTable, serial, text, integer, timestamp, bigint } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { formFoldersTable } from "./forms";

export const knowledgeItemsTable = pgTable("knowledge_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  folderId: integer("folder_id").references(() => formFoldersTable.id, { onDelete: "set null" }),
  type: text("type").notNull().default("wiki"),
  title: text("title").notNull().default("Untitled"),
  content: text("content").notNull().default(""),
  url: text("url"),
  fileName: text("file_name"),
  filePath: text("file_path"),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type KnowledgeItem = typeof knowledgeItemsTable.$inferSelect;
