import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const processesTable = pgTable("processes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  number: integer("number").notNull(),
  category: text("category").notNull(),
  processDescription: text("process_name").notNull(),
  processName: text("process_short_name").notNull().default(""),
  aiAgent: text("ai_agent").notNull().default(""),
  aiAgentActive: boolean("ai_agent_active").notNull().default(false),
  purpose: text("purpose").notNull().default(""),
  inputs: text("inputs").notNull().default(""),
  outputs: text("outputs").notNull().default(""),
  humanInTheLoop: text("human_in_the_loop").notNull().default(""),
  kpi: text("kpi").notNull().default(""),
  estimatedValueImpact: text("estimated_value_impact").notNull().default(""),
  industryBenchmark: text("industry_benchmark").notNull().default(""),
  included: boolean("included").notNull().default(false),
  target: text("target").notNull().default(""),
  achievement: text("achievement").notNull().default(""),
  trafficLight: text("traffic_light").notNull().default(""),
  evaluation: text("evaluation"),
  priority: integer("priority"),
});

export const insertProcessSchema = createInsertSchema(processesTable).omit({ id: true });
export const updateProcessSchema = insertProcessSchema.partial().omit({ number: true });

export type InsertProcess = z.infer<typeof insertProcessSchema>;
export type UpdateProcess = z.infer<typeof updateProcessSchema>;
export type Process = typeof processesTable.$inferSelect;
