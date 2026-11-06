import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => members.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  level: text('level').notNull(),
  color: text('color').notNull(),
  status: text('status').notNull().default('DRAFT'),
  hidden: integer('hidden').notNull().default(0),
  quiz: text('quiz').notNull().default('[]'),
  version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(),
});

export const lessons = sqliteTable('lessons', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull().references(() => courses.id),
  title: text('title').notNull(),
  content: text('content').notNull(),
  position: integer('position').notNull(),
  minutes: integer('minutes').notNull().default(10),
  version: integer('version').notNull().default(1),
}, t => [uniqueIndex('lesson_order').on(t.courseId, t.position)]);
