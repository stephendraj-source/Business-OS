import { pgTable, serial, integer, text, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { initiatives } from "./initiatives";

export const tenantStrategyTable = pgTable("tenant_strategy", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  mission: text("mission").notNull().default(""),
  vision: text("vision").notNull().default(""),
  purpose: text("purpose").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantUnique: uniqueIndex("tenant_strategy_tenant_id_unique").on(table.tenantId),
}));

export const strategicGoalsTable = pgTable("strategic_goals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  goalNumber: integer("goal_number").notNull().default(1),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  targetDate: date("target_date"),
  status: text("status").notNull().default("active"),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const strategicGoalInitiativesTable = pgTable("strategic_goal_initiatives", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull().references(() => strategicGoalsTable.id, { onDelete: "cascade" }),
  initiativeId: integer("initiative_id").notNull().references(() => initiatives.id, { onDelete: "cascade" }),
});
