import { pgTable, serial, text, integer, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const formsTable = pgTable("forms", {
  id: serial("id").primaryKey(),
  formNumber: integer("form_number").notNull().default(1),
  name: text("name").notNull().default("New Form"),
  description: text("description").notNull().default(""),
  fields: text("fields").notNull().default("[]"),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  publishSlug: text("publish_slug").unique(),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Form = typeof formsTable.$inferSelect;
