import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const workflowsTable = pgTable("workflows", {
  id: serial("id").primaryKey(),
  workflowNumber: integer("workflow_number").notNull(),
  name: text("name").notNull().default("New Workflow"),
  description: text("description").notNull().default(""),
  steps: text("steps").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Workflow = typeof workflowsTable.$inferSelect;
