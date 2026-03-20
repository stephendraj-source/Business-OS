import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const processesTable = pgTable("processes", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull(),
  category: text("category").notNull(),
  processName: text("process_name").notNull(),
  aiAgent: text("ai_agent").notNull().default(""),
  purpose: text("purpose").notNull().default(""),
  inputs: text("inputs").notNull().default(""),
  outputs: text("outputs").notNull().default(""),
  humanInTheLoop: text("human_in_the_loop").notNull().default(""),
  kpi: text("kpi").notNull().default(""),
  estimatedValueImpact: text("estimated_value_impact").notNull().default(""),
  industryBenchmark: text("industry_benchmark").notNull().default(""),
});

export const insertProcessSchema = createInsertSchema(processesTable).omit({ id: true });
export const updateProcessSchema = insertProcessSchema.partial().omit({ number: true });

export type InsertProcess = z.infer<typeof insertProcessSchema>;
export type UpdateProcess = z.infer<typeof updateProcessSchema>;
export type Process = typeof processesTable.$inferSelect;
