// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { z } from 'zod';

// Webhook Gmail entrant
export const GmailWebhookSchema = z.object({
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  messageId: z.string(),
  threadId: z.string().optional(),
  timestamp: z.string(),
});

// User instruction (create a job)
export const CreateJobSchema = z.object({
  instruction: z.string().min(1),
  confirm: z.boolean().default(false),
});

// Instruction vers un job existant
export const JobInstructionSchema = z.object({
  instruction: z.string().min(1),
  confirm: z.boolean().default(false),
});

// Approuver une suggestion
export const ApproveSuggestionSchema = z.object({
  instruction: z.string().optional(),  // custom user instruction
});

// Hook payload (centralisé)
export const HookPayloadSchema = z.object({
  session_id: z.string(),
  hook_event_name: z.enum(['PreToolUse', 'PostToolUse', 'Notification', 'SessionEnd', 'Stop']),
  tool_name: z.string().optional(),
  tool_input: z.record(z.unknown()).optional(),
  cwd: z.string().optional(),
  transcript_path: z.string().optional(),
  permission_mode: z.string().optional(),
});

// Types réexportés
export type GmailWebhook = z.infer<typeof GmailWebhookSchema>;
export type CreateJob = z.infer<typeof CreateJobSchema>;
export type JobInstruction = z.infer<typeof JobInstructionSchema>;
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
  jobId: z.string().nullable().default(null),
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

// === MCP & Skills Config Schemas ===
export const CuratedMcpStateSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
});

export const MarketplaceMcpSchema = z.object({
  label: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  envFile: z.string().optional(),
  permissions: z.array(z.string().regex(/^mcp__[a-z0-9_-]+__(\*|[a-z0-9_-]+)$/)),
  source: z.enum(['registry.modelcontextprotocol.io', 'custom']),
});

export const CuratedSkillStateSchema = z.object({
  enabled: z.boolean(),
});

export const UserSkillSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  source: z.string().refine(s => s.startsWith('/') || s.startsWith('~/')),
  enabled: z.boolean(),
});

export const McpConfigV2Schema = z.object({
  curated: z.object({
    gmail: CuratedMcpStateSchema,
    camoufox: CuratedMcpStateSchema,
    whatsapp: CuratedMcpStateSchema.extend({
      wacliPath: z.string(),
      mcpServerPath: z.string(),
    }),
    opentidy: CuratedMcpStateSchema.optional().default({ enabled: true, configured: true }),
  }),
  marketplace: z.record(z.string(), MarketplaceMcpSchema),
});

export const SkillsConfigSchema = z.object({
  curated: z.record(z.string(), CuratedSkillStateSchema),
  user: z.array(UserSkillSchema),
});

export type MarketplaceMcpInput = z.infer<typeof MarketplaceMcpSchema>;
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
  command: z.string().min(1),
  args: z.array(z.string()),
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
});

export const ModuleManifestSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  icon: z.string().optional(),
  version: z.string(),
  platform: z.enum(['darwin', 'all']).optional(),
  mcpServers: z.array(McpServerDefSchema).optional(),
  skills: z.array(SkillDefSchema).optional(),
  receivers: z.array(ReceiverDefSchema).optional(),
  setup: z.object({
    authCommand: z.string().optional(),
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