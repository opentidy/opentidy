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

// User instruction (create a dossier)
export const CreateDossierSchema = z.object({
  instruction: z.string().min(1),
  confirm: z.boolean().default(false),
});

// Instruction vers un dossier existant
export const DossierInstructionSchema = z.object({
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
export type CreateDossier = z.infer<typeof CreateDossierSchema>;
export type DossierInstruction = z.infer<typeof DossierInstructionSchema>;
export type ApproveSuggestion = z.infer<typeof ApproveSuggestionSchema>;
export type HookPayload = z.infer<typeof HookPayloadSchema>;

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
