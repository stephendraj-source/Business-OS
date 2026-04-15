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
  // Organisation profile
  address: text('address'),
  websiteUrl: text('website_url'),
  contact1Name: text('contact1_name'),
  contact1Phone: text('contact1_phone'),
  contact1Email: text('contact1_email'),
  contact2Name: text('contact2_name'),
  contact2Phone: text('contact2_phone'),
  contact2Email: text('contact2_email'),
  displayName: text('display_name').notNull().default(''),
  officialName: text('official_name').notNull().default(''),
  officialNationalId: text('official_national_id').notNull().default(''),
  systemPrompt: text('system_prompt'),
  colorScheme: text('color_scheme'),
  n8nUserId: text('n8n_user_id'),
  n8nUserEmail: text('n8n_user_email'),
  n8nProjectId: text('n8n_project_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
