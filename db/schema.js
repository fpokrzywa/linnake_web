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

export const readinessLeads = sqliteTable('readiness_leads', {
  id: text('id').primaryKey(),
  requestHash: text('request_hash').notNull(),
  firstName: text('first_name').notNull(),
  email: text('email').notNull(),
  companySize: text('company_size').notNull(),
  useCase: text('use_case').notNull(),
  hardware: text('hardware').notNull(),
  score: integer('score').notNull(),
  sizePoints: integer('size_points').notNull(),
  taskPoints: integer('task_points').notNull(),
  hardwarePoints: integer('hardware_points').notNull(),
  createdAt: integer('created_at').notNull(),
  scorecardSentAt: integer('scorecard_sent_at'),
  scorecardStatus: text('scorecard_status'),
  scorecardError: text('scorecard_error'),
  mailDueAt: integer('mail_due_at'),
  mailAttempts: integer('mail_attempts').notNull().default(0),
  mailLease: text('mail_lease'),
  ownerSentAt: integer('owner_sent_at'),
  ownerAttempts: integer('owner_attempts').notNull().default(0),
  ownerError: text('owner_error'),
  status: text('status').notNull().default('new'),
}, table => [
  index('readiness_leads_due_idx').on(table.mailDueAt),
  index('readiness_leads_email_created_idx').on(table.email, table.createdAt),
  index('readiness_leads_status_created_idx').on(table.status, table.createdAt),
  check('readiness_leads_score_check', sql`${table.score} BETWEEN 0 AND 100`),
]);
