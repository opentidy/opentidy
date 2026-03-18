// types.ts — SSOT pour tous les types OpenTidy

// === Dossier (workspace/) ===
export type DossierStatus = 'EN COURS' | 'TERMINÉ';

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
  waitingType?: 'lolo' | 'tiers'; // LOLO = Lolo doit agir, TIERS = attente externe
}

export interface JournalEntry {
  date: string;
  text: string;
}

// === Suggestion (_suggestions/) ===
export type UrgencyLevel = 'urgent' | 'normal' | 'faible';

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
}

// === Event (receiver) ===
export type EventSource = 'gmail' | 'whatsapp' | 'sms' | 'app' | 'telegram' | 'checkup';

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
  claudeSessionId?: string;   // pour --resume
  pid?: number;
  waitingType?: 'lolo' | 'tiers'; // type d'attente quand idle
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
  | 'notification:sent';

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

// === Claude Process (infra/claude-tracker) ===
export type ClaudeProcessType = 'triage' | 'checkup' | 'title' | 'memory-injection' | 'memory-extraction' | 'memory-prompt';
export type ClaudeProcessStatus = 'queued' | 'running' | 'done' | 'error';

export interface ClaudeProcess {
  id: number;
  type: ClaudeProcessType;
  dossierId?: string;
  pid?: number;
  startedAt: string;
  endedAt?: string;
  status: ClaudeProcessStatus;
  exitCode?: number;
  outputPath?: string;
  description?: string;
}

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
  claudeConfig: {
    dir: string;
  };
}

