import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('LEARNER'),
  blocked: integer('blocked').notNull().default(0),
  goal: integer('goal').notNull().default(5),
  createdAt: text('created_at').notNull(),
});
