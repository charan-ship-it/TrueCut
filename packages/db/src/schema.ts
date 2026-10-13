// Postgres schema. Projects keep their full document in `data` (jsonb) so the pipelines can evolve
// without migrations; the columns beside it exist for listing, ownership and access control.
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, jsonb, integer, primaryKey, index, uniqueIndex, numeric, boolean } from 'drizzle-orm/pg-core';

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable('memberships', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // owner | member
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })]);

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('ad'),
  stage: text('stage').notNull().default('sources'),
  data: jsonb('data').notNull(),
  summary: jsonb('summary').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('projects_workspace_updated_idx').on(t.workspaceId, t.updatedAt)]);

export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('queued'), // queued | running | done | error
  progress: integer('progress').notNull().default(0),
  message: text('message').notNull().default(''),
  log: jsonb('log').notNull().default([]),
  error: text('error'),
  payload: jsonb('payload').notNull().default({}),
  result: jsonb('result'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
}, (t) => [index('jobs_project_status_idx').on(t.projectId, t.status, t.createdAt)]);

// ───────── settings, keys, usage (v0.4) ─────────

/** Per-workspace choices: models, monthly budget. */
export const workspaceSettings = pgTable('workspace_settings', {
  workspaceId: text('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  models: jsonb('models').notNull().default({}),            // { analysis, creative, vision }
  monthlyBudgetUsd: numeric('monthly_budget_usd', { precision: 12, scale: 2 }), // null = no cap
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Bring-your-own API keys. user_id null = the workspace's shared key. Secrets are AES-256-GCM encrypted. */
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),                     // anthropic | elevenlabs
  secret: text('secret').notNull(),                         // v1:<iv>:<tag>:<ciphertext> (base64)
  last4: text('last4').notNull(),
  status: text('status').notNull().default('ok'),           // ok | invalid
  statusMessage: text('status_message'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, (t) => [uniqueIndex('api_keys_owner_provider_idx').on(t.workspaceId, t.provider, sql`coalesce(${t.userId}, '')`)]);

/** One row per paid API call (Claude, ElevenLabs): who, what, how many tokens, what it cost. */
export const usageEvents = pgTable('usage_events', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  projectId: text('project_id'),                            // kept after a project is deleted, for the bill
  jobId: text('job_id'),
  provider: text('provider').notNull(),                     // anthropic | elevenlabs
  model: text('model').notNull().default(''),
  operation: text('operation').notNull(),                   // facts, storyboard, cast, tts, stt, library_read…
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  units: numeric('units', { precision: 14, scale: 3 }).notNull().default('0'),  // ElevenLabs characters or seconds
  unitKind: text('unit_kind'),                              // characters | seconds
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  keySource: text('key_source').notNull().default('server'),
  ok: boolean('ok').notNull().default(true),
  error: text('error'),
  durationMs: integer('duration_ms').notNull().default(0),
}, (t) => [index('usage_ws_created_idx').on(t.workspaceId, t.createdAt), index('usage_project_idx').on(t.projectId)]);

/** Personal access tokens (the Chrome extension). Only a SHA-256 hash is stored. */
export const apiTokens = pgTable('api_tokens', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  scopes: jsonb('scopes').notNull().default(['library:write']),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [index('api_tokens_user_idx').on(t.userId)]);

/** The team's screenshot library (captured with the extension or uploaded). */
export const libraryAssets = pgTable('library_assets', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull().default(''),
  url: text('url'),
  domain: text('domain'),
  product: text('product'),
  tags: jsonb('tags').notNull().default([]),
  source: text('source').notNull().default('upload'),       // extension | upload
  file: text('file').notNull(),                             // storage key relative to the library root
  mime: text('mime').notNull().default('image/png'),
  w: integer('w').notNull().default(0),
  h: integer('h').notNull().default(0),
  bytes: integer('bytes').notNull().default(0),
  sha256: text('sha256').notNull(),
  status: text('status').notNull().default('pending'),      // pending | ready | error
  analysis: jsonb('analysis'),                              // { summary, text, numbers[], sensitive{}, kind }
  error: text('error'),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('library_ws_created_idx').on(t.workspaceId, t.createdAt),
  uniqueIndex('library_ws_sha_idx').on(t.workspaceId, t.sha256).where(sql`${t.deletedAt} is null`),
]);

// One-time sign-in links sent by email. Only the SHA-256 of the token is stored; a row is deleted when used.
export const emailTokens = pgTable('email_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  email: text('email').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('email_tokens_email_idx').on(t.email)]);

/** Team skills: reusable instructions (house style, brand voice, a process) that Nick follows when it writes.
 *  Same shape as an Agent Skill's SKILL.md: a name + a one-line description that says when to use it, and a body. */
export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),                             // kebab-case slug, unique per workspace
  description: text('description').notNull().default(''),  // when to use it: what Nick reads to decide
  body: text('body').notNull().default(''),                 // the instructions, markdown
  stages: jsonb('stages').notNull().default([]),            // angles | storyboard | chat | voice | talk; [] = all
  always: boolean('always').notNull().default(false),       // load on every project, without being picked
  enabled: boolean('enabled').notNull().default(true),
  source: text('source').notNull().default('manual'),       // manual | import
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('skills_ws_name_idx').on(t.workspaceId, t.name).where(sql`${t.deletedAt} is null`),
]);
