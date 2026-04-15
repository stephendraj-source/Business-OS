import { date, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const userCategories = pgTable('user_categories', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id'),
  name: text('name').notNull(),
  color: text('color').notNull().default('#94a3b8'),
  description: text('description').notNull().default(''),
});

export const taskSources = pgTable('task_sources', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id'),
  name: text('name').notNull(),
  color: text('color').notNull().default('#94a3b8'),
  description: text('description').notNull().default(''),
});

export const taskQueues = pgTable('task_queues', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id'),
  name: text('name').notNull(),
  color: text('color').notNull().default('#94a3b8'),
  description: text('description').notNull().default(''),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id'),
  taskNumber: integer('task_number'),
  name: text('name').notNull().default('New Task'),
  description: text('description').notNull().default(''),
  startDate: date('start_date'),
  endDate: date('end_date'),
  revisedEndDate: date('revised_end_date'),
  status: text('status').notNull().default('todo'),
  priority: text('priority').notNull().default('normal'),
  assignedTo: integer('assigned_to'),
  createdBy: integer('created_by'),
  aiAgentId: integer('ai_agent_id'),
  aiResult: text('ai_result').notNull().default(''),
  source: text('source').notNull().default('Users'),
  queueId: integer('queue_id'),
  workflowId: integer('workflow_id'),
  approvalStatus: text('approval_status').notNull().default('none'),
  approvedBy: integer('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  aiInstructions: text('ai_instructions').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const taskProcesses = pgTable('task_processes', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').notNull(),
  processId: integer('process_id').notNull(),
});
