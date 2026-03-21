import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('active'),
  industryBlueprint: text('industry_blueprint'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
