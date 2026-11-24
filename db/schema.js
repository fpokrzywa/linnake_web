import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const inquiries = sqliteTable('inquiries', {
  id: text('id').primaryKey(),
  requestHash: text('request_hash').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company').notNull().default(''),
  interest: text('interest').notNull(),
  message: text('message').notNull(),
  createdAt: integer('created_at').notNull(),
  status: text('status').notNull().default('new'),
}, table => [
  index('inquiries_email_created_idx').on(table.email, table.createdAt),
  index('inquiries_created_idx').on(table.createdAt),
  check('inquiries_interest_check', sql`${table.interest} IN ('demo', 'enterprise', 'local')`),
]);
