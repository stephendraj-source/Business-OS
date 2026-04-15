import { pgTable, text, serial, timestamp, integer, customType } from "drizzle-orm/pg-core";
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

export const governanceStandardsTable = pgTable("governance_standards", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  complianceName: text("compliance_name").notNull(),
  complianceAuthority: text("compliance_authority").notNull().default(""),
  referenceUrl: text("reference_url").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const governanceDocumentsTable = pgTable("governance_documents", {
  id: serial("id").primaryKey(),
  governanceId: integer("governance_id").notNull().references(() => governanceStandardsTable.id, { onDelete: "cascade" }),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  fileSize: integer("file_size").notNull().default(0),
  filePath: text("file_path").notNull(),
  extractedText: text("extracted_text").notNull().default(""),
  embeddingVec: vector384("embedding_vec"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const processGovernanceTable = pgTable("process_governance", {
  id: serial("id").primaryKey(),
  processId: integer("process_id").notNull().references(() => processesTable.id, { onDelete: "cascade" }),
  governanceId: integer("governance_id").notNull().references(() => governanceStandardsTable.id, { onDelete: "cascade" }),
});

export type GovernanceStandard = typeof governanceStandardsTable.$inferSelect;
export type GovernanceDocument = typeof governanceDocumentsTable.$inferSelect;
export type ProcessGovernance = typeof processGovernanceTable.$inferSelect;
