import { pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Starter table so `drizzle-kit generate` produces a first migration.
 * Adjust this schema as your app evolves.
 */
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow()
});