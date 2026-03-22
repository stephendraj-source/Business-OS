import { pgTable, serial, text, integer, timestamp, bigint, customType } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { formFoldersTable } from "./forms";

const vector384 = customType<{ data: number[] | null; driverData: string | null }>({
  dataType() {
    return "vector(384)";
  },
  toDriver(value: number[] | null): string | null {
    if (value === null || value === undefined) return null;
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] | null {
    if (value === null || value === undefined) return null;
    const str = String(value);
    return str.slice(1, -1).split(",").map(Number);
  },
});

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
  embeddingVec: vector384("embedding_vec"),
  embeddedAt: timestamp("embedded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type KnowledgeItem = typeof knowledgeItemsTable.$inferSelect;
