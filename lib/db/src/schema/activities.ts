import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { processesTable } from "./processes";

export const ACTIVITY_MODES = [
  "phone",
  "email",
  "social media",
  "sms",
  "whatsapp",
  "document",
  "database",
  "businessos",
  "others",
] as const;

export type ActivityMode = (typeof ACTIVITY_MODES)[number];

export const activitiesTable = pgTable("activities", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  activityNumber: integer("activity_number").notNull().default(0),
  name: text("name").notNull().default("New Activity"),
  mode: text("mode").notNull().default("others"),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const processActivitiesTable = pgTable("process_activities", {
  id: serial("id").primaryKey(),
  processId: integer("process_id").notNull().references(() => processesTable.id, { onDelete: "cascade" }),
  activityId: integer("activity_id").notNull().references(() => activitiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Activity = typeof activitiesTable.$inferSelect;
export type ProcessActivity = typeof processActivitiesTable.$inferSelect;
