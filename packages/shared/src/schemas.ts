// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { z } from 'zod';

// Inbound Gmail webhook
export const GmailWebhookSchema = z.object({
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  messageId: z.string(),
  threadId: z.string().optional(),
  timestamp: z.string(),
});

// User instruction (create a task)
export const CreateTaskSchema = z.object({
  instruction: z.string().min(1),
});

// Instruction to an existing task (structurally identical to CreateTaskSchema)
export const TaskInstructionSchema = CreateTaskSchema;

// Approve a suggestion
export const ApproveSuggestionSchema = z.object({
  instruction: z.string().optional(),  // custom user instruction
});

// Hook payload (centralized)
export const HookPayloadSchema = z.object({
  session_id: z.string(),
  hook_event_name: z.enum(['PreToolUse', 'PostToolUse', 'Notification', 'SessionEnd', 'Stop']),
  tool_name: z.string().optional(),
  tool_input: z.record(z.unknown()).optional(),
  cwd: z.string().optional(),
  transcript_path: z.string().optional(),
  permission_mode: z.string().optional(),
});

// Re-exported types
export type GmailWebhook = z.infer<typeof GmailWebhookSchema>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type TaskInstruction = z.infer<typeof TaskInstructionSchema>;
export type ApproveSuggestion = z.infer<typeof ApproveSuggestionSchema>;
export type HookPayload = z.infer<typeof HookPayloadSchema>;

// Amelioration schemas
export const AmeliorationFixTypeSchema = z.enum(['code', 'config', 'external']);

// Memory schemas
export const MemoryPromptSchema = z.object({
  text: z.string().min(1),
})

export const MemoryUpdateSchema = z.object({
  content: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
})

export const MemoryCreateSchema = z.object({
  filename: z.string().regex(/^[a-z0-9-]+\.md$/),
  category: z.string(),
  description: z.string(),
  content: z.string(),
})

// === Schedule schemas ===
export const CreateScheduleSchema = z.object({
  taskId: z.string().nullable().default(null),
  type: z.enum(['once', 'recurring']),
  runAt: z.string().datetime().nullable().default(null),
  intervalMs: z.number().int().positive().nullable().default(null),
  instruction: z.string().nullable().default(null),
  label: z.string().min(1),
  createdBy: z.enum(['system', 'agent', 'user']).default('user'),
}).refine(
  (d) => (d.type === 'once' && d.runAt) || (d.type === 'recurring' && d.intervalMs),
  { message: 'once requires runAt, recurring requires intervalMs' },
);

export const UpdateScheduleSchema = z.object({
  label: z.string().min(1).optional(),
  runAt: z.string().datetime().nullable().optional(),
  intervalMs: z.number().int().positive().nullable().optional(),
  instruction: z.string().nullable().optional(),
});

export type CreateScheduleInput = z.infer<typeof CreateScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleSchema>;

// === Module name validation ===
export const MODULE_NAME_REGEX = /^[a-z0-9-]+$/;

// === Legacy Config Schemas (still used by UserSkillSchema) ===
export const CuratedSkillStateSchema = z.object({
  enabled: z.boolean(),
});

export const UserSkillSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  source: z.string().refine(s => s.startsWith('/') || s.startsWith('~/')),
  enabled: z.boolean(),
});

export const SkillsConfigSchema = z.object({
  curated: z.record(z.string(), CuratedSkillStateSchema),
  user: z.array(UserSkillSchema),
});

export type UserSkillInput = z.infer<typeof UserSkillSchema>;

// === Setup schemas ===
export const SetupUserInfoSchema = z.object({
  name: z.string().min(1),
  language: z.enum(['en', 'fr']),
});

export type SetupUserInfoInput = z.infer<typeof SetupUserInfoSchema>;

// === Module System schemas ===
export const McpServerDefSchema = z.object({
  name: z.string().min(1),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  urlFromConfig: z.string().optional(),
  env: z.record(z.string()).optional(),
  envFromConfig: z.record(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
});

export const SkillDefSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
});

export const ReceiverDefSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(['webhook', 'polling', 'long-running']),
  source: z.string().min(1),
  pollInterval: z.number().optional(),
  entry: z.string().optional(),
  transform: z.string().optional(),
});

export const ConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'password', 'select']),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  storage: z.enum(['config', 'keychain']).optional(),
});

// === Permission System schemas ===
export const PermissionScopeSchema = z.enum(['per-call', 'per-task']);
export const PermissionLevelSchema = z.enum(['allow', 'ask', 'block']);
export const PermissionPresetSchema = z.enum(['supervised', 'assisted', 'autonomous']);

const ToolDefSchema = z.object({
  tool: z.string(),
  label: z.string(),
});

export const ToolPermissionsSchema = z.object({
  scope: PermissionScopeSchema,
  safe: z.array(ToolDefSchema),
  critical: z.array(ToolDefSchema),
});

const ModulePermissionLevelSchema = z.object({
  safe: PermissionLevelSchema,
  critical: PermissionLevelSchema,
  overrides: z.record(PermissionLevelSchema).optional(),
});

export const PermissionConfigSchema = z.object({
  preset: PermissionPresetSchema,
  defaultLevel: PermissionLevelSchema,
  modules: z.record(z.union([PermissionLevelSchema, ModulePermissionLevelSchema])),
  builtins: z.record(PermissionLevelSchema).optional(),
});

const DaemonDefSchema = z.object({
  entry: z.string().min(1),
});

export const ModuleManifestSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  icon: z.string().optional(),
  version: z.string(),
  core: z.boolean().optional(),
  cli: z.array(z.string()).optional(),
  platform: z.enum(['darwin', 'all']).optional(),
  mcpServers: z.array(McpServerDefSchema).optional(),
  skills: z.array(SkillDefSchema).optional(),
  receivers: z.array(ReceiverDefSchema).optional(),
  permissions: z.array(z.object({
    name: z.string().min(1),
    label: z.string().min(1),
    app: z.string().min(1),
    reason: z.string().min(1),
  })).optional(),
  toolPermissions: ToolPermissionsSchema.optional(),
  daemon: DaemonDefSchema.optional(),
  setup: z.object({
    authCommand: z.string().optional(),
    checkCommand: z.string().optional(),
    configFields: z.array(ConfigFieldSchema).optional(),
  }).optional(),
});

export const ModuleStateSchema = z.object({
  enabled: z.boolean(),
  source: z.enum(['curated', 'custom']),
  config: z.record(z.unknown()).optional(),
  health: z.enum(['ok', 'error', 'unknown']).optional(),
  healthError: z.string().optional(),
  healthCheckedAt: z.string().optional(),
});

export const ReceiverEventSchema = z.object({
  source: z.string(),
  content: z.string(),
  metadata: z.record(z.string()),
});

// === Config validation (critical fields only, lenient for backward compat) ===
export const OpenTidyConfigSchema = z.object({
  version: z.number(),
  auth: z.object({ bearerToken: z.string() }),
  server: z.object({ port: z.number(), appBaseUrl: z.string().optional() }),
  workspace: z.object({ dir: z.string(), lockDir: z.string() }).optional(),
  modules: z.record(z.unknown()).optional(),
  permissions: PermissionConfigSchema.optional(),
});