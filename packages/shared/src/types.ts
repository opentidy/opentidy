// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// types.ts — SSOT for all OpenTidy types

// === Job (workspace/) ===
export type JobStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface Job {
  id: string;           // slug du job (nom du répertoire)
  status: JobStatus;
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
  jobId?: string;              // job lié
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
  jobId: string;
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
  jobId: string | null;
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
  jobId?: string;
}

// === SSE ===
export type SSEEventType =
  | 'session:started'
  | 'session:ended'
  | 'session:idle'
  | 'session:active'
  | 'session:output'
  | 'suggestion:created'
  | 'job:updated'
  | 'job:completed'
  | 'amelioration:created'
  | 'process:output'
  | 'notification:sent'
  | 'schedule:created'
  | 'schedule:fired'
  | 'schedule:deleted'
  | 'module:enabled'
  | 'module:disabled'
  | 'module:error'
  | 'module:configured';

export type SSEEventData =
  | { type: 'session:started' | 'session:ended' | 'session:idle' | 'session:active'; sessionId: string; jobId: string }
  | { type: 'session:output'; sessionId: string; jobId: string; output: string }
  | { type: 'job:updated' | 'job:completed'; jobId: string }
  | { type: 'suggestion:created'; slug: string }
  | { type: 'amelioration:created'; id: string }
  | { type: 'process:output'; processId: number; output: string }
  | { type: 'notification:sent'; notificationId: string; jobId?: string }
  | { type: 'schedule:created' | 'schedule:fired' | 'schedule:deleted'; scheduleId: number }
  | { type: 'module:enabled' | 'module:disabled' | 'module:configured' | 'module:error'; moduleName: string };

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
  jobId?: string;
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
  readSessionId(jobDir: string): string | null;
  writeConfig(opts: SetupOpts): void;
}

// === Module System ===
export interface MacPermission {
  name: string;              // "messages", "mail", "accessibility", etc.
  label: string;             // "Messages", "Mail"
  app: string;               // macOS app name for osascript check
  reason: string;            // why this permission is needed
}

export interface ModuleManifest {
  name: string;
  label: string;
  description: string;
  icon?: string;
  version: string;
  platform?: 'darwin' | 'all';
  mcpServers?: McpServerDef[];
  skills?: SkillDef[];
  receivers?: ReceiverDef[];
  permissions?: MacPermission[];  // macOS permissions this module needs
  setup?: {
    authCommand?: string;
    configFields?: ConfigField[];
  };
}

export interface McpServerDef {
  name: string;
  command?: string;                // for process-based MCPs (mutually exclusive with url)
  args?: string[];
  url?: string;                    // for HTTP MCPs (e.g., "http://localhost:5175/mcp")
  urlFromConfig?: string;          // resolve url from module config key
  env?: Record<string, string>;
  envFromConfig?: Record<string, string>;
  permissions?: string[];
}

export interface SkillDef {
  name: string;
  content: string;
}

export interface ReceiverDef {
  name: string;
  mode: 'webhook' | 'polling' | 'long-running';
  source: string;
  pollInterval?: number;
  entry?: string;
  transform?: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface ModuleState {
  enabled: boolean;
  source: 'curated' | 'custom';
  config?: Record<string, unknown>;
  health?: 'ok' | 'error' | 'unknown';
  healthError?: string;
  healthCheckedAt?: string;
}

export interface ReceiverEvent {
  source: string;
  content: string;
  metadata: Record<string, string>;
}

export interface ModuleInfo {
  name: string;
  label: string;
  description: string;
  icon?: string;
  source: 'curated' | 'custom';
  enabled: boolean;
  platform?: string;
  health?: 'ok' | 'error' | 'unknown';
  healthError?: string;
  components: {
    mcpServers: string[];
    skills: string[];
    receivers: string[];
  };
  setup?: {
    needsAuth: boolean;
    configFields: ConfigField[];
    configured: boolean;
  };
}

// === MCP Service Config ===
/** @deprecated Use ModuleState */
export interface McpServiceState {
  enabled: boolean;
  configured: boolean;
}

/** @deprecated Use ModuleState */
export interface WhatsAppMcpState extends McpServiceState {
  wacliPath: string;
  mcpServerPath: string;
}

/** @deprecated Use ModuleState */
export interface McpServicesConfig {
  gmail: McpServiceState;
  camoufox: McpServiceState;
  whatsapp: WhatsAppMcpState;
}

// === MCP Config V2 (nested curated/marketplace) ===
/** @deprecated Use ModuleState */
export interface MarketplaceMcp {
  label: string;
  command: string;
  args: string[];
  envFile?: string;
  permissions: string[];
  source: 'registry.modelcontextprotocol.io' | 'custom';
}

/** @deprecated Use ModuleState */
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
/** @deprecated Use ModuleState */
export interface CuratedSkillState {
  enabled: boolean;
}

/** @deprecated Use ModuleState */
export interface UserSkill {
  name: string;
  source: string;
  enabled: boolean;
}

/** @deprecated Use ModuleState */
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
/** @deprecated Use ModuleState */
export interface ReceiverConfigEntry {
  type: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

// === Config ===
export interface OpenTidyConfig {
  version: number;
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
  modules: Record<string, ModuleState>;
  userInfo: UserInfo;
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