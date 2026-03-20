import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { processesTable } from "./processes";

export const governanceStandardsTable = pgTable("governance_standards", {
  id: serial("id").primaryKey(),
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
