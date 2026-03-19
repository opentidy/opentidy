// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// types.ts — SSOT for all OpenTidy types

// === Dossier (workspace/) ===
export type DossierStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface Dossier {
  id: string;           // slug du dossier (nom du répertoire)
  status: DossierStatus;
  title: string;        // extrait du state.md (# heading)
  objective: string;    // extrait de ## Objectif
  lastAction: string;   // date dernière action
  hasActiveSession: boolean;
  stateRaw?: string;    // contenu brut de state.md
  artifacts: string[];  // liste des fichiers dans artifacts/
  confirm?: boolean;    // mode validation — Claude asks before external actions
  journal: JournalEntry[];
  waitingFor?: string;  // contenu de la section ## En attente (si présente)
  waitingType?: 'user' | 'tiers'; // USER = user must act, TIERS = waiting for third party
}

export interface JournalEntry {
  date: string;
  text: string;
}

// === Suggestion (_suggestions/) ===
export type UrgencyLevel = 'urgent' | 'normal' | 'low';

export interface Suggestion {
  slug: string;         // nom du fichier sans .md
  title: string;        // extrait du # heading
  urgency: UrgencyLevel;
  source: string;
  date: string;
  summary: string;
  why: string;
  whatIWouldDo: string;
  context?: string;     // event original (email, SMS, etc.)
}

// === Auto-analyse (_gaps/) ===
export type AmeliorationStatus = 'open' | 'resolved' | 'ignored';
export type AmeliorationSource = 'post-session' | 'checkup' | 'session';
export type AmeliorationCategory = 'capability' | 'access' | 'config' | 'process' | 'data';
export type AmeliorationFixType = 'code' | 'config' | 'external';

export interface Amelioration {
  id: string;           // hash ou index
  date: string;
  title: string;
  problem: string;
  impact: string;
  suggestion: string;
  actions: string[];           // recommended concrete actions
  dossierId?: string;          // dossier lié
  sessionId?: string;          // claude session id (for output link)
  source?: AmeliorationSource; // what generated this analysis
  category?: AmeliorationCategory; // type of gap
  resolved: boolean;           // kept for backward compat
  status: AmeliorationStatus;
  fixType?: AmeliorationFixType;
  sanitizedTitle?: string;
  sanitizedBody?: string;
  githubIssueNumber?: number;
  suggestionSlug?: string;
}

// === Event (receiver) ===
export type BuiltinEventSource = 'gmail' | 'whatsapp' | 'sms' | 'app' | 'telegram' | 'checkup';
export type EventSource = BuiltinEventSource | 'mail' | 'imap';

export interface AppEvent {
  id: string;
  source: EventSource;
  content: string;
  timestamp: string;
  metadata: Record<string, string>;
  contentHash: string;
}

// === Session (launcher) ===
export type SessionStatus = 'active' | 'idle';

export interface Session {
  id: string;           // tmux session name
  dossierId: string;
  status: SessionStatus;
  startedAt: string;
  agentSessionId?: string;    // pour --resume
  pid?: number;
  waitingType?: 'user' | 'tiers'; // type of wait when idle
}

// === Schedule (scheduler) ===
export type ScheduleType = 'once' | 'recurring';
export type ScheduleCreatedBy = 'system' | 'agent' | 'user';

export interface Schedule {
  id: number;
  dossierId: string | null;
  type: ScheduleType;
  runAt: string | null;
  intervalMs: number | null;
  lastRunAt: string | null;
  instruction: string | null;
  label: string;
  createdBy: ScheduleCreatedBy;
  createdAt: string;
}

// === Hook (centralisé) ===
// HookPayload est défini via Zod dans schemas.ts (SSOT) — ne pas dupliquer ici.
// Utiliser: import { HookPayload } from './schemas.js';
export type HookEventType = 'PreToolUse' | 'PostToolUse' | 'Notification' | 'SessionEnd' | 'Stop';

// === Notification ===
export interface NotificationRecord {
  id: string;
  timestamp: string;
  message: string;
  link: string;
  dossierId?: string;
}

// === SSE ===
export type SSEEventType =
  | 'session:started'
  | 'session:ended'
  | 'session:idle'
  | 'session:active'
  | 'session:output'
  | 'suggestion:created'
  | 'dossier:updated'
  | 'dossier:completed'
  | 'amelioration:created'
  | 'process:output'
  | 'notification:sent'
  | 'schedule:created'
  | 'schedule:fired'
  | 'schedule:deleted';

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

// === Audit ===
export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  decision: 'ALLOW' | 'DENY' | 'ASK';
  result?: string;
}

// === Agent Process (infra/agent-tracker) ===
export type AgentProcessType = 'triage' | 'checkup' | 'title' | 'memory-injection' | 'memory-extraction' | 'memory-prompt';
export type AgentProcessStatus = 'queued' | 'running' | 'done' | 'error';

export interface AgentProcess {
  id: number;
  type: AgentProcessType;
  dossierId?: string;
  pid?: number;
  startedAt: string;
  endedAt?: string;
  status: AgentProcessStatus;
  exitCode?: number;
  outputPath?: string;
  description?: string;
}

/** @deprecated Use AgentProcessType */
export type ClaudeProcessType = AgentProcessType;
/** @deprecated Use AgentProcessStatus */
export type ClaudeProcessStatus = AgentProcessStatus;
/** @deprecated Use AgentProcess */
export type ClaudeProcess = AgentProcess;

// === Memory ===
export interface MemoryEntry {
  filename: string
  category: string
  created: string   // YYYY-MM-DD
  updated: string   // YYYY-MM-DD
  description: string
  content: string   // full markdown body (without frontmatter)
}

export interface MemoryIndexEntry {
  filename: string
  category: string
  updated: string
  description: string
}

// === Agent Abstraction ===
export type AgentName = 'claude' | 'gemini' | 'copilot';

export interface SpawnOpts {
  mode: 'autonomous' | 'interactive' | 'one-shot';
  cwd: string;
  systemPrompt?: string;
  instruction?: string;
  resumeSessionId?: string;
  allowedTools?: string[];
  outputFormat?: 'text' | 'json' | 'stream-json';
  pluginDir?: string;
  skipPermissions?: boolean;
}

export interface SetupOpts {
  guardrails: GuardrailRule[];
  mcpServices: McpServicesConfig;
  configDir: string;
}

export interface GuardrailRule {
  event: 'pre-tool' | 'post-tool' | 'stop' | 'session-end';
  type: 'prompt' | 'command' | 'http';
  match: string | { tool: string; input_contains: string };
  prompt?: string;
  command?: string;
  url?: string;
}

export interface AgentAdapter {
  readonly name: AgentName;
  readonly binary: string;
  readonly instructionFile: string;
  readonly configEnvVar: string;
  readonly experimental: boolean;

  buildArgs(opts: SpawnOpts): string[];
  getEnv(): Record<string, string>;
  readSessionId(dossierDir: string): string | null;
  writeConfig(opts: SetupOpts): void;
}

// === MCP Service Config ===
export interface McpServiceState {
  enabled: boolean;
  configured: boolean;
}

export interface WhatsAppMcpState extends McpServiceState {
  wacliPath: string;
  mcpServerPath: string;
}

/** @deprecated Use McpConfigV2 for OpenTidyConfig.mcp */
export interface McpServicesConfig {
  gmail: McpServiceState;
  camoufox: McpServiceState;
  whatsapp: WhatsAppMcpState;
}

// === MCP Config V2 (nested curated/marketplace) ===
export interface MarketplaceMcp {
  label: string;
  command: string;
  args: string[];
  envFile?: string;
  permissions: string[];
  source: 'registry.modelcontextprotocol.io' | 'custom';
}

export interface McpConfigV2 {
  curated: {
    gmail: McpServiceState;
    camoufox: McpServiceState;
    whatsapp: WhatsAppMcpState;
    opentidy?: McpServiceState;
  };
  marketplace: Record<string, MarketplaceMcp>;
}

// === Skills Config ===
export interface CuratedSkillState {
  enabled: boolean;
}

export interface UserSkill {
  name: string;
  source: string;
  enabled: boolean;
}

export interface SkillsConfig {
  curated: Record<string, CuratedSkillState>;
  user: UserSkill[];
}

export interface UserInfo {
  name: string;
  email: string;
  company: string;
}

// === Receiver Config ===
export interface ReceiverConfigEntry {
  type: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

// === Config ===
export interface OpenTidyConfig {
  version: number;
  telegram: {
    botToken: string;
    chatId: string;
    userId?: string;
  };
  auth: {
    bearerToken: string;
  };
  server: {
    port: number;
    appBaseUrl: string;
  };
  workspace: {
    dir: string;
    lockDir: string;
  };
  update: {
    autoUpdate: boolean;
    checkInterval: string;
    notifyBeforeUpdate: boolean;
    delayBeforeUpdate: string;
    keepReleases: number;
  };
  agentConfig: {
    name: AgentName;
    configDir: string;
  };
  /** @deprecated Use agentConfig.configDir */
  claudeConfig?: {
    dir: string;
  };
  language: string; // language for Claude responses (e.g. 'en', 'fr')
  receivers: ReceiverConfigEntry[];
  userInfo: UserInfo;
  mcp: McpConfigV2;
  skills: SkillsConfig;
  github?: {
    token: string;
    owner?: string;  // defaults to 'opentidy'
    repo?: string;   // defaults to 'opentidy'
  };
  setupComplete?: boolean;
}

export interface SetupStatus {
  setupComplete: boolean;
  userInfo: { done: boolean };
  agents: { done: boolean; connected: string[]; active: string | null };
  permissions: { done: boolean; granted: string[]; missing: string[] };
  services: Record<string, {
    status: 'connected' | 'error' | 'not_configured';
    error?: string;
  }>;
}