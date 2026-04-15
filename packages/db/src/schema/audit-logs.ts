import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  entityName: text("entity_name"),
  fieldChanged: text("field_changed"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  user: text("user").notNull().default("Jane Doe"),
  description: text("description"),
  userId: integer("user_id"),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
