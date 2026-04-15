import { pgTable, serial, integer, text, date, timestamp } from 'drizzle-orm/pg-core';

import { users } from './users';
import { processesTable } from './processes';

export const initiatives = pgTable('initiatives', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id'),
  initiativeId: text('initiative_id').notNull().unique(),
  name: text('name').notNull(),
  goals: text('goals').notNull().default(''),
  achievement: text('achievement').notNull().default(''),
  startDate: date('start_date'),
  endDate: date('end_date'),
  goalId: integer('goal_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const initiativeUrls = pgTable('initiative_urls', {
  id: serial('id').primaryKey(),
  initiativeId: integer('initiative_id').notNull().references(() => initiatives.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default(''),
  url: text('url').notNull(),
});

export const initiativeAssignees = pgTable('initiative_assignees', {
  id: serial('id').primaryKey(),
  initiativeId: integer('initiative_id').notNull().references(() => initiatives.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const initiativeProcesses = pgTable('initiative_processes', {
  id: serial('id').primaryKey(),
  initiativeId: integer('initiative_id').notNull().references(() => initiatives.id, { onDelete: 'cascade' }),
  processId: integer('process_id').notNull().references(() => processesTable.id, { onDelete: 'cascade' }),
});
