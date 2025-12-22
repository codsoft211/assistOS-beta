import { pgTable, varchar, text, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const assistbuildJobs = pgTable('assistbuild_jobs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id').notNull(),
  userId: varchar('user_id').notNull(),
  
  // Job metadata
  type: varchar('type').notNull(), // 'module_creation', 'bulk_import', 'migration', etc
  status: varchar('status').notNull().default('pending'), // pending, active, completed, failed, cancelled
  
  // Job data
  input: jsonb('input').notNull(), // Input parameters for the job
  output: jsonb('output'), // Result data when completed
  progress: integer('progress').default(0), // 0-100%
  progressMessage: text('progress_message'), // Human-readable progress
  
  // Error tracking
  error: jsonb('error'), // Error details if failed
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  failedAt: timestamp('failed_at'),
  cancelledAt: timestamp('cancelled_at'),
});

// Zod schemas
export const insertAssistbuildJobSchema = createInsertSchema(assistbuildJobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  failedAt: true,
  cancelledAt: true,
});

export const updateAssistbuildJobSchema = insertAssistbuildJobSchema.partial().extend({
  id: z.string().uuid(),
});

// Types
export type AssistbuildJob = typeof assistbuildJobs.$inferSelect;
export type InsertAssistbuildJob = z.infer<typeof insertAssistbuildJobSchema>;
export type UpdateAssistbuildJob = z.infer<typeof updateAssistbuildJobSchema>;
