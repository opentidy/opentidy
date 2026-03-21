// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// types.ts — SSOT for all OpenTidy types

// === Task (workspace/) ===
export type TaskStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface Task {
  id: string;           // task slug (directory name)
  status: TaskStatus;
  title: string;        // extracted from state.md (# heading)
  objective: string;    // extracted from ## Objective
  lastAction: string;   // date of last action
  hasActiveSession: boolean;
  stateRaw?: string;    // raw state.md content
  artifacts: string[];  // list of files in artifacts/
  journal: JournalEntry[];
  waitingFor?: string;  // content of ## Waiting section (if present)
  waitingType?: 'user' | 'tiers'; // USER = user must act, TIERS = waiting for third party
}

export interface JournalEntry {
  date: string;
  text: string;
}

// === Suggestion (_suggestions/) ===
export type UrgencyLevel = 'urgent' | 'normal' | 'low';

export interface Suggestion {
  slug: string;         // filename without .md
  title: string;        // extracted from # heading
  urgency: UrgencyLevel;
  source: string;
  date: string;
  summary: string;
  why: string;
  whatIWouldDo: string;
  context?: string;     // original event (email, SMS, etc.)
}

// === Self-analysis (_gaps/) ===
export type AmeliorationStatus = 'open' | 'resolved' | 'ignored';
export type AmeliorationSource = 'post-session' | 'checkup' | 'session';
export type AmeliorationCategory = 'capability' | 'access' | 'config' | 'process' | 'data';
export type AmeliorationFixType = 'code' | 'config' | 'external';

export interface Amelioration {
  id: string;           // hash or index
  date: string;
  title: string;
  problem: string;
  impact: string;
  suggestion: string;
  actions: string[];           // recommended concrete actions
  taskId?: string;              // related task
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
  taskId: string;
  status: SessionStatus;
  startedAt: string;
  agentSessionId?: string;    // for --resume
  pid?: number;
  waitingType?: 'user' | 'tiers'; // type of wait when idle
}

// === Schedule (scheduler) ===
export type ScheduleType = 'once' | 'recurring';
export type ScheduleCreatedBy = 'system' | 'agent' | 'user';

export interface Schedule {
  id: number;
  taskId: string | null;
  type: ScheduleType;
  runAt: string | null;
  intervalMs: number | null;
  lastRunAt: string | null;
  instruction: string | null;
  label: string;
  createdBy: ScheduleCreatedBy;
  createdAt: string;
}

// === Hook (centralized) ===
// HookPayload is defined via Zod in schemas.ts (SSOT) — do not duplicate here.
// Use: import { HookPayload } from './schemas.js';
export type HookEventType = 'PreToolUse' | 'PostToolUse' | 'Notification' | 'SessionEnd' | 'Stop';

// === Notification ===
export interface NotificationRecord {
  id: string;
  timestamp: string;
  message: string;
  link: string;
  taskId?: string;
}

// === SSE ===
export type SSEEventType =
  | 'session:started'
  | 'session:ended'
  | 'session:idle'
  | 'session:active'
  | 'session:output'
  | 'suggestion:created'
  | 'task:updated'
  | 'task:completed'
  | 'amelioration:created'
  | 'process:output'
  | 'notification:sent'
  | 'schedule:created'
  | 'schedule:fired'
  | 'schedule:deleted'
  | 'module:enabled'
  | 'module:disabled'
  | 'module:error'
  | 'module:configured'
  | 'system:reset';

export type SSEEventData =
  | { type: 'session:started' | 'session:ended' | 'session:idle' | 'session:active'; sessionId: string; taskId: string }
  | { type: 'session:output'; sessionId: string; taskId: string; output: string }
  | { type: 'task:updated' | 'task:completed'; taskId: string }
  | { type: 'suggestion:created'; slug: string }
  | { type: 'amelioration:created'; id: string }
  | { type: 'process:output'; processId: number; output: string }
  | { type: 'notification:sent'; notificationId: string; taskId?: string }
  | { type: 'schedule:created' | 'schedule:fired' | 'schedule:deleted'; scheduleId: number }
  | { type: 'module:enabled' | 'module:disabled' | 'module:configured' | 'module:error'; moduleName: string }
  | { type: 'system:reset' };

/** Extracts the data payload (without `type`) for a given SSEEventType */
export type SSEEventDataFor<T extends SSEEventType> = Omit<Extract<SSEEventData, { type: T }>, 'type'>;

export interface SSEEvent<T extends SSEEventType = SSEEventType> {
  type: T;
  data: SSEEventDataFor<T> & Record<string, unknown>;
  timestamp: string;
}

// === Audit ===
export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  decision: 'ALLOW' | 'DENY' | 'BLOCK';
  result?: string;
}

// === Agent Process (infra/agent-tracker) ===
export type AgentProcessType = 'triage' | 'checkup' | 'title' | 'memory-injection' | 'memory-extraction' | 'memory-prompt';
export type AgentProcessStatus = 'queued' | 'running' | 'done' | 'error';

export interface AgentProcess {
  id: number;
  type: AgentProcessType;
  taskId?: string;
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
}

export interface SetupOpts {
  permissionConfig: PermissionConfig;
  manifests: Map<string, ModuleManifest>;
  mcpServices: McpServicesConfig;
  configDir: string;
  serverPort: number;
}

/** @deprecated Replaced by module toolPermissions + PermissionConfig */
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
  readSessionId(taskDir: string): string | null;
  writeConfig(opts: SetupOpts): void;
}

// === Module System ===
export interface MacPermission {
  name: string;              // "messages", "mail", "accessibility", etc.
  label: string;             // "Messages", "Mail"
  app: string;               // macOS app name for osascript check
  reason: string;            // why this permission is needed
}

export type PermissionScope = 'per-call' | 'per-task';

export interface ToolDef {
  tool: string;
  label: string;
}

export interface ToolPermissions {
  scope: PermissionScope;
  safe: ToolDef[];
  critical: ToolDef[];
}

export interface ModuleManifest {
  name: string;
  label: string;
  description: string;
  icon?: string;
  version: string;
  core?: boolean;                 // true = required, cannot be disabled/removed
  platform?: 'darwin' | 'all';
  mcpServers?: McpServerDef[];
  skills?: SkillDef[];
  receivers?: ReceiverDef[];
  permissions?: MacPermission[];  // macOS permissions this module needs
  toolPermissions?: ToolPermissions;
  setup?: {
    authCommand?: string;
    checkCommand?: string;
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
  toolPermissions?: ToolPermissions;
  core?: boolean;
  source: 'curated' | 'custom';
  enabled: boolean;
  /** true if checkCommand passes — module deps are present on disk */
  ready?: boolean;
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
    authCommand?: string;
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


// === Permission System ===
export type PermissionLevel = 'allow' | 'ask' | 'block';
export type PermissionPreset = 'supervised' | 'autonomous' | 'full-auto';

export interface ModulePermissionLevel {
  safe: PermissionLevel;
  critical: PermissionLevel;
  overrides?: Record<string, PermissionLevel>;
}

export interface PermissionConfig {
  preset: PermissionPreset;
  defaultLevel: PermissionLevel;
  modules: Record<string, PermissionLevel | ModulePermissionLevel>;
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
  permissions: PermissionConfig;
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