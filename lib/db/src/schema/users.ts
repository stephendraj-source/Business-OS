import { pgTable, serial, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull().default(''),
  preferredName: text('preferred_name').notNull().default(''),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  designation: text('designation').notNull().default(''),
  phone: text('phone').notNull().default(''),
  dataScope: text('data_scope').notNull().default('categories'),
  category: text('category').notNull().default(''),
  jobDescription: text('job_description').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  colorScheme: text('color_scheme'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const userModuleAccess = pgTable('user_module_access', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  module: text('module').notNull(),
  hasAccess: boolean('has_access').notNull().default(true),
});

export const userAllowedCategories = pgTable('user_allowed_categories', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
});

export const userAllowedProcesses = pgTable('user_allowed_processes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  processId: integer('process_id').notNull(),
  canEdit: boolean('can_edit').notNull().default(false),
});

export const userFieldPermissions = pgTable('user_field_permissions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  catalogueType: text('catalogue_type').notNull(),
  fieldKey: text('field_key').notNull(),
  canView: boolean('can_view').notNull().default(true),
  canEdit: boolean('can_edit').notNull().default(true),
});
