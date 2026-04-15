import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

export const userFavourites = pgTable(
  'user_favourites',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    itemType: text('item_type').notNull(),
    itemId: integer('item_id').notNull(),
    itemName: text('item_name').notNull().default(''),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userFavouriteItemUnique: uniqueIndex('user_favourites_user_item_unique').on(
      table.userId,
      table.itemType,
      table.itemId
    ),
  })
);

export const navPreferences = pgTable(
  'nav_preferences',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    sections: jsonb('sections').notNull(),
    items: jsonb('items').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    navPreferencesTenantUnique: uniqueIndex('nav_preferences_tenant_unique')
      .on(table.tenantId)
      .where(sql`${table.userId} IS NULL`),
    navPreferencesTenantUserUnique: uniqueIndex('nav_preferences_tenant_user_unique')
      .on(table.tenantId, table.userId)
      .where(sql`${table.userId} IS NOT NULL`),
  })
);
