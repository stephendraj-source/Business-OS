import { pgTable, serial, integer, text, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';

// ── Custom Roles ──────────────────────────────────────────────────────────────

export const orgRoles = pgTable('org_roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull().default(''),
});

export const orgRoleMemberships = pgTable('org_role_memberships', {
  id: serial('id').primaryKey(),
  roleId: integer('role_id').notNull().references(() => orgRoles.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

// ── Divisions ─────────────────────────────────────────────────────────────────

export const divisions = pgTable('divisions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
});

// ── Departments ───────────────────────────────────────────────────────────────

export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  divisionId: integer('division_id').references(() => divisions.id, { onDelete: 'set null' }),
});

// ── Projects ──────────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  divisionId: integer('division_id').references(() => divisions.id, { onDelete: 'set null' }),
  departmentId: integer('department_id').references(() => departments.id, { onDelete: 'set null' }),
});

// ── User Memberships ──────────────────────────────────────────────────────────

export const userDivisions = pgTable('user_divisions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  divisionId: integer('division_id').notNull().references(() => divisions.id, { onDelete: 'cascade' }),
});

export const userDepartments = pgTable('user_departments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  departmentId: integer('department_id').notNull().references(() => departments.id, { onDelete: 'cascade' }),
});

export const userProjects = pgTable('user_projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
});
