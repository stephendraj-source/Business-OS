import { pgTable, serial, integer, text, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';

// ── Groups ─────────────────────────────────────────────────────────────────────
// Users are members of Groups.

export const groups = pgTable('groups', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull().default(''),
});

export const userGroups = pgTable('user_groups', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
});

// ── Roles ──────────────────────────────────────────────────────────────────────
// Groups are members of Roles. Roles carry access permissions.

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull().default(''),
});

export const groupRoles = pgTable('group_roles', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
});

// ── Role Permissions ───────────────────────────────────────────────────────────

export const roleModuleAccess = pgTable('role_module_access', {
  id: serial('id').primaryKey(),
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  module: text('module').notNull(),
  hasAccess: boolean('has_access').notNull().default(true),
});

export const roleAllowedCategories = pgTable('role_allowed_categories', {
  id: serial('id').primaryKey(),
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
});

export const roleAllowedProcesses = pgTable('role_allowed_processes', {
  id: serial('id').primaryKey(),
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  processId: integer('process_id').notNull(),
  canEdit: boolean('can_edit').notNull().default(false),
});

export const roleFieldPermissions = pgTable('role_field_permissions', {
  id: serial('id').primaryKey(),
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  catalogueType: text('catalogue_type').notNull(),
  fieldKey: text('field_key').notNull(),
  canView: boolean('can_view').notNull().default(true),
  canEdit: boolean('can_edit').notNull().default(true),
});

// ── Projects ───────────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
});

export const userProjects = pgTable('user_projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
});
