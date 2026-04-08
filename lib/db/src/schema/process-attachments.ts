import { pgTable, serial, integer, text, timestamp, customType } from "drizzle-orm/pg-core";
import { processesTable } from "./processes";

const vector384 = customType<{ data: number[] | null; driverData: string | null }>({
  dataType() {
    return process.env.ENABLE_PGVECTOR === "true" ? "vector(384)" : "text";
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

export const processAttachmentsTable = pgTable("process_attachments", {
  id: serial("id").primaryKey(),
  processId: integer("process_id").notNull().references(() => processesTable.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id"),
  type: text("type").notNull().default("file"),
  title: text("title").notNull().default(""),
  url: text("url"),
  filePath: text("file_path"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  extractedText: text("extracted_text").notNull().default(""),
  embeddingVec: vector384("embedding_vec"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProcessAttachment = typeof processAttachmentsTable.$inferSelect;
