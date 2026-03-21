import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('active'),
  industryBlueprint: text('industry_blueprint'),
  credits: integer('credits').notNull().default(10000),
  firstName: text('first_name'),
  lastName: text('last_name'),
  preferredName: text('preferred_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
