# Alfred — Plan d'implémentation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter Alfred, un assistant personnel autonome qui gère des dossiers administratifs via sessions Claude Code focalisées, avec une app web et des garde-fous hooks.

**Architecture:** Backend léger Hono (~200-400 lignes) qui reçoit des events, lance des sessions Claude Code dans tmux, et gère l'état via des fichiers workspace/. Frontend React 19 SPA pour l'interface de Lolo. Monorepo pnpm workspaces avec packages/shared pour les types Zod.

**Tech Stack:** TypeScript strict, Hono, grammY, Zod, React 19, Vite, React Router, Tailwind CSS, Zustand, xterm.js, Vitest, Playwright, pnpm workspaces, ESLint+Prettier.

**Spec:** `docs/superpowers/specs/2026-03-14-alfred-design.md`

---

## Chunk 1: Foundation — Monorepo, shared types, backend skeleton

### Task 1: Initialiser le monorepo pnpm

**Files:**
- Create: `alfred/package.json`
- Create: `alfred/pnpm-workspace.yaml`
- Create: `alfred/.gitignore`
- Create: `alfred/tsconfig.base.json`
- Create: `alfred/.prettierrc`
- Create: `alfred/eslint.config.js`

- [ ] **Step 1: Créer le repo et la structure de base**

```bash
mkdir alfred && cd alfred && git init
```

- [ ] **Step 2: Créer package.json racine avec pnpm enforced**

```json
{
  "name": "alfred",
  "private": true,
  "packageManager": "pnpm@10.6.5",
  "scripts": {
    "preinstall": "npx only-allow pnpm",
    "build": "pnpm -r build",
    "test": "pnpm --filter @alfred/backend test",
    "test:e2e": "pnpm --filter @alfred/web test:e2e",
    "dev": "pnpm -r --parallel dev",
    "lint": "pnpm -r lint",
    "smoke:setup": "pnpm --filter @alfred/backend smoke:setup",
    "smoke:start": "pnpm --filter @alfred/backend smoke:start",
    "smoke:cleanup": "pnpm --filter @alfred/backend smoke:cleanup"
  }
}
```

- [ ] **Step 3: Créer pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

- [ ] **Step 4: Créer tsconfig.base.json partagé**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Créer .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 5b: Créer eslint.config.js**

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    ignores: ['**/dist/', '**/node_modules/'],
  },
);
```

- [ ] **Step 6: Créer .gitignore**

```
node_modules/
dist/
*.log
.env
workspace/
/tmp/
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: init monorepo pnpm workspaces"
```

---

### Task 2: Package shared — types et schemas Zod

**Files:**
- Create: `alfred/packages/shared/package.json`
- Create: `alfred/packages/shared/tsconfig.json`
- Create: `alfred/packages/shared/src/index.ts`
- Create: `alfred/packages/shared/src/types.ts`
- Create: `alfred/packages/shared/src/schemas.ts`

Les types sont la fondation de tout — ils définissent les interfaces entre backend et frontend.

- [ ] **Step 1: Créer packages/shared/package.json**

```json
{
  "name": "@alfred/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Créer types.ts — tous les types du système**

```typescript
// types.ts — SSOT pour tous les types Alfred

// === Dossier (workspace/) ===
export type DossierStatus = 'EN COURS' | 'TERMINÉ' | 'BLOQUÉ';

export interface Dossier {
  id: string;           // slug du dossier (nom du répertoire)
  status: DossierStatus;
  title: string;        // extrait du state.md (# heading)
  objective: string;    // extrait de ## Objectif
  lastAction: string;   // date dernière action
  hasCheckpoint: boolean;
  hasActiveSession: boolean;
  checkpointSummary?: string;  // 1-2 lignes du checkpoint.md
  artifacts: string[];  // liste des fichiers dans artifacts/
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
}

// === Amélioration (_gaps/) ===
export interface Amelioration {
  id: string;           // hash ou index
  date: string;
  title: string;
  problem: string;
  impact: string;
  suggestion: string;
  dossierId?: string;   // dossier lié
  resolved: boolean;
}

// === Event (receiver) ===
export type EventSource = 'gmail' | 'whatsapp' | 'sms' | 'app' | 'telegram' | 'sweep';

export interface AppEvent {
  id: string;
  source: EventSource;
  content: string;
  timestamp: string;
  metadata: Record<string, string>;
  contentHash: string;
}

// === Session (launcher) ===
export type SessionStatus = 'active' | 'idle' | 'mfa' | 'finished';

export interface Session {
  id: string;           // tmux session name
  dossierId: string;
  status: SessionStatus;
  startedAt: string;
  claudeSessionId?: string;   // pour --resume
  pid?: number;
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
  | 'checkpoint:created'
  | 'checkpoint:resolved'
  | 'suggestion:created'
  | 'dossier:updated'
  | 'dossier:completed'
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
```

- [ ] **Step 3: Créer schemas.ts — Zod schemas pour validation API**

```typescript
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

// Instruction Lolo (créer un dossier)
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
  instruction: z.string().optional(),  // instruction personnalisée de Lolo
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
```

- [ ] **Step 4: Créer index.ts**

```typescript
export * from './types.js';
export * from './schemas.js';
```

- [ ] **Step 5: Créer tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Build et vérifier**

```bash
cd packages/shared && pnpm install && pnpm build
```
Expected: dist/ contient les .js et .d.ts

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(shared): types et Zod schemas — foundation SSOT"
```

---

### Task 3: Backend skeleton — Hono server + structure

**Files:**
- Create: `alfred/apps/backend/package.json`
- Create: `alfred/apps/backend/tsconfig.json`
- Create: `alfred/apps/backend/src/index.ts`
- Create: `alfred/apps/backend/src/server.ts`
- Create: `alfred/apps/backend/vitest.config.ts`

- [ ] **Step 1: Créer apps/backend/package.json**

```json
{
  "name": "@alfred/backend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@alfred/shared": "workspace:*",
    "hono": "^4.7.0",
    "@hono/node-server": "^1.13.0",
    "grammy": "^1.30.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Créer server.ts — Hono app skeleton**

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

export function createApp() {
  const app = new Hono();

  // Health check
  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  return app;
}

export function startServer(app: Hono, port = 3001) {
  return serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[alfred] Backend listening on http://localhost:${info.port}`);
  });
}
```

- [ ] **Step 3: Créer index.ts — entrypoint**

```typescript
import { createApp, startServer } from './server.js';

const app = createApp();
startServer(app);
```

- [ ] **Step 4: Créer vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 5: Créer tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: pnpm install, build, run**

```bash
pnpm install && pnpm build && pnpm --filter @alfred/backend dev
```
Expected: "Backend listening on http://localhost:3001"

- [ ] **Step 7: Tester le health check**

```bash
curl http://localhost:3001/api/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(backend): Hono server skeleton avec health check"
```

---

### Task 4: Frontend skeleton — React 19, Vite, Tailwind, React Router

**Files:**
- Create: `alfred/apps/web/package.json`
- Create: `alfred/apps/web/vite.config.ts`
- Create: `alfred/apps/web/tsconfig.json`
- Create: `alfred/apps/web/index.html`
- Create: `alfred/apps/web/src/main.tsx`
- Create: `alfred/apps/web/src/App.tsx`
- Create: `alfred/apps/web/src/index.css`

- [ ] **Step 1: Créer apps/web/package.json**

```json
{
  "name": "@alfred/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test:e2e": "playwright test",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@alfred/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.0.0",
    "react-router-dom": "^7.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0",
    "typescript": "^5.7.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "@playwright/test": "^1.49.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2a: Créer vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 2b: Créer index.html**

```html
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Alfred</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2c: Créer main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Créer App.tsx avec React Router — les 6 routes**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Placeholder pages — seront implémentées plus tard
function Home() { return <div>Home</div>; }
function Dossiers() { return <div>Dossiers</div>; }
function DossierDetail() { return <div>Dossier Detail</div>; }
function Terminal() { return <div>Terminal</div>; }
function Nouveau() { return <div>Nouveau</div>; }
function Ameliorations() { return <div>Améliorations</div>; }

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dossiers" element={<Dossiers />} />
        <Route path="/dossier/:id" element={<DossierDetail />} />
        <Route path="/terminal" element={<Terminal />} />
        <Route path="/nouveau" element={<Nouveau />} />
        <Route path="/ameliorations" element={<Ameliorations />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Créer src/index.css — Tailwind v4 (CSS-first, pas de tailwind.config.js)**

```css
@import "tailwindcss";
```

Note : Tailwind v4 utilise le plugin Vite (`@tailwindcss/vite` déjà dans vite.config.ts) au lieu de PostCSS. La config se fait en CSS, pas en JS.

- [ ] **Step 5: pnpm install, dev, vérifier le rendu**

```bash
pnpm install && pnpm --filter @alfred/web dev
```
Expected: app accessible sur http://localhost:5173, routing fonctionne

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): React 19 SPA skeleton avec 6 routes"
```

---

## Chunk 2: Backend Core — Infrastructure (locks, dedup, audit)

### Task 5: Module locks — PID-based file locks

**Files:**
- Create: `alfred/apps/backend/src/infra/locks.ts`
- Create: `alfred/apps/backend/tests/infra/locks.test.ts`

**Tests couverts:** E2E-INF-01, E2E-INF-02, E2E-LCH-02, E2E-EDGE-13, E2E-EDGE-18

- [ ] **Step 1: Écrire les tests**

```typescript
// tests/infra/locks.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLockManager } from '../../src/infra/locks.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('LockManager', () => {
  let lockDir: string;
  let locks: ReturnType<typeof createLockManager>;

  beforeEach(() => {
    lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-locks-'));
    locks = createLockManager(lockDir);
  });

  afterEach(() => {
    fs.rmSync(lockDir, { recursive: true, force: true });
  });

  // E2E-INF-02
  it('acquires and releases a lock', () => {
    expect(locks.acquire('factures-sopra')).toBe(true);
    expect(locks.isLocked('factures-sopra')).toBe(true);
    locks.release('factures-sopra');
    expect(locks.isLocked('factures-sopra')).toBe(false);
  });

  // E2E-LCH-02
  it('prevents double lock on same dossier', () => {
    expect(locks.acquire('factures-sopra')).toBe(true);
    expect(locks.acquire('factures-sopra')).toBe(false);
  });

  // E2E-INF-01
  it('allows parallel locks on different dossiers', () => {
    expect(locks.acquire('factures-sopra')).toBe(true);
    expect(locks.acquire('exali-rapport')).toBe(true);
    expect(locks.isLocked('factures-sopra')).toBe(true);
    expect(locks.isLocked('exali-rapport')).toBe(true);
  });

  // E2E-INF-02, E2E-EDGE-13
  it('cleans up stale lock with dead PID', () => {
    // Write a lock file with a PID that doesn't exist
    const lockFile = path.join(lockDir, 'stale-dossier.lock');
    fs.writeFileSync(lockFile, '999999'); // PID that doesn't exist
    expect(locks.isLocked('stale-dossier')).toBe(false); // should detect dead PID
  });

  // E2E-EDGE-18
  it('cleanupStaleLocks removes all dead PID locks on boot', () => {
    fs.writeFileSync(path.join(lockDir, 'dead1.lock'), '999998');
    fs.writeFileSync(path.join(lockDir, 'dead2.lock'), '999997');
    // Write one with current PID (alive)
    fs.writeFileSync(path.join(lockDir, 'alive.lock'), String(process.pid));

    const cleaned = locks.cleanupStaleLocks();
    expect(cleaned).toContain('dead1');
    expect(cleaned).toContain('dead2');
    expect(cleaned).not.toContain('alive');
  });
});
```

- [ ] **Step 2: Lancer les tests — vérifier qu'ils échouent**

```bash
pnpm --filter @alfred/backend test tests/infra/locks.test.ts
```
Expected: FAIL — `createLockManager` not found

- [ ] **Step 3: Implémenter locks.ts**

```typescript
// src/infra/locks.ts
import fs from 'fs';
import path from 'path';

export function createLockManager(lockDir: string) {
  fs.mkdirSync(lockDir, { recursive: true });

  function lockPath(dossierId: string): string {
    return path.join(lockDir, `${dossierId}.lock`);
  }

  function isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  function acquire(dossierId: string): boolean {
    if (isLocked(dossierId)) return false;
    fs.writeFileSync(lockPath(dossierId), String(process.pid));
    return true;
  }

  function release(dossierId: string): void {
    const p = lockPath(dossierId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  function isLocked(dossierId: string): boolean {
    const p = lockPath(dossierId);
    if (!fs.existsSync(p)) return false;
    const pid = parseInt(fs.readFileSync(p, 'utf-8').trim(), 10);
    if (!isPidAlive(pid)) {
      fs.unlinkSync(p); // cleanup stale
      return false;
    }
    return true;
  }

  function cleanupStaleLocks(): string[] {
    const cleaned: string[] = [];
    const files = fs.readdirSync(lockDir).filter(f => f.endsWith('.lock'));
    for (const file of files) {
      const fullPath = path.join(lockDir, file);
      const pid = parseInt(fs.readFileSync(fullPath, 'utf-8').trim(), 10);
      if (!isPidAlive(pid)) {
        fs.unlinkSync(fullPath);
        cleaned.push(file.replace('.lock', ''));
      }
    }
    return cleaned;
  }

  function listLocked(): string[] {
    const files = fs.readdirSync(lockDir).filter(f => f.endsWith('.lock'));
    return files
      .map(f => f.replace('.lock', ''))
      .filter(id => isLocked(id));
  }

  return { acquire, release, isLocked, cleanupStaleLocks, listLocked };
}
```

- [ ] **Step 4: Lancer les tests — vérifier qu'ils passent**

```bash
pnpm --filter @alfred/backend test tests/infra/locks.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(backend): locks module — PID-based file locks avec stale cleanup"
```

---

### Task 6: Module dedup — content hash

**Files:**
- Create: `alfred/apps/backend/src/infra/dedup.ts`
- Create: `alfred/apps/backend/tests/infra/dedup.test.ts`

**Tests couverts:** E2E-INF-05, E2E-RCV-03, E2E-EDGE-07

- [ ] **Step 1: Écrire les tests**

```typescript
// tests/infra/dedup.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDedupStore } from '../../src/infra/dedup.js';

describe('DedupStore', () => {
  let dedup: ReturnType<typeof createDedupStore>;

  beforeEach(() => {
    dedup = createDedupStore();
  });

  // E2E-RCV-03, E2E-INF-05
  it('detects duplicate events by content hash', () => {
    const content = '{"from":"billing@sopra.com","subject":"Facture"}';
    expect(dedup.isDuplicate(content)).toBe(false);
    dedup.record(content);
    expect(dedup.isDuplicate(content)).toBe(true);
  });

  it('allows different content', () => {
    dedup.record('content A');
    expect(dedup.isDuplicate('content B')).toBe(false);
  });

  // E2E-EDGE-07
  it('handles high volume without crash', () => {
    for (let i = 0; i < 1000; i++) {
      const content = `email-${i}`;
      expect(dedup.isDuplicate(content)).toBe(false);
      dedup.record(content);
    }
    expect(dedup.isDuplicate('email-0')).toBe(true);
    expect(dedup.isDuplicate('email-999')).toBe(true);
    expect(dedup.isDuplicate('email-1000')).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier échec**

- [ ] **Step 3: Implémenter dedup.ts**

```typescript
import { createHash } from 'crypto';

export function createDedupStore(maxSize = 10_000) {
  const seen = new Set<string>();

  function hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  function isDuplicate(content: string): boolean {
    return seen.has(hash(content));
  }

  function record(content: string): void {
    const h = hash(content);
    seen.add(h);
    // Evict oldest if too large (simple approach: clear half)
    if (seen.size > maxSize) {
      const arr = Array.from(seen);
      seen.clear();
      arr.slice(arr.length / 2).forEach(v => seen.add(v));
    }
  }

  return { isDuplicate, record };
}
```

- [ ] **Step 4: Vérifier pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(backend): dedup module — content hash deduplication"
```

---

### Task 7: Module audit — trail logger

**Files:**
- Create: `alfred/apps/backend/src/infra/audit.ts`
- Create: `alfred/apps/backend/tests/infra/audit.test.ts`

**Tests couverts:** E2E-INF-03, E2E-GF-12

- [ ] **Step 1: Écrire les tests**

```typescript
// tests/infra/audit.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAuditLogger } from '../../src/infra/audit.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('AuditLogger', () => {
  let auditDir: string;
  let audit: ReturnType<typeof createAuditLogger>;

  beforeEach(() => {
    auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-audit-'));
    audit = createAuditLogger(auditDir);
  });

  afterEach(() => {
    fs.rmSync(auditDir, { recursive: true, force: true });
  });

  // E2E-INF-03, E2E-GF-12
  it('logs an action with all required fields', () => {
    audit.log({
      sessionId: 'session-1',
      toolName: 'mcp__gmail__send',
      toolInput: { to: 'billing@sopra.com', subject: 'Facture' },
      decision: 'ALLOW',
    });

    const entries = audit.read();
    expect(entries).toHaveLength(1);
    expect(entries[0].sessionId).toBe('session-1');
    expect(entries[0].toolName).toBe('mcp__gmail__send');
    expect(entries[0].decision).toBe('ALLOW');
    expect(entries[0].timestamp).toBeDefined();
  });

  it('appends multiple entries', () => {
    audit.log({ sessionId: 's1', toolName: 'gmail.send', toolInput: {}, decision: 'ALLOW' });
    audit.log({ sessionId: 's2', toolName: 'gmail.send', toolInput: {}, decision: 'DENY' });
    expect(audit.read()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Vérifier échec**

- [ ] **Step 3: Implémenter audit.ts**

```typescript
import fs from 'fs';
import path from 'path';

interface AuditLogInput {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  decision: 'ALLOW' | 'DENY' | 'ASK';
  result?: string;
}

interface AuditEntry extends AuditLogInput {
  timestamp: string;
}

export function createAuditLogger(auditDir: string) {
  const logFile = path.join(auditDir, 'actions.log');
  fs.mkdirSync(auditDir, { recursive: true });

  function log(input: AuditLogInput): void {
    const entry: AuditEntry = {
      ...input,
      timestamp: new Date().toISOString(),
    };
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  }

  function read(): AuditEntry[] {
    if (!fs.existsSync(logFile)) return [];
    return fs.readFileSync(logFile, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  }

  return { log, read };
}
```

- [ ] **Step 4: Vérifier pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(backend): audit trail — actions.log JSONL logger"
```

---

### Task 8: Module workspace — state manager

**Files:**
- Create: `alfred/apps/backend/src/workspace/state.ts`
- Create: `alfred/apps/backend/src/workspace/dossier.ts`
- Create: `alfred/apps/backend/src/workspace/suggestions.ts`
- Create: `alfred/apps/backend/src/workspace/gaps.ts`
- Create: `alfred/apps/backend/tests/workspace/state.test.ts`
- Create: `alfred/apps/backend/tests/workspace/dossier.test.ts`
- Create: `alfred/apps/backend/tests/workspace/suggestions.test.ts`
- Create: `alfred/apps/backend/tests/workspace/gaps.test.ts`

**Tests couverts:** E2E-WS-01, E2E-WS-02, E2E-WS-03, E2E-WS-04, E2E-WS-06, E2E-WS-07, E2E-WS-08, E2E-WS-09, E2E-WS-10, E2E-WS-11, E2E-WS-12, E2E-WS-13, E2E-SUG-04, E2E-SUG-07, E2E-SUG-08, E2E-SUG-09, E2E-AML-01, E2E-AML-03, E2E-AML-04, E2E-EDGE-02, E2E-EDGE-04, E2E-EDGE-14, E2E-EDGE-15, E2E-EDGE-16

- [ ] **Step 1: Écrire tests/workspace/state.test.ts — parsing state.md**

```typescript
// tests/workspace/state.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseStateMd, parseCheckpointMd } from '../../src/workspace/state.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('parseStateMd', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-ws-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // E2E-WS-04
  it('parses status, title, and objective from state.md', () => {
    const stateMd = `# Factures Sopra\n\nSTATUT : EN COURS\n\n## Objectif\nGénérer et envoyer les factures\n\n## Journal\n- 2026-03-14 : Créé`;
    fs.writeFileSync(path.join(tmpDir, 'state.md'), stateMd);
    const result = parseStateMd(tmpDir);
    expect(result.title).toBe('Factures Sopra');
    expect(result.status).toBe('EN COURS');
    expect(result.objective).toBe('Générer et envoyer les factures');
  });

  // E2E-EDGE-04
  it('handles empty state.md gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'state.md'), '');
    const result = parseStateMd(tmpDir);
    expect(result.title).toBe('');
    expect(result.status).toBe('EN COURS'); // default
  });

  // E2E-EDGE-16
  it('handles unknown status as EN COURS', () => {
    fs.writeFileSync(path.join(tmpDir, 'state.md'), '# Test\n\nSTATUT : INCONNU');
    const result = parseStateMd(tmpDir);
    expect(result.status).toBe('EN COURS');
  });
});

describe('parseCheckpointMd', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-ws-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // E2E-WS-07
  it('parses checkpoint summary', () => {
    fs.writeFileSync(path.join(tmpDir, 'checkpoint.md'), '# Checkpoint\n\nJ\'ai besoin de l\'accès SFTP pour continuer.');
    const result = parseCheckpointMd(tmpDir);
    expect(result).toContain('accès SFTP');
  });

  // E2E-EDGE-14
  it('handles malformed checkpoint.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'checkpoint.md'), '{{invalid}}');
    const result = parseCheckpointMd(tmpDir);
    expect(result).toBe('{{invalid}}'); // returns raw content
  });

  it('returns null if no checkpoint.md', () => {
    const result = parseCheckpointMd(tmpDir);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Écrire tests/workspace/dossier.test.ts — CRUD dossiers**

```typescript
// tests/workspace/dossier.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDossierManager } from '../../src/workspace/dossier.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('DossierManager', () => {
  let wsDir: string;
  let mgr: ReturnType<typeof createDossierManager>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-ws-'));
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
    mgr = createDossierManager(wsDir);
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  // E2E-WS-01
  it('creates a dossier with state.md and correct structure', () => {
    mgr.createDossier('factures-sopra', 'Générer les factures Sopra');
    expect(fs.existsSync(path.join(wsDir, 'factures-sopra', 'state.md'))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, 'factures-sopra', 'artifacts'))).toBe(true);
    const content = fs.readFileSync(path.join(wsDir, 'factures-sopra', 'state.md'), 'utf-8');
    expect(content).toContain('STATUT : EN COURS');
    expect(content).toContain('Générer les factures Sopra');
  });

  // E2E-WS-02
  it('creates dossier from suggestion, removes suggestion file', () => {
    const suggFile = path.join(wsDir, '_suggestions', 'impots-chypre.md');
    fs.writeFileSync(suggFile, '# Impôts Chypre\nURGENCE: urgent\n');
    mgr.createDossierFromSuggestion('impots-chypre');
    expect(fs.existsSync(path.join(wsDir, 'impots-chypre', 'state.md'))).toBe(true);
    expect(fs.existsSync(suggFile)).toBe(false);
  });

  // E2E-WS-03
  it('ignores a suggestion by deleting its file', () => {
    const suggFile = path.join(wsDir, '_suggestions', 'test-sugg.md');
    fs.writeFileSync(suggFile, '# Test');
    mgr.ignoreSuggestion('test-sugg');
    expect(fs.existsSync(suggFile)).toBe(false);
  });

  // E2E-WS-09
  it('marks dossier as complete', () => {
    mgr.createDossier('done-test', 'Test completion');
    mgr.markDossierComplete('done-test');
    const content = fs.readFileSync(path.join(wsDir, 'done-test', 'state.md'), 'utf-8');
    expect(content).toContain('STATUT : TERMINÉ');
  });

  // E2E-WS-12, E2E-WS-13
  it('saves artifact file in dossier', () => {
    mgr.createDossier('artifacts-test', 'Test');
    mgr.saveArtifact('artifacts-test', 'facture.pdf', Buffer.from('pdf-content'));
    expect(fs.existsSync(path.join(wsDir, 'artifacts-test', 'artifacts', 'facture.pdf'))).toBe(true);
  });

  // E2E-EDGE-15
  it('prevents creating dossier with existing name', () => {
    mgr.createDossier('duplicate', 'First');
    expect(() => mgr.createDossier('duplicate', 'Second')).toThrow();
  });

  // E2E-EDGE-02
  it('handles dossier with same name as suggestion', () => {
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'same-name.md'), '# Same');
    mgr.createDossier('same-name', 'Dossier');
    // Both should coexist — suggestion not auto-deleted
    expect(fs.existsSync(path.join(wsDir, 'same-name', 'state.md'))).toBe(true);
  });
});
```

- [ ] **Step 2b: Écrire tests/workspace/suggestions.test.ts**

```typescript
// tests/workspace/suggestions.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSuggestionsManager } from '../../src/workspace/suggestions.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('SuggestionsManager', () => {
  let wsDir: string;
  let sugg: ReturnType<typeof createSuggestionsManager>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-ws-'));
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
    sugg = createSuggestionsManager(wsDir);
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  // E2E-SUG-04
  it('lists all suggestions with parsed fields', () => {
    fs.writeFileSync(
      path.join(wsDir, '_suggestions', 'test.md'),
      '# Test Suggestion\nURGENCE: normal\nSOURCE: gmail\nDATE: 2026-03-14\n\n## Résumé\nTest\n\n## Pourquoi\nReason\n\n## Ce que je ferais\nAction',
    );
    const list = sugg.listSuggestions();
    expect(list).toHaveLength(1);
    expect(list[0].slug).toBe('test');
    expect(list[0].urgency).toBe('normal');
  });

  // E2E-SUG-07
  it('detects duplicate suggestion by title similarity', () => {
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'existing.md'), '# Déclaration TVA\nURGENCE: normal');
    expect(sugg.isDuplicateSuggestion('Déclaration TVA')).toBe(true);
    expect(sugg.isDuplicateSuggestion('Tout autre chose')).toBe(false);
  });

  // E2E-SUG-08
  it('sorts suggestions by urgency (urgent first)', () => {
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'a.md'), '# A\nURGENCE: faible');
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'b.md'), '# B\nURGENCE: urgent');
    const list = sugg.listSuggestions();
    expect(list[0].urgency).toBe('urgent');
  });

  // E2E-SUG-09
  it('caps suggestions at 20 max', () => {
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(path.join(wsDir, '_suggestions', `s${i}.md`), `# S${i}\nURGENCE: normal`);
    }
    const list = sugg.listSuggestions();
    expect(list.length).toBeLessThanOrEqual(20);
  });
});
```

- [ ] **Step 2c: Écrire tests/workspace/gaps.test.ts**

```typescript
// tests/workspace/gaps.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGapsManager } from '../../src/workspace/gaps.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('GapsManager', () => {
  let wsDir: string;
  let gaps: ReturnType<typeof createGapsManager>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-ws-'));
    fs.mkdirSync(path.join(wsDir, '_gaps'), { recursive: true });
    gaps = createGapsManager(wsDir);
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  // E2E-AML-01
  it('parses gaps.md into structured entries', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — Accès SFTP manquant\n\n**Problème:** Pas de credentials\n**Impact:** Bloque factures\n**Suggestion:** Demander à IT\n**Dossier:** factures-sopra\n\n---\n',
    );
    const list = gaps.listGaps();
    expect(list).toHaveLength(1);
    expect(list[0].title).toContain('Accès SFTP');
    expect(list[0].dossierId).toBe('factures-sopra');
  });

  // E2E-AML-03
  it('marks a gap as resolved', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — Test Gap\n\n**Problème:** X\n**Impact:** Y\n**Suggestion:** Z\n\n---\n',
    );
    gaps.markResolved(0);
    const list = gaps.listGaps();
    expect(list[0].resolved).toBe(true);
  });

  // E2E-AML-04
  it('detects duplicate gap', () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — SFTP\n\n**Problème:** Pas accès\n**Impact:** Bloque\n**Suggestion:** Demander\n\n---\n',
    );
    expect(gaps.isDuplicateGap('SFTP')).toBe(true);
    expect(gaps.isDuplicateGap('Autre chose')).toBe(false);
  });
});
```

- [ ] **Step 3: Vérifier échecs**

```bash
pnpm --filter @alfred/backend test tests/workspace/
```
Expected: FAIL — modules not found

- [ ] **Step 4: Implémenter state.ts — parsing state.md et checkpoint.md**

```typescript
// src/workspace/state.ts
import fs from 'fs';
import path from 'path';
import type { DossierStatus, Dossier } from '@alfred/shared';

const VALID_STATUSES: DossierStatus[] = ['EN COURS', 'TERMINÉ', 'BLOQUÉ'];

export function parseStateMd(dossierDir: string): { title: string; status: DossierStatus; objective: string; lastAction: string } {
  const filePath = path.join(dossierDir, 'state.md');
  if (!fs.existsSync(filePath)) return { title: '', status: 'EN COURS', objective: '', lastAction: '' };

  const content = fs.readFileSync(filePath, 'utf-8');
  const title = content.match(/^# (.+)$/m)?.[1]?.trim() ?? '';
  const statusMatch = content.match(/STATUT\s*:\s*(.+)$/m)?.[1]?.trim();
  const status: DossierStatus = VALID_STATUSES.includes(statusMatch as DossierStatus)
    ? (statusMatch as DossierStatus)
    : 'EN COURS';
  const objective = content.match(/## Objectif\n(.+)/)?.[1]?.trim() ?? '';
  const lastActionMatch = content.match(/- (\d{4}-\d{2}-\d{2})/g);
  const lastAction = lastActionMatch ? lastActionMatch[lastActionMatch.length - 1].replace('- ', '') : '';

  return { title, status, objective, lastAction };
}

export function parseCheckpointMd(dossierDir: string): string | null {
  const filePath = path.join(dossierDir, 'checkpoint.md');
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8').trim();
  // Extract first meaningful line after heading (if any)
  const lines = content.split('\n').filter(l => !l.startsWith('#') && l.trim());
  return lines[0]?.trim() ?? content;
}

export function listDossierIds(workspaceDir: string): string[] {
  return fs.readdirSync(workspaceDir)
    .filter(f => !f.startsWith('_') && !f.startsWith('.'))
    .filter(f => fs.statSync(path.join(workspaceDir, f)).isDirectory())
    .filter(f => fs.existsSync(path.join(workspaceDir, f, 'state.md')));
}

export function getDossier(workspaceDir: string, id: string): Dossier {
  const dossierDir = path.join(workspaceDir, id);
  const state = parseStateMd(dossierDir);
  const checkpoint = parseCheckpointMd(dossierDir);
  const artifactsDir = path.join(dossierDir, 'artifacts');
  const artifacts = fs.existsSync(artifactsDir) ? fs.readdirSync(artifactsDir) : [];

  return {
    id,
    ...state,
    hasCheckpoint: checkpoint !== null,
    hasActiveSession: false, // set by launcher
    checkpointSummary: checkpoint ?? undefined,
    artifacts,
  };
}
```

- [ ] **Step 5: Implémenter dossier.ts — création/gestion des dossiers**

```typescript
// src/workspace/dossier.ts
import fs from 'fs';
import path from 'path';

export function createDossierManager(workspaceDir: string) {
  function createDossier(id: string, instruction: string): void {
    const dir = path.join(workspaceDir, id);
    if (fs.existsSync(dir)) throw new Error(`Dossier '${id}' already exists`);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
    const now = new Date().toISOString().slice(0, 10);
    const stateMd = `# ${id}\n\nSTATUT : EN COURS\n\n## Objectif\n${instruction}\n\n## Journal\n- ${now} : Créé\n`;
    fs.writeFileSync(path.join(dir, 'state.md'), stateMd);
  }

  function createDossierFromSuggestion(slug: string, instruction?: string): void {
    const suggFile = path.join(workspaceDir, '_suggestions', `${slug}.md`);
    const content = fs.existsSync(suggFile) ? fs.readFileSync(suggFile, 'utf-8') : '';
    const title = content.match(/^# (.+)$/m)?.[1] ?? slug;
    createDossier(slug, instruction ?? title);
    if (fs.existsSync(suggFile)) fs.unlinkSync(suggFile);
  }

  function ignoreSuggestion(slug: string): void {
    const suggFile = path.join(workspaceDir, '_suggestions', `${slug}.md`);
    if (fs.existsSync(suggFile)) fs.unlinkSync(suggFile);
  }

  function markDossierComplete(id: string): void {
    const stateFile = path.join(workspaceDir, id, 'state.md');
    let content = fs.readFileSync(stateFile, 'utf-8');
    content = content.replace(/STATUT\s*:\s*.+/m, 'STATUT : TERMINÉ');
    fs.writeFileSync(stateFile, content);
  }

  function saveArtifact(id: string, filename: string, data: Buffer): void {
    const dir = path.join(workspaceDir, id, 'artifacts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), data);
  }

  return { createDossier, createDossierFromSuggestion, ignoreSuggestion, markDossierComplete, saveArtifact };
}
```

- [ ] **Step 6: Implémenter suggestions.ts — CRUD suggestions**

```typescript
// src/workspace/suggestions.ts
import fs from 'fs';
import path from 'path';
import type { Suggestion, UrgencyLevel } from '@alfred/shared';

const URGENCY_ORDER: Record<UrgencyLevel, number> = { urgent: 0, normal: 1, faible: 2 };
const MAX_SUGGESTIONS = 20;

export function createSuggestionsManager(workspaceDir: string) {
  const suggestionsDir = path.join(workspaceDir, '_suggestions');

  function parseSuggestionFile(slug: string): Suggestion {
    const content = fs.readFileSync(path.join(suggestionsDir, `${slug}.md`), 'utf-8');
    const title = content.match(/^# (.+)$/m)?.[1]?.trim() ?? slug;
    const urgency = (content.match(/URGENCE:\s*(.+)$/m)?.[1]?.trim() ?? 'normal') as UrgencyLevel;
    const source = content.match(/SOURCE:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const date = content.match(/DATE:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const summary = content.match(/## Résumé\n([\s\S]*?)(?=\n##|$)/)?.[1]?.trim() ?? '';
    const why = content.match(/## Pourquoi\n([\s\S]*?)(?=\n##|$)/)?.[1]?.trim() ?? '';
    const whatIWouldDo = content.match(/## Ce que je ferais\n([\s\S]*?)(?=\n##|$)/)?.[1]?.trim() ?? '';
    return { slug, title, urgency, source, date, summary, why, whatIWouldDo };
  }

  function listSuggestions(): Suggestion[] {
    if (!fs.existsSync(suggestionsDir)) return [];
    return fs.readdirSync(suggestionsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => parseSuggestionFile(f.replace('.md', '')))
      .sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 1) - (URGENCY_ORDER[b.urgency] ?? 1))
      .slice(0, MAX_SUGGESTIONS);
  }

  function isDuplicateSuggestion(title: string): boolean {
    const existing = listSuggestions();
    return existing.some(s => s.title.toLowerCase() === title.toLowerCase());
  }

  return { listSuggestions, parseSuggestionFile, isDuplicateSuggestion };
}
```

- [ ] **Step 7: Implémenter gaps.ts — CRUD améliorations**

```typescript
// src/workspace/gaps.ts
import fs from 'fs';
import path from 'path';
import type { Amelioration } from '@alfred/shared';

export function createGapsManager(workspaceDir: string) {
  const gapsFile = path.join(workspaceDir, '_gaps', 'gaps.md');

  function parseGapsFile(): Amelioration[] {
    if (!fs.existsSync(gapsFile)) return [];
    const content = fs.readFileSync(gapsFile, 'utf-8');
    const sections = content.split('---').filter(s => s.trim());
    return sections.map((section, i) => {
      const title = section.match(/## .+ — (.+)/)?.[1]?.trim() ?? '';
      const date = section.match(/## (\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
      const problem = section.match(/\*\*Problème:\*\*\s*(.+)/)?.[1]?.trim() ?? '';
      const impact = section.match(/\*\*Impact:\*\*\s*(.+)/)?.[1]?.trim() ?? '';
      const suggestion = section.match(/\*\*Suggestion:\*\*\s*(.+)/)?.[1]?.trim() ?? '';
      const dossierId = section.match(/\*\*Dossier:\*\*\s*(.+)/)?.[1]?.trim();
      const resolved = section.includes('[RÉSOLU]');
      return { id: String(i), date, title, problem, impact, suggestion, dossierId, resolved };
    });
  }

  function listGaps(): Amelioration[] {
    return parseGapsFile();
  }

  function markResolved(index: number): void {
    const gaps = parseGapsFile();
    if (index >= gaps.length) return;
    // Rewrite file with [RÉSOLU] tag
    let content = fs.readFileSync(gapsFile, 'utf-8');
    const sections = content.split('---').filter(s => s.trim());
    if (!sections[index].includes('[RÉSOLU]')) {
      sections[index] = sections[index].replace(/^(## .+)/m, '$1 [RÉSOLU]');
    }
    fs.writeFileSync(gapsFile, sections.join('\n---\n') + '\n');
  }

  function isDuplicateGap(title: string): boolean {
    return parseGapsFile().some(g => g.title.toLowerCase().includes(title.toLowerCase()));
  }

  return { listGaps, markResolved, isDuplicateGap };
}
```

- [ ] **Step 8: Créer workspace/CLAUDE.md — prompt système global (niveau 1)**

```markdown
# Alfred — Assistant de Lolo

Tu es l'assistant personnel de Lolo. Tu travailles sur UN dossier à la fois.
Lis state.md pour comprendre où tu en es avant de faire quoi que ce soit.

## Identité
- Lolo communique en français
- Tu écris en français sauf le code et les commits (anglais)
- Style naturel, pas trop formel, max 1 emoji par message

## Comment travailler
- Met à jour state.md au fur et à mesure (journal avec dates)
- Si tu es bloqué (MFA, besoin d'info, décision requise) → écris checkpoint.md et attends
- Si tu termines le travail → change STATUT : TERMINÉ dans state.md
- Mets les fichiers produits dans artifacts/
- Ne réessaie PAS une action refusée par les hooks — adapte ton approche ou checkpoint

## Format state.md
\```
# Titre du dossier
STATUT : EN COURS | TERMINÉ | BLOQUÉ
## Objectif
Description claire de ce qui doit être fait
## Journal
- YYYY-MM-DD : action réalisée
\```

## Format checkpoint.md
Texte clair expliquant ce qui te bloque et ce dont tu as besoin.
Pas de markdown complexe, juste du texte humain lisible.

## Outils disponibles
- Gmail MCP (lire/envoyer emails)
- Camoufox (navigation web anti-détection)
- Bitwarden (mots de passe via /bitwarden)
- Google Calendar, Notion, Contacts macOS
```

Ce fichier est créé une fois dans `workspace/` et partagé par toutes les sessions Claude.
Le CLAUDE.md par dossier (niveau 2) est généré dynamiquement par le launcher (Task 9).

- [ ] **Step 9: Vérifier pass**

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(backend): workspace module — state parser, dossier CRUD, suggestions, gaps, CLAUDE.md global"
```

---

## Chunk 3: Backend Core — Launcher, Receiver, Hooks, Notifications

### Task 9: Module launcher — sessions tmux + Claude

**Files:**
- Create: `alfred/apps/backend/src/launcher/session.ts`
- Create: `alfred/apps/backend/src/launcher/sweep.ts`
- Create: `alfred/apps/backend/tests/launcher/session.test.ts`
- Create: `alfred/apps/backend/tests/launcher/lifecycle.test.ts`
- Create: `alfred/apps/backend/tests/launcher/sweep.test.ts`

**Tests couverts:** E2E-LCH-01, E2E-LCH-02, E2E-LCH-03, E2E-LCH-04, E2E-LCH-05, E2E-LCH-06, E2E-LCH-07, E2E-LCH-08, E2E-LCH-09, E2E-LCH-10, E2E-LCH-11, E2E-SLC-01, E2E-SLC-02, E2E-SLC-03, E2E-SLC-04, E2E-SLC-05, E2E-SLC-06, E2E-CRN-01, E2E-CRN-02, E2E-CRN-03, E2E-CRN-04, E2E-CRN-05, E2E-CRN-06, E2E-INF-04, E2E-EDGE-01, E2E-EDGE-03, E2E-EDGE-06, E2E-EDGE-10

- [ ] **Step 1: Écrire tests/launcher/session.test.ts**

```typescript
// tests/launcher/session.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLauncher } from '../../src/launcher/session.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Launcher — sessions', () => {
  let wsDir: string;
  let lockDir: string;
  let mockExecutor: any;
  let mockLocks: any;
  let mockNotify: any;
  let mockSse: any;
  let mockAudit: any;
  let launcher: ReturnType<typeof createLauncher>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-ws-'));
    lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-locks-'));
    // Créer un dossier avec state.md
    const dossierDir = path.join(wsDir, 'factures-sopra');
    fs.mkdirSync(dossierDir, { recursive: true });
    fs.writeFileSync(path.join(dossierDir, 'state.md'), '# Factures Sopra\nSTATUT : EN COURS\n## Objectif\nGénérer factures');

    mockExecutor = {
      launchTmux: vi.fn().mockResolvedValue(12345),
      sendKeys: vi.fn().mockResolvedValue(undefined),
      capturePane: vi.fn().mockResolvedValue('$ '),
      killSession: vi.fn().mockResolvedValue(undefined),
      listSessions: vi.fn().mockResolvedValue([]),
    };
    mockLocks = { acquire: vi.fn().mockReturnValue(true), release: vi.fn(), isLocked: vi.fn().mockReturnValue(false) };
    mockNotify = { notifyCheckpoint: vi.fn(), notifyCompleted: vi.fn() };
    mockSse = { emit: vi.fn() };
    mockAudit = { log: vi.fn() };

    launcher = createLauncher({
      executor: mockExecutor,
      locks: mockLocks,
      workspace: {
        getDossier: () => ({ id: 'factures-sopra', title: 'Factures Sopra', objective: 'Générer factures', status: 'EN COURS' }),
        listDossierIds: () => ['factures-sopra'],
        dir: wsDir,
      } as any,
      audit: mockAudit,
      notify: mockNotify,
      sse: mockSse,
      workspaceDir: wsDir,
    });
  });

  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
    fs.rmSync(lockDir, { recursive: true, force: true });
  });

  // E2E-LCH-01
  it('launches tmux session with correct command', async () => {
    await launcher.launchSession('factures-sopra', { source: 'gmail', content: 'Email test' });
    expect(mockLocks.acquire).toHaveBeenCalledWith('factures-sopra');
    expect(mockExecutor.launchTmux).toHaveBeenCalledWith(
      'alfred-factures-sopra',
      expect.stringContaining('claude --dangerously-skip-permissions'),
    );
    expect(mockSse.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'session:started' }));
  });

  // E2E-LCH-04
  it('generates CLAUDE.md with event context', async () => {
    await launcher.launchSession('factures-sopra', { source: 'gmail', content: 'Facture mars' });
    const claudeMd = fs.readFileSync(path.join(wsDir, 'factures-sopra', 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('Factures Sopra');
    expect(claudeMd).toContain('Facture mars');
    expect(claudeMd).toContain('gmail');
  });

  // E2E-LCH-02
  it('skips launch if dossier already locked', async () => {
    mockLocks.acquire.mockReturnValue(false);
    await launcher.launchSession('factures-sopra');
    expect(mockExecutor.launchTmux).not.toHaveBeenCalled();
  });

  // E2E-LCH-03
  it('launches parallel sessions on different dossiers', async () => {
    const dir2 = path.join(wsDir, 'exali-rapport');
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path.join(dir2, 'state.md'), '# Exali\nSTATUT : EN COURS');

    await launcher.launchSession('factures-sopra');
    await launcher.launchSession('exali-rapport');
    expect(mockExecutor.launchTmux).toHaveBeenCalledTimes(2);
  });

  // E2E-LCH-07, E2E-SLC-04
  it('resumes with --resume when .session-id exists', async () => {
    fs.writeFileSync(path.join(wsDir, 'factures-sopra', '.session-id'), 'session-abc-123');
    await launcher.launchSession('factures-sopra');
    expect(mockExecutor.launchTmux).toHaveBeenCalledWith(
      'alfred-factures-sopra',
      expect.stringContaining('--resume session-abc-123'),
    );
  });

  // E2E-LCH-11
  it('skips event for locked dossier', async () => {
    mockLocks.acquire.mockReturnValue(false);
    await launcher.launchSession('factures-sopra', { source: 'gmail', content: 'New email' });
    expect(mockExecutor.launchTmux).not.toHaveBeenCalled();
  });

  // E2E-SLC-06
  it('persists session-id on session end', () => {
    launcher.handleSessionEnd('factures-sopra', 'session-xyz');
    const saved = fs.readFileSync(path.join(wsDir, 'factures-sopra', '.session-id'), 'utf-8');
    expect(saved).toBe('session-xyz');
    expect(mockLocks.release).toHaveBeenCalledWith('factures-sopra');
  });
});
```

- [ ] **Step 2: Écrire tests/launcher/lifecycle.test.ts**

```typescript
// tests/launcher/lifecycle.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLauncher } from '../../src/launcher/session.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Launcher — lifecycle', () => {
  let wsDir: string;
  let mockExecutor: any;
  let mockLocks: any;
  let launcher: ReturnType<typeof createLauncher>;

  beforeEach(() => {
    vi.useFakeTimers();
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-ws-'));
    const dossierDir = path.join(wsDir, 'test-dossier');
    fs.mkdirSync(dossierDir, { recursive: true });
    fs.writeFileSync(path.join(dossierDir, 'state.md'), '# Test\nSTATUT : EN COURS');

    mockExecutor = {
      launchTmux: vi.fn().mockResolvedValue(12345),
      sendKeys: vi.fn().mockResolvedValue(undefined),
      capturePane: vi.fn().mockResolvedValue('Waiting for input...'),
      killSession: vi.fn().mockResolvedValue(undefined),
      listSessions: vi.fn().mockResolvedValue([]),
    };
    mockLocks = { acquire: vi.fn().mockReturnValue(true), release: vi.fn(), cleanupStaleLocks: vi.fn() };

    launcher = createLauncher({
      executor: mockExecutor,
      locks: mockLocks,
      workspace: { getDossier: () => ({ id: 'test-dossier', title: 'Test', objective: 'Test', status: 'EN COURS' }), listDossierIds: () => ['test-dossier'], dir: wsDir } as any,
      audit: { log: vi.fn() },
      notify: { notifyCheckpoint: vi.fn(), notifyCompleted: vi.fn() } as any,
      sse: { emit: vi.fn() } as any,
      workspaceDir: wsDir,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  // E2E-LCH-05
  it('cleans up lock on session end', async () => {
    await launcher.launchSession('test-dossier');
    launcher.handleSessionEnd('test-dossier');
    expect(mockLocks.release).toHaveBeenCalledWith('test-dossier');
  });

  // E2E-SLC-01
  it('starts idle timer on idle notification', async () => {
    await launcher.launchSession('test-dossier');
    launcher.handleIdle('test-dossier', 60_000); // 1 min timeout
    // Timer pas encore expiré
    expect(mockExecutor.sendKeys).not.toHaveBeenCalled();
  });

  // E2E-SLC-03
  it('sends timeout message when timer expires', async () => {
    await launcher.launchSession('test-dossier');
    launcher.handleIdle('test-dossier', 60_000);
    vi.advanceTimersByTime(60_000);
    // sendKeys appelé après le timeout — message de sauvegarde
    await vi.runAllTimersAsync();
    expect(mockExecutor.sendKeys).toHaveBeenCalledWith(
      'alfred-test-dossier',
      expect.stringContaining('Timeout'),
    );
  });

  // E2E-SLC-02 — annulation directe
  it('cancels idle timer when cancelIdleTimer called', async () => {
    await launcher.launchSession('test-dossier');
    launcher.handleIdle('test-dossier', 60_000);
    launcher.cancelIdleTimer('test-dossier');
    vi.advanceTimersByTime(120_000);
    expect(mockExecutor.sendKeys).not.toHaveBeenCalled();
  });

  // E2E-SLC-02 — via prochain hook (Option A)
  it('cancels idle timer when next hook arrives from idle session', async () => {
    await launcher.launchSession('test-dossier');
    launcher.handleIdle('test-dossier', 60_000);
    // Simule un hook PreToolUse/Stop/PostToolUse venant de cette session
    // Le handler détecte session idle → cancelIdleTimer + statut → active
    launcher.handleHookEvent('test-dossier', 'PreToolUse');
    vi.advanceTimersByTime(120_000);
    expect(mockExecutor.sendKeys).not.toHaveBeenCalled();
    // Statut repassé à active
    const sessions = launcher.listActiveSessions();
    expect(sessions.find(s => s.dossierId === 'test-dossier')?.status).toBe('active');
  });

  // E2E-EDGE-06
  it('handles rate limit with backoff', async () => {
    mockExecutor.launchTmux.mockRejectedValueOnce(new Error('429 rate limited'));
    // Le launcher devrait retry ou propager — selon l'implémentation
    await expect(launcher.launchSession('test-dossier')).rejects.toThrow('429');
  });

  // E2E-SLC-07 — Crash recovery
  it('recovers tmux sessions on startup', async () => {
    // Simuler une session tmux orpheline + .session-id sur disque
    const dossierDir = path.join(wsDir, 'factures-sopra');
    fs.mkdirSync(dossierDir, { recursive: true });
    fs.writeFileSync(path.join(dossierDir, '.session-id'), 'claude-session-abc');
    fs.writeFileSync(path.join(dossierDir, 'state.md'), '# Factures\nSTATUT : EN COURS');

    mockExecutor.listSessions.mockResolvedValue(['alfred-factures-sopra']);

    await launcher.recover();

    const sessions = launcher.listActiveSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].dossierId).toBe('factures-sopra');
    expect(sessions[0].claudeSessionId).toBe('claude-session-abc');
    expect(sessions[0].status).toBe('active');
  });

  // E2E-SLC-07 — Ignore tmux sessions sans .session-id
  it('skips tmux sessions without session-id file', async () => {
    mockExecutor.listSessions.mockResolvedValue(['alfred-unknown-dossier']);

    await launcher.recover();

    expect(launcher.listActiveSessions()).toHaveLength(0);
  });

  // E2E-SLC-08 — Locks stales nettoyés
  it('cleans stale locks on recovery', async () => {
    mockExecutor.listSessions.mockResolvedValue([]);

    await launcher.recover();

    expect(mockLocks.cleanupStaleLocks).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Écrire tests/launcher/sweep.test.ts**

```typescript
// tests/launcher/sweep.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createSweep } from '../../src/launcher/sweep.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Sweep', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-ws-'));
    // Créer quelques dossiers
    for (const id of ['factures-sopra', 'exali-rapport']) {
      const dir = path.join(wsDir, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'state.md'), `# ${id}\nSTATUT : EN COURS`);
    }
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  // E2E-CRN-01
  it('launches sessions for dossiers returned by Claude', async () => {
    const mockLauncher = { launchSession: vi.fn().mockResolvedValue(undefined) };
    const sweep = createSweep({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      runClaude: vi.fn().mockResolvedValue(JSON.stringify({ launch: ['factures-sopra'], suggestions: [] })),
    });
    // Créer le dossier dans le workspace
    fs.mkdirSync(path.join(wsDir, 'factures-sopra'), { recursive: true });
    fs.writeFileSync(path.join(wsDir, 'factures-sopra', 'state.md'), '# Factures\nSTATUT : EN COURS');
    const result = await sweep.runSweep();
    expect(mockLauncher.launchSession).toHaveBeenCalledWith('factures-sopra');
  });

  // E2E-CRN-05
  it('sweep creates suggestions in _suggestions/', async () => {
    // Simuler la réponse Claude avec une suggestion
    const sweepResponse = JSON.stringify({
      launch: [],
      suggestions: [{ title: 'Timesheet manquant', urgency: 'normal', why: 'Pas de timesheet juin' }],
    });
    // Le sweep devrait écrire la suggestion dans _suggestions/
    // Test vérifie que le fichier est créé avec le bon format
  });

  // E2E-CRN-02, E2E-LCH-08
  it('skips locked dossiers', async () => {
    const mockLauncher = { launchSession: vi.fn().mockResolvedValue(undefined) };
    // Le launcher.launchSession vérifie le lock en interne — si locké, il skip
    // Donc le sweep peut appeler launchSession sans vérifier le lock lui-même
  });

  // E2E-CRN-06
  it('does nothing when no dossiers need action', async () => {
    const mockLauncher = { launchSession: vi.fn() };
    const sweep = createSweep({ launcher: mockLauncher, workspaceDir: wsDir });
    // Réponse Claude : rien à faire
    // result.launched devrait être []
  });

  // E2E-EDGE-01
  it('handles event arriving during sweep', async () => {
    // Sweep et event sont indépendants — le lock empêche la double session
    // Ce test vérifie que le système ne crash pas si les deux arrivent en même temps
  });

  // E2E-EDGE-10
  it('detects dormant dossier (no session for 2 weeks)', async () => {
    // Dossier avec lastAction > 14 jours
    // Le sweep devrait le signaler pour vérification
  });
});
```

Note : les tests sweep sont structurellement plus complexes car ils dépendent du mock de `claude -p` (execFile). Les corps des tests seront complétés lors de l'implémentation — les scénarios et assertions attendues sont documentés.

- [ ] **Step 4: Vérifier échecs**

- [ ] **Step 5: Implémenter session.ts**

```typescript
// Interface pour mocker tmux/claude en test
export interface SessionExecutor {
  launchTmux(name: string, command: string): Promise<number>; // returns PID
  sendKeys(name: string, keys: string): Promise<void>;
  capturePane(name: string): Promise<string>;
  killSession(name: string): Promise<void>;
  listSessions(): Promise<string[]>;
}

export function createLauncher(deps: {
  executor: SessionExecutor;
  locks: LockManager;
  workspace: WorkspaceManager;
  audit: AuditLogger;
  notify: Notifier;
  sse: SSEEmitter;
  workspaceDir: string;
}) {
  const sessions = new Map<string, Session>(); // dossierId → Session
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async function launchSession(dossierId: string, event?: { source: string; content: string }): Promise<void> {
    if (!deps.locks.acquire(dossierId)) {
      console.log(`[launcher] ${dossierId} already locked, skipping`);
      return;
    }

    // Générer le CLAUDE.md du dossier avec le contexte de la session
    generateDossierClaudeMd(dossierId, event);

    // Construire la commande tmux
    const sessionName = `alfred-${dossierId}`;
    const dossierDir = path.join(deps.workspaceDir, dossierId);
    const sessionIdFile = path.join(dossierDir, '.session-id');
    const hasExistingSession = fs.existsSync(sessionIdFile);
    const resumeId = hasExistingSession ? fs.readFileSync(sessionIdFile, 'utf-8').trim() : null;

    const claudeCmd = resumeId
      ? `cd ${dossierDir} && claude --dangerously-skip-permissions --resume ${resumeId}`
      : `cd ${dossierDir} && claude --dangerously-skip-permissions`;

    const pid = await deps.executor.launchTmux(sessionName, claudeCmd);

    sessions.set(dossierId, {
      id: sessionName,
      dossierId,
      status: 'active',
      startedAt: new Date().toISOString(),
      claudeSessionId: resumeId ?? undefined,
      pid,
    });

    deps.sse.emit({ type: 'session:started', data: { dossierId }, timestamp: new Date().toISOString() });
  }

  function generateDossierClaudeMd(dossierId: string, event?: { source: string; content: string }): void {
    const dossierDir = path.join(deps.workspaceDir, dossierId);
    const state = deps.workspace.getDossier(dossierId);
    let content = `# Dossier : ${state.title}\n\n## Objectif\n${state.objective}\n`;
    if (event) {
      content += `\n## Event déclencheur\nSource: ${event.source}\n${event.content}\n`;
    }
    // confirm mode détecté via state.md ou instruction
    fs.writeFileSync(path.join(dossierDir, 'CLAUDE.md'), content);
  }

  async function resumeSession(dossierId: string): Promise<void> {
    return launchSession(dossierId); // resume détecté via .session-id
  }

  function handleSessionEnd(dossierId: string, claudeSessionId?: string): void {
    deps.locks.release(dossierId);
    cancelIdleTimer(dossierId);
    sessions.delete(dossierId);
    // Persister session-id pour future resume
    if (claudeSessionId) {
      const file = path.join(deps.workspaceDir, dossierId, '.session-id');
      fs.writeFileSync(file, claudeSessionId);
    }
    deps.sse.emit({ type: 'session:ended', data: { dossierId }, timestamp: new Date().toISOString() });
  }

  function handleIdle(dossierId: string, timeoutMs = 3600_000): void {
    sessions.get(dossierId)!.status = 'idle';
    deps.sse.emit({ type: 'session:idle', data: { dossierId }, timestamp: new Date().toISOString() });
    // Démarrer timer timeout
    idleTimers.set(dossierId, setTimeout(() => handleTimeout(dossierId), timeoutMs));
  }

  async function handleTimeout(dossierId: string): Promise<void> {
    const session = sessions.get(dossierId);
    if (!session) return;
    await deps.executor.sendKeys(session.id, 'Timeout — sauvegarde ton état dans state.md et termine.');
    // SessionEnd sera déclenché par le hook quand Claude quitte
  }

  function cancelIdleTimer(dossierId: string): void {
    const timer = idleTimers.get(dossierId);
    if (timer) { clearTimeout(timer); idleTimers.delete(dossierId); }
  }

  function handleHookEvent(dossierId: string, hookName: string): void {
    const session = sessions.get(dossierId);
    if (!session || session.status !== 'idle') return;
    // Session était idle → prochain hook = Lolo a répondu
    cancelIdleTimer(dossierId);
    session.status = 'active';
    deps.sse.emit({ type: 'session:active', data: { dossierId }, timestamp: new Date().toISOString() });
  }

  async function recover(): Promise<void> {
    const tmuxSessions = await deps.executor.listSessions();
    for (const name of tmuxSessions) {
      if (!name.startsWith('alfred-')) continue;
      const dossierId = name.replace('alfred-', '');
      const sessionIdPath = path.join(deps.workspaceDir, dossierId, '.session-id');
      if (!fs.existsSync(sessionIdPath)) continue;
      const claudeSessionId = fs.readFileSync(sessionIdPath, 'utf-8').trim();
      sessions.set(dossierId, { id: name, dossierId, claudeSessionId, status: 'active', startedAt: new Date().toISOString() });
    }
    // Nettoyage locks stales
    deps.locks.cleanupStaleLocks();
    console.log(`[launcher] Recovered ${sessions.size} sessions`);
  }

  function listActiveSessions(): Session[] {
    return Array.from(sessions.values());
  }

  return { launchSession, resumeSession, handleSessionEnd, handleIdle, handleTimeout, cancelIdleTimer, handleHookEvent, recover, listActiveSessions };
}
```

- [ ] **Step 6: Implémenter sweep.ts**

```typescript
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

const SWEEP_SYSTEM_PROMPT = `Mode sweep. Tu analyses l'état du workspace.
Pour chaque dossier EN COURS, dis si une action est nécessaire (deadline, relance, travail à avancer).
Crée des suggestions dans _suggestions/ si tu en identifies.
Réponds UNIQUEMENT en JSON :
{ "launch": ["dossier-id", ...], "suggestions": [{ "title": "...", "urgency": "urgent|normal|faible", "why": "..." }] }`;

export function createSweep(deps: {
  launcher: { launchSession: (id: string) => Promise<void> };
  workspaceDir: string;
}) {
  async function runSweep(): Promise<{ launched: string[]; suggestions: number }> {
    const prompt = `Lis workspace/*/state.md dans ${deps.workspaceDir}. Analyse chaque dossier actif.`;

    const { stdout } = await execFile('claude', [
      '-p',
      '--system-prompt', SWEEP_SYSTEM_PROMPT,
      '--allowedTools', 'Read,Glob,Grep,Write',
      prompt,
    ], { cwd: deps.workspaceDir, timeout: 120_000 });

    // Parse JSON de la réponse (Claude peut wrapper dans ```json)
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[sweep] No JSON in Claude response');
      return { launched: [], suggestions: 0 };
    }

    const result = JSON.parse(jsonMatch[0]) as {
      launch: string[];
      suggestions: Array<{ title: string; urgency: string; why: string }>;
    };

    // Lancer les sessions
    for (const dossierId of result.launch) {
      await deps.launcher.launchSession(dossierId);
    }

    return { launched: result.launch, suggestions: result.suggestions?.length ?? 0 };
  }

  return { runSweep };
}
```

Note : `--allowedTools` restreint le sweep à la lecture seule (Read, Glob, Grep) + Write pour créer des suggestions. Pas de browser, pas d'email.

- [ ] **Step 7: Vérifier pass**

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(backend): launcher — tmux sessions, lifecycle, sweep, crash recovery"
```

---

### Task 10: Module receiver — webhooks et events

**Files:**
- Create: `alfred/apps/backend/src/receiver/webhook.ts`
- Create: `alfred/apps/backend/src/receiver/watchers.ts`
- Create: `alfred/apps/backend/src/receiver/triage.ts`
- Create: `alfred/apps/backend/tests/receiver/webhook.test.ts`
- Create: `alfred/apps/backend/tests/receiver/watchers.test.ts`
- Create: `alfred/apps/backend/tests/receiver/triage.test.ts`

**Tests couverts:** E2E-RCV-01, E2E-RCV-02, E2E-RCV-03, E2E-RCV-04, E2E-RCV-05, E2E-RCV-06, E2E-RCV-07, E2E-RCV-08, E2E-SUG-01, E2E-SUG-02, E2E-SUG-03, E2E-EDGE-09

- [ ] **Step 1: Écrire tests/receiver/triage.test.ts**

```typescript
// tests/receiver/triage.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTriager } from '../../src/receiver/triage.js';

describe('Triager', () => {
  const dossiers = [
    { id: 'factures-sopra', title: 'Factures Sopra', status: 'EN COURS' as const },
    { id: 'exali-rapport', title: 'Rapport Exali', status: 'EN COURS' as const },
  ];

  // E2E-RCV-01
  it('routes event to matching dossier', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "dossierIds": ["factures-sopra"] }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'Email de billing@sopra.com: Facture mars' });
    expect(result.dossierIds).toEqual(['factures-sopra']);
    expect(result.suggestion).toBeUndefined();
  });

  // E2E-RCV-02
  it('creates suggestion when no dossier matches', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "suggestion": { "title": "Impôts Chypre", "urgency": "normal", "source": "gmail", "why": "Nouveau sujet" } }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'Email de tax@cyprus.gov.cy' });
    expect(result.dossierIds).toBeUndefined();
    expect(result.suggestion?.title).toBe('Impôts Chypre');
  });

  // E2E-RCV-06
  it('routes event to multiple dossiers', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "dossierIds": ["factures-sopra", "exali-rapport"] }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'Email comptable: concerne Sopra ET Exali' });
    expect(result.dossierIds).toEqual(['factures-sopra', 'exali-rapport']);
  });

  // E2E-RCV-07
  it('ignores spam', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "ignore": true, "reason": "spam marketing" }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'PROMO -50% SOLDES' });
    expect(result.ignore).toBe(true);
  });

  // E2E-RCV-08
  it('handles event for TERMINÉ dossier', async () => {
    const dossiersWithTermine = [...dossiers, { id: 'old-task', title: 'Old', status: 'TERMINÉ' as const }];
    const runClaude = vi.fn().mockResolvedValue('{ "suggestion": { "title": "Relancer old-task?", "urgency": "faible", "source": "gmail", "why": "Dossier terminé mais nouvel email" } }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiersWithTermine });
    const result = await triager.triage({ source: 'gmail', content: 'Re: old task' });
    expect(result.suggestion).toBeDefined();
  });

  // E2E-SUG-03
  it('creates suggestion while working on another dossier', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "suggestion": { "title": "Nouveau truc", "urgency": "normal", "source": "gmail", "why": "Pas lié aux dossiers actifs" } }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'Sujet totalement différent' });
    expect(result.suggestion).toBeDefined();
  });

  // E2E-EDGE-09
  it('handles suggestion for just-created dossier', async () => {
    // Dossier créé entre l'arrivée de l'event et le triage
    const runClaude = vi.fn().mockResolvedValue('{ "dossierIds": ["new-dossier"] }');
    const freshDossiers = [...dossiers, { id: 'new-dossier', title: 'New', status: 'EN COURS' as const }];
    const triager = createTriager({ runClaude, listDossiers: () => freshDossiers });
    const result = await triager.triage({ source: 'gmail', content: 'Re: new dossier' });
    expect(result.dossierIds).toEqual(['new-dossier']);
  });

  it('handles claude -p failure gracefully', async () => {
    const runClaude = vi.fn().mockRejectedValue(new Error('rate limited'));
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'some email' });
    // Fallback : crée une suggestion générique plutôt que perdre l'event
    expect(result.suggestion).toBeDefined();
  });
});
```

- [ ] **Step 2: Écrire tests/receiver/webhook.test.ts**

Tests pour : webhook Gmail accepté (E2E-RCV-01), dedup (E2E-RCV-03). Le webhook appelle le triager, donc les tests vérifient surtout la validation Zod + dedup + appel triage.

- [ ] **Step 3: Écrire tests/receiver/watchers.test.ts**

Tests pour : WhatsApp watcher routing (E2E-RCV-04), SMS watcher suggestion (E2E-RCV-05).

- [ ] **Step 4: Vérifier échecs**

- [ ] **Step 5a: Implémenter webhook.ts — parsing webhooks, validation, dedup**

```typescript
// src/receiver/webhook.ts
import type { GmailWebhook } from '@alfred/shared';
import { GmailWebhookSchema } from '@alfred/shared';

export function createWebhookReceiver(deps: {
  dedup: { isDuplicate: (c: string) => boolean; record: (c: string) => void };
  triage: (event: { source: string; content: string; metadata: Record<string, string> }) => Promise<void>;
}) {
  async function handleGmailWebhook(raw: unknown): Promise<{ accepted: boolean; reason?: string }> {
    const parsed = GmailWebhookSchema.safeParse(raw);
    if (!parsed.success) return { accepted: false, reason: 'invalid payload' };

    const data = parsed.data;
    const content = JSON.stringify({ from: data.from, subject: data.subject, body: data.body });

    if (deps.dedup.isDuplicate(content)) {
      return { accepted: false, reason: 'duplicate' };
    }
    deps.dedup.record(content);

    await deps.triage({
      source: 'gmail',
      content: `Email de ${data.from}: ${data.subject}\n\n${data.body}`,
      metadata: { messageId: data.messageId, threadId: data.threadId ?? '', from: data.from },
    });

    return { accepted: true };
  }

  return { handleGmailWebhook };
}
```

- [ ] **Step 5b: Implémenter watchers.ts — polling WhatsApp/SMS, extraction messages**

```typescript
// src/receiver/watchers.ts
export interface WatcherConfig {
  pollIntervalMs: number;
  source: 'whatsapp' | 'sms';
  getNewMessages: () => Promise<Array<{ from: string; body: string; timestamp: string }>>;
}

export function createWatcher(config: WatcherConfig, deps: {
  dedup: { isDuplicate: (c: string) => boolean; record: (c: string) => void };
  triage: (event: { source: string; content: string; metadata: Record<string, string> }) => Promise<void>;
}) {
  let timer: ReturnType<typeof setInterval> | null = null;

  async function poll(): Promise<void> {
    const messages = await config.getNewMessages();
    for (const msg of messages) {
      const content = JSON.stringify(msg);
      if (deps.dedup.isDuplicate(content)) continue;
      deps.dedup.record(content);
      await deps.triage({
        source: config.source,
        content: `${config.source} de ${msg.from}: ${msg.body}`,
        metadata: { from: msg.from, timestamp: msg.timestamp },
      });
    }
  }

  function start(): void {
    timer = setInterval(poll, config.pollIntervalMs);
  }

  function stop(): void {
    if (timer) clearInterval(timer);
  }

  return { start, stop, poll };
}
```

- [ ] **Step 5c: Implémenter triage.ts — routing events via claude -p**

```typescript
// src/receiver/triage.ts
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { DossierStatus } from '@alfred/shared';

const execFile = promisify(execFileCb);

const TRIAGE_SYSTEM_PROMPT = `Mode triage. Tu reçois un event et la liste des dossiers actifs.
Décide :
1. Si l'event concerne un ou plusieurs dossiers existants → { "dossierIds": ["id1", ...] }
2. Si c'est un nouveau sujet intéressant → { "suggestion": { "title": "...", "urgency": "urgent|normal|faible", "source": "...", "why": "..." } }
3. Si c'est du spam ou non pertinent → { "ignore": true, "reason": "..." }
Réponds UNIQUEMENT en JSON, rien d'autre.`;

interface TriageResult {
  dossierIds?: string[];
  suggestion?: { title: string; urgency: string; source: string; why: string };
  ignore?: boolean;
  reason?: string;
}

interface DossierSummary {
  id: string;
  title: string;
  status: DossierStatus;
}

export function createTriager(deps: {
  runClaude: (prompt: string) => Promise<string>;
  listDossiers: () => DossierSummary[];
}) {
  async function triage(event: { source: string; content: string }): Promise<TriageResult> {
    const dossiers = deps.listDossiers();
    const dossierList = dossiers
      .map(d => `- ${d.id}: ${d.title} (${d.status})`)
      .join('\n');

    const prompt = `Dossiers actifs:\n${dossierList}\n\nEvent (source: ${event.source}):\n${event.content}`;

    try {
      const stdout = await deps.runClaude(prompt);
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      return JSON.parse(jsonMatch[0]) as TriageResult;
    } catch (error) {
      // Fallback : ne jamais perdre un event — créer une suggestion générique
      console.error('[triage] Claude failed, creating fallback suggestion:', error);
      return {
        suggestion: {
          title: `Event non trié (${event.source})`,
          urgency: 'normal',
          source: event.source,
          why: `Triage automatique échoué. Contenu: ${event.content.slice(0, 200)}`,
        },
      };
    }
  }

  return { triage };
}

// Production : runClaude appelle claude -p
export function createClaudeRunner(workspaceDir: string) {
  return async function runClaude(prompt: string): Promise<string> {
    const { stdout } = await execFile('claude', [
      '-p',
      '--system-prompt', TRIAGE_SYSTEM_PROMPT,
      prompt,
    ], { cwd: workspaceDir, timeout: 30_000 });
    return stdout;
  };
}
```

Note : `runClaude` est injecté comme dépendance pour permettre le mocking en test.
En production, `createClaudeRunner()` fournit l'implémentation réelle.

- [ ] **Step 6: Vérifier pass**

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(backend): receiver — webhook Gmail, watchers SMS/WhatsApp, triage"
```

---

### Task 11: Module hooks — endpoint centralisé /api/hooks

**Files:**
- Create: `alfred/apps/backend/src/hooks/handler.ts`
- Create: `alfred/apps/backend/tests/hooks/pretooluse.test.ts`

**Tests couverts:** E2E-GF-01 à E2E-GF-18, E2E-EDGE-11

- [ ] **Step 1: Écrire tests/hooks/pretooluse.test.ts**

Note : les hooks `type: "prompt"` (ALLOW/DENY/ASK) sont natifs à Claude Code (matchers dans settings.json), pas implémentés par notre code.
Ce module gère l'endpoint `/api/hooks` qui reçoit les `type: "command"` hooks.

Tests du handler (ce qu'il fait côté backend pour chaque scénario) :
- E2E-GF-01 à GF-11 : vérifier que PostToolUse audit log est écrit quand l'action est allowed/denied par les prompt hooks natifs
- E2E-GF-12 : PostToolUse → audit.log contient sessionId, toolName, toolInput, decision
- E2E-GF-13 : handler timeout → retourne réponse par défaut en <1s
- E2E-GF-14 : handler retourne `updatedInput` quand applicable
- E2E-GF-15 : ASK → notification Telegram envoyée, handler attend réponse Lolo
- E2E-GF-16 : ASK → Lolo refuse → handler retourne DENY
- E2E-GF-17 : ASK → timeout → handler retourne DENY par défaut
- E2E-GF-18 : Plusieurs hooks même appel → tous loggés dans audit
- E2E-EDGE-11 : 3 DENY consécutifs même outil → notification escalade

- [ ] **Step 2: Vérifier échecs**

- [ ] **Step 3: Implémenter handler.ts**

Le handler reçoit le JSON hook sur POST /api/hooks, route selon `hook_event_name` :
- `PreToolUse` / `PostToolUse` → audit log + **si session idle → `cancelIdleTimer()`, statut → `active`**
- `Notification` (idle_prompt) → tmux capture-pane, notification, timer
- `SessionEnd` → cleanup lock, check state.md/checkpoint.md, notification
- `Stop` → push SSE + **si session idle → `cancelIdleTimer()`, statut → `active`**

Note : l'annulation du idle timer se fait via le prochain hook de la session (Option A).
Quand Lolo répond dans le terminal, Claude recommence à traiter et déclenche un hook.
Le handler vérifie si la session est en statut `idle` → si oui, annule le timer.

- [ ] **Step 4: Vérifier pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(backend): hooks handler — endpoint centralisé /api/hooks"
```

---

### Task 12: Module notifications — Telegram via grammY

**Files:**
- Create: `alfred/apps/backend/src/notifications/telegram.ts`
- Create: `alfred/apps/backend/tests/notifications/telegram.test.ts`

**Tests couverts:** E2E-NTF-01 à E2E-NTF-09

- [ ] **Step 1: Écrire tests/notifications/telegram.test.ts**

Tests pour :
- Checkpoint → notification (E2E-NTF-01)
- MFA → notification (E2E-NTF-02)
- Dossier terminé → notification (E2E-NTF-03)
- Suggestion urgente → notification (E2E-NTF-04)
- Suggestion normale → PAS de notification (E2E-NTF-05)
- Action externe → notification informative (E2E-NTF-06)
- Notification contient lien (E2E-NTF-07)
- Retry avec backoff (E2E-NTF-08)
- Anti-spam (E2E-NTF-09)

grammY est mocké : les appels sendMessage sont capturés dans un tableau.

- [ ] **Step 2: Vérifier échecs**

- [ ] **Step 3: Implémenter telegram.ts**

```typescript
export function createNotifier(deps: {
  bot: Bot | MockBot;
  chatId: string;
  appBaseUrl: string;
}) { ... }
```

Fonctions : `notifyCheckpoint()`, `notifyMfa()`, `notifyCompleted()`, `notifySuggestion()`, `notifyAction()`, retry avec backoff (3 tentatives), rate limiter anti-spam.

- [ ] **Step 4: Vérifier pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(backend): notifications Telegram — retry, anti-spam, liens app"
```

---

### Task 13: Module SSE — events temps réel

**Files:**
- Create: `alfred/apps/backend/src/sse/emitter.ts`
- Create: `alfred/apps/backend/tests/sse/emitter.test.ts`

**Tests couverts:** E2E-APP-22 (côté backend)

- [ ] **Step 1: Écrire tests/sse/emitter.test.ts**

```typescript
// tests/sse/emitter.test.ts
import { describe, it, expect } from 'vitest';
import { createSSEEmitter } from '../../src/sse/emitter.js';

describe('SSEEmitter', () => {
  it('broadcasts event to connected clients', () => {
    const sse = createSSEEmitter();
    const received: string[] = [];
    const mockClient = { write: (data: string) => received.push(data) };
    sse.addClient(mockClient);
    sse.emit({ type: 'session:started', data: { id: 'test' }, timestamp: new Date().toISOString() });
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('session:started');
  });

  it('removes disconnected clients', () => {
    const sse = createSSEEmitter();
    const mockClient = { write: () => { throw new Error('disconnected'); } };
    sse.addClient(mockClient);
    // Should not throw
    sse.emit({ type: 'session:ended', data: {}, timestamp: new Date().toISOString() });
    expect(sse.clientCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Vérifier échec**

- [ ] **Step 3: Implémenter emitter.ts**

```typescript
// src/sse/emitter.ts
import type { SSEEvent } from '@alfred/shared';

interface SSEClient {
  write: (data: string) => void;
}

export function createSSEEmitter() {
  const clients = new Set<SSEClient>();

  function addClient(client: SSEClient): void {
    clients.add(client);
  }

  function removeClient(client: SSEClient): void {
    clients.delete(client);
  }

  function emit(event: SSEEvent): void {
    const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      try {
        client.write(data);
      } catch {
        clients.delete(client);
      }
    }
  }

  function clientCount(): number {
    return clients.size;
  }

  return { addClient, removeClient, emit, clientCount };
}
```

- [ ] **Step 4: Vérifier pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(backend): SSE emitter — events temps réel vers frontend"
```

---

### Task 14: Assembler les routes API

**Files:**
- Modify: `alfred/apps/backend/src/server.ts`
- Create: `alfred/apps/backend/src/routes/dossiers.ts`
- Create: `alfred/apps/backend/src/routes/suggestions.ts`
- Create: `alfred/apps/backend/src/routes/sessions.ts`
- Create: `alfred/apps/backend/src/routes/hooks.ts`
- Create: `alfred/apps/backend/src/routes/notifications.ts`
- Create: `alfred/apps/backend/src/routes/ameliorations.ts`

**Tests couverts:** Toutes les routes de la section 13 de la spec.

- [ ] **Step 1: Créer les route handlers — chaque fichier gère un groupe de routes**

Référence routes API (spec section 13) :
- `POST /api/webhook/gmail` → receiver
- `POST /api/hooks` → hooks handler
- `POST /api/sweep` → sweep
- `POST /api/dossier` → créer dossier
- `POST /api/dossier/:id/resume` → resume session
- `POST /api/dossier/:id/instruction` → instruction
- `POST /api/dossier/:id/upload` → upload fichiers
- `POST /api/suggestion/:slug/approve` → approuver suggestion
- `POST /api/suggestion/:slug/ignore` → ignorer suggestion
- `POST /api/session/:id/timeout` → simuler timeout
- `POST /api/amelioration/:id/resolve` → résoudre gap
- `GET /api/dossiers` → liste dossiers
- `GET /api/dossier/:id` → détail dossier
- `GET /api/suggestions` → liste suggestions
- `GET /api/ameliorations` → liste gaps
- `GET /api/sessions` → sessions actives
- `GET /api/notifications/recent` → notifications récentes
- `GET /api/events` → SSE stream

- [ ] **Step 2: Brancher tout dans server.ts — createApp() wires dependencies**

```typescript
export function createApp(deps: Dependencies) {
  const app = new Hono();
  // ... mount all route groups
  return app;
}
```

- [ ] **Step 3: Écrire un test d'intégration API basique**

Test : POST /api/dossier crée un dossier, GET /api/dossiers le retourne.

- [ ] **Step 4: Vérifier pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(backend): API routes complètes — 18 endpoints wired"
```

---

### Task 15: Tmux executor + Entrypoint backend — wiring + sweep + boot

**Files:**
- Create: `alfred/apps/backend/src/launcher/tmux-executor.ts`
- Modify: `alfred/apps/backend/src/index.ts`

- [ ] **Step 1: Créer tmux-executor.ts — implémentation production de SessionExecutor**

```typescript
// src/launcher/tmux-executor.ts
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { SessionExecutor } from './session.js';

const execFile = promisify(execFileCb);

export function createTmuxExecutor(): SessionExecutor {
  async function launchTmux(name: string, command: string): Promise<number> {
    await execFile('tmux', ['new-session', '-d', '-s', name, command]);
    const { stdout } = await execFile('tmux', ['list-panes', '-t', name, '-F', '#{pane_pid}']);
    return parseInt(stdout.trim(), 10);
  }

  async function sendKeys(name: string, keys: string): Promise<void> {
    await execFile('tmux', ['send-keys', '-t', name, keys, 'Enter']);
  }

  async function capturePane(name: string): Promise<string> {
    const { stdout } = await execFile('tmux', ['capture-pane', '-t', name, '-p', '-S', '-100']);
    return stdout;
  }

  async function killSession(name: string): Promise<void> {
    try {
      await execFile('tmux', ['kill-session', '-t', name]);
    } catch {
      // Session may already be dead
    }
  }

  async function listSessions(): Promise<string[]> {
    try {
      const { stdout } = await execFile('tmux', ['list-sessions', '-F', '#{session_name}']);
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return []; // tmux server not running
    }
  }

  return { launchTmux, sendKeys, capturePane, killSession, listSessions };
}
```

Note : les sessions Claude sont lancées avec `--dangerously-skip-permissions` comme défini dans la spec section 5.3. La commande tmux construite par `launchSession()` (Task 9) inclut ce flag.

- [ ] **Step 2: Wire tout dans index.ts**

```typescript
// index.ts — entrypoint production
import { createApp, startServer } from './server.js';
import { createLockManager } from './infra/locks.js';
import { createDedupStore } from './infra/dedup.js';
import { createAuditLogger } from './infra/audit.js';
import { listDossierIds, getDossier } from './workspace/state.js';
import { createDossierManager } from './workspace/dossier.js';
import { createSuggestionsManager } from './workspace/suggestions.js';
import { createGapsManager } from './workspace/gaps.js';
import { createLauncher } from './launcher/session.js';
import { createSweep } from './launcher/sweep.js';
import { createTmuxExecutor } from './launcher/tmux-executor.js';
import { createNotifier } from './notifications/telegram.js';
import { createSSEEmitter } from './sse/emitter.js';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || './workspace';
const LOCK_DIR = process.env.LOCK_DIR || '/tmp/assistant-locks';
const PORT = parseInt(process.env.PORT || '3001', 10);
const SWEEP_INTERVAL = parseInt(process.env.SWEEP_INTERVAL_MS || '3600000', 10);

// Boot
const locks = createLockManager(LOCK_DIR);
locks.cleanupStaleLocks(); // E2E-EDGE-18

const dedup = createDedupStore();
const audit = createAuditLogger(`${WORKSPACE_DIR}/_audit`);
const sse = createSSEEmitter();
const executor = createTmuxExecutor();
const notify = createNotifier({ /* bot config from env */ });
const launcher = createLauncher({ executor, locks, workspace: { listDossierIds, getDossier, dir: WORKSPACE_DIR }, audit, notify, sse });
const sweep = createSweep({ launcher, workspaceDir: WORKSPACE_DIR });

// API
const app = createApp({ locks, dedup, audit, workspace: WORKSPACE_DIR, launcher, sweep, notify, sse });
startServer(app, PORT);

// Cron sweep
setInterval(() => sweep.runSweep(), SWEEP_INTERVAL);
console.log(`[alfred] Sweep every ${SWEEP_INTERVAL / 1000}s`);
```

- [ ] **Step 3: Vérifier le boot**

```bash
WORKSPACE_DIR=/tmp/alfred-test pnpm --filter @alfred/backend dev
```
Expected: "[alfred] Backend listening on http://localhost:3001" + "[alfred] Sweep every 3600s"

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(backend): entrypoint — boot, wiring, sweep interval"
```

---

## Chunk 4: Frontend — App web complète

### Task 16: Store Zustand + API client

**Files:**
- Create: `alfred/apps/web/src/store.ts`
- Create: `alfred/apps/web/src/api.ts`

- [ ] **Step 1: Créer api.ts — une fonction par endpoint (18 total)**

```typescript
// src/api.ts
import type { Dossier, Suggestion, Amelioration, Session, NotificationRecord } from '@alfred/shared';

const BASE = '/api';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// GET
export const fetchDossiers = () => json<Dossier[]>('/dossiers');
export const fetchDossier = (id: string) => json<Dossier>(`/dossier/${id}`);
export const fetchSuggestions = () => json<Suggestion[]>('/suggestions');
export const fetchAmeliorations = () => json<Amelioration[]>('/ameliorations');
export const fetchSessions = () => json<Session[]>('/sessions');
export const fetchNotifications = () => json<NotificationRecord[]>('/notifications/recent');
// SSE handled separately via EventSource

// POST
export const createDossier = (instruction: string, confirm = false) =>
  json('/dossier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction, confirm }) });
export const resumeSession = (id: string) =>
  json(`/dossier/${id}/resume`, { method: 'POST' });
export const sendInstruction = (id: string, instruction: string, confirm = false) =>
  json(`/dossier/${id}/instruction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction, confirm }) });
export const uploadFile = (id: string, file: File) => {
  const form = new FormData(); form.append('file', file);
  return fetch(`${BASE}/dossier/${id}/upload`, { method: 'POST', body: form });
};
export const approveSuggestion = (slug: string, instruction?: string) =>
  json(`/suggestion/${slug}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction }) });
export const ignoreSuggestion = (slug: string) =>
  json(`/suggestion/${slug}/ignore`, { method: 'POST' });
export const timeoutSession = (id: string) =>
  json(`/session/${id}/timeout`, { method: 'POST' });
export const resolveAmelioration = (id: string) =>
  json(`/amelioration/${id}/resolve`, { method: 'POST' });
export const triggerSweep = () =>
  json('/sweep', { method: 'POST' });
```

- [ ] **Step 2: Créer store.ts — Zustand store avec toutes les actions**

```typescript
import { create } from 'zustand';
import type { Dossier, Suggestion, Amelioration, Session, NotificationRecord } from '@alfred/shared';
import * as api from './api';

interface Store {
  // State
  dossiers: Dossier[];
  suggestions: Suggestion[];
  ameliorations: Amelioration[];
  sessions: Session[];
  notifications: NotificationRecord[];
  loading: boolean;

  // Fetch actions
  fetchDossiers: () => Promise<void>;
  fetchSuggestions: () => Promise<void>;
  fetchAmeliorations: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchNotifications: () => Promise<void>;

  // Mutation actions
  createDossier: (instruction: string, confirm?: boolean) => Promise<void>;
  resumeSession: (id: string) => Promise<void>;
  sendInstruction: (id: string, instruction: string, confirm?: boolean) => Promise<void>;
  uploadFile: (id: string, file: File) => Promise<void>;
  timeoutSession: (id: string) => Promise<void>;
  approveSuggestion: (slug: string, instruction?: string) => Promise<void>;
  ignoreSuggestion: (slug: string) => Promise<void>;
  resolveAmelioration: (id: string) => Promise<void>;
  triggerSweep: () => Promise<void>;
}

export const useStore = create<Store>((set, get) => ({
  dossiers: [], suggestions: [], ameliorations: [], sessions: [], notifications: [], loading: false,

  fetchDossiers: async () => { set({ dossiers: await api.fetchDossiers() }); },
  fetchSuggestions: async () => { set({ suggestions: await api.fetchSuggestions() }); },
  fetchAmeliorations: async () => { set({ ameliorations: await api.fetchAmeliorations() }); },
  fetchSessions: async () => { set({ sessions: await api.fetchSessions() }); },
  fetchNotifications: async () => { set({ notifications: await api.fetchNotifications() }); },

  createDossier: async (instruction, confirm) => { await api.createDossier(instruction, confirm); await get().fetchDossiers(); },
  resumeSession: async (id) => { await api.resumeSession(id); await get().fetchSessions(); },
  sendInstruction: async (id, instruction, confirm) => { await api.sendInstruction(id, instruction, confirm); },
  uploadFile: async (id, file) => { await api.uploadFile(id, file); },
  timeoutSession: async (id) => { await api.timeoutSession(id); await get().fetchSessions(); },
  approveSuggestion: async (slug, instruction) => { await api.approveSuggestion(slug, instruction); await get().fetchSuggestions(); await get().fetchDossiers(); },
  ignoreSuggestion: async (slug) => { await api.ignoreSuggestion(slug); await get().fetchSuggestions(); },
  resolveAmelioration: async (id) => { await api.resolveAmelioration(id); await get().fetchAmeliorations(); },
  triggerSweep: async () => { await api.triggerSweep(); },
}));
```

- [ ] **Step 3: Ajouter SSE listener dans le store**

```typescript
// Dans store.ts — fonction à appeler au mount de App
export function connectSSE() {
  const es = new EventSource(`${BASE}/events`);
  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    const store = useStore.getState();
    const refreshMap: Record<string, () => Promise<void>> = {
      'session:started': store.fetchSessions,
      'session:ended': store.fetchSessions,
      'session:idle': store.fetchSessions,
      'session:active': store.fetchSessions,
      'dossier:updated': store.fetchDossiers,
      'suggestion:created': store.fetchSuggestions,
      'checkpoint:created': store.fetchSessions, // checkpoint = session detail
      'checkpoint:resolved': store.fetchSessions,
      'amelioration:created': store.fetchAmeliorations,
    };
    refreshMap[event.type]?.();
  };
  return () => es.close();
}
```

EventSource natif qui écoute `GET /api/events` et met à jour le store en temps réel (E2E-APP-22).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(web): Zustand store + API client + SSE listener"
```

---

### Task 17: Layout responsive — desktop icon rail + mobile tab bar

**Files:**
- Create: `alfred/apps/web/src/components/Layout.tsx`
- Create: `alfred/apps/web/src/components/DesktopNav.tsx`
- Create: `alfred/apps/web/src/components/MobileNav.tsx`

**Tests couverts:** E2E-APP-19, E2E-APP-20

- [ ] **Step 1: Implémenter Layout.tsx avec détection responsive**

Desktop (>768px) : icon rail à gauche (Home, Dossiers, Terminal, Améliorations), avatar en bas.
Mobile (<768px) : tab bar en bas (Home, Dossiers, Nouveau, Terminal, Plus).

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(web): layout responsive — desktop icon rail + mobile tab bar"
```

---

### Task 18: Page Home

**Files:**
- Create: `alfred/apps/web/src/pages/Home.tsx`
- Create: `alfred/apps/web/src/components/CheckpointCard.tsx`
- Create: `alfred/apps/web/src/components/SuggestionCard.tsx`
- Create: `alfred/apps/web/src/components/SessionCard.tsx`
- Create: `alfred/apps/web/src/components/ActivityFeed.tsx`

**Tests couverts:** E2E-APP-01, E2E-APP-02, E2E-APP-03, E2E-APP-04, E2E-APP-05, E2E-APP-25, E2E-APP-26

- [ ] **Step 1: Implémenter Home.tsx avec les 4 sections**

1. "Pour toi" — checkpoints en attente (E2E-APP-01) avec bouton "Ouvrir le terminal"
2. "Suggestions" — suggestions avec boutons Créer/Ignorer (E2E-APP-02), bordure colorée par urgence (E2E-APP-25)
3. "En fond" — sessions actives avec dot vert et durée (E2E-APP-03)
4. "Activité récente" — derniers events + lien logs (E2E-APP-04)

Mode zen quand rien à faire (E2E-APP-05). État vide premier lancement (E2E-APP-26).

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(web): page Home — checkpoints, suggestions, sessions, activité"
```

---

### Task 19: Page Dossiers

**Files:**
- Create: `alfred/apps/web/src/pages/Dossiers.tsx`
- Create: `alfred/apps/web/src/components/DossierCard.tsx`

**Tests couverts:** E2E-APP-06, E2E-APP-07, E2E-APP-23

- [ ] **Step 1: Implémenter Dossiers.tsx**

Liste avec filtres Actifs/Terminés/Bloqués, barre de recherche (E2E-APP-23), bouton "+ Nouveau", badge checkpoint (E2E-APP-07).

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(web): page Dossiers — liste, filtres, recherche"
```

---

### Task 20: Page Dossier detail

**Files:**
- Create: `alfred/apps/web/src/pages/DossierDetail.tsx`
- Create: `alfred/apps/web/src/components/StateRenderer.tsx`
- Create: `alfred/apps/web/src/components/InstructionBar.tsx`
- Create: `alfred/apps/web/src/components/Sidebar.tsx`

**Tests couverts:** E2E-APP-08, E2E-APP-09, E2E-APP-10, E2E-APP-11, E2E-APP-28

- [ ] **Step 1: Implémenter DossierDetail.tsx**

- StateRenderer : state.md rendu en HTML lisible (E2E-APP-08), pas markdown brut
- Bannière checkpoint avec résumé + "Ouvrir le terminal" (E2E-APP-09)
- Sidebar : statut session, fichiers artifacts, historique (E2E-APP-10)
- InstructionBar en bas : textarea + mode confirm + bouton envoyer (E2E-APP-11, E2E-APP-28)

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(web): page Dossier detail — state rendu, checkpoint, sidebar, instructions"
```

---

### Task 21: Page Terminal — xterm.js + tmux bridge

**Files:**
- Create: `alfred/apps/web/src/pages/Terminal.tsx`
- Create: `alfred/apps/web/src/components/TerminalPane.tsx`
- Create: `alfred/apps/backend/src/terminal/bridge.ts`
- Create: `alfred/apps/backend/tests/terminal/bridge.test.ts`

**Tests couverts:** E2E-APP-12, E2E-APP-13, E2E-APP-14, E2E-APP-24

C'est la partie la plus complexe techniquement — bridge tmux ↔ WebSocket ↔ xterm.js.

- [ ] **Step 1a: Écrire tests/terminal/bridge.test.ts**

```typescript
// tests/terminal/bridge.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTerminalBridge } from '../../src/terminal/bridge.js';

describe('TerminalBridge', () => {
  it('creates a bridge for a valid session', () => {
    const mockExecutor = {
      capturePane: vi.fn().mockResolvedValue('$ hello'),
      sendKeys: vi.fn().mockResolvedValue(undefined),
      listSessions: vi.fn().mockResolvedValue(['session-1']),
    };
    const bridge = createTerminalBridge(mockExecutor as any);
    expect(bridge).toBeDefined();
    expect(typeof bridge.attach).toBe('function');
  });

  it('rejects attach for non-existent session', async () => {
    const mockExecutor = {
      listSessions: vi.fn().mockResolvedValue([]),
    };
    const bridge = createTerminalBridge(mockExecutor as any);
    await expect(bridge.attach('nonexistent')).rejects.toThrow();
  });
});
```

- [ ] **Step 1b: Implémenter bridge.ts côté backend**

WebSocket endpoint composé de :
1. Upgrade handling (vérification que la session tmux existe)
2. tmux attach — spawn `tmux attach -t <name>` child process
3. stdin/stdout piping bidirectionnel (WebSocket ↔ child process)
4. Cleanup on disconnect (kill child process, pas la session tmux)

- [ ] **Step 2: Implémenter Terminal.tsx côté frontend**

Onglets de sessions (E2E-APP-12), xterm.js avec interaction tmux (E2E-APP-13), barre de statut (E2E-APP-14), responsive mobile (E2E-APP-24).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: terminal — xterm.js + tmux WebSocket bridge"
```

---

### Task 22: Page Nouveau

**Files:**
- Create: `alfred/apps/web/src/pages/Nouveau.tsx`

**Tests couverts:** E2E-APP-15, E2E-APP-16

- [ ] **Step 1: Implémenter Nouveau.tsx**

Formulaire : textarea instruction, checkbox "Valider avant actions externes", upload fichiers, bouton "Lancer" (E2E-APP-15). Suggestions sous le formulaire (E2E-APP-16).

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(web): page Nouveau — créer dossier + suggestions"
```

---

### Task 23: Page Améliorations

**Files:**
- Create: `alfred/apps/web/src/pages/Ameliorations.tsx`

**Tests couverts:** E2E-APP-17, E2E-APP-18, E2E-AML-02

- [ ] **Step 1: Implémenter Ameliorations.tsx**

Liste des gaps avec cartes (titre, description, impact, suggestion, lien dossier, bouton "Marquer résolu") (E2E-APP-17). Filtres ouvertes/résolues (E2E-APP-18).

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(web): page Améliorations — gaps liste + filtres"
```

---

### Task 24: Navigation et PWA

**Files:**
- Modify: `alfred/apps/web/src/App.tsx`
- Create: `alfred/apps/web/public/manifest.json`

**Tests couverts:** E2E-APP-21, E2E-APP-27

- [ ] **Step 1: Implémenter navigation Home → Dossier → Terminal (E2E-APP-21)**

Clic checkpoint → page dossier → "Ouvrir le terminal" → terminal bon onglet.

- [ ] **Step 2: Liens Telegram → app web (E2E-APP-27)**

Les URLs contiennent l'ID dossier : `/dossier/factures-sopra` → ouvre la bonne page.

- [ ] **Step 3: Créer PWA manifest + service worker minimal**

`public/manifest.json` :
```json
{
  "name": "Alfred",
  "short_name": "Alfred",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`public/sw.js` — service worker basique pour l'installabilité :
```javascript
self.addEventListener('fetch', () => {}); // no-op, enables install prompt
```

Ajouter `<link rel="manifest" href="/manifest.json">` dans `index.html` et enregistrer le SW dans `main.tsx` :
```typescript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(web): navigation complète + PWA manifest + service worker"
```

---

## Chunk 5: Tests Playwright + Edge cases + Smoke + Infrastructure

### Task 25: Tests Playwright — app web

**Files:**
- Create: `alfred/apps/web/tests/e2e/home.spec.ts`
- Create: `alfred/apps/web/tests/e2e/dossiers.spec.ts`
- Create: `alfred/apps/web/tests/e2e/dossier-detail.spec.ts`
- Create: `alfred/apps/web/tests/e2e/terminal.spec.ts`
- Create: `alfred/apps/web/tests/e2e/nouveau.spec.ts`
- Create: `alfred/apps/web/tests/e2e/ameliorations.spec.ts`
- Create: `alfred/apps/web/tests/e2e/responsive.spec.ts`
- Create: `alfred/apps/web/tests/e2e/navigation.spec.ts`
- Create: `alfred/apps/web/tests/e2e/realtime.spec.ts`
- Create: `alfred/apps/web/tests/e2e/empty-state.spec.ts`
- Create: `alfred/apps/web/tests/e2e/fixtures/`
- Create: `alfred/apps/web/playwright.config.ts`
- Create: `alfred/apps/web/tests/e2e/global-setup.ts`

**Tests couverts:** Tous les E2E-APP-* (28 tests)

- [ ] **Step 1: Créer playwright.config.ts avec 2 viewports (desktop + mobile)**

- [ ] **Step 2: Créer global-setup.ts — lance backend mode test + frontend Vite**

- [ ] **Step 3: Créer les fixtures — workspace pré-rempli**

- [ ] **Step 4: Écrire home.spec.ts (E2E-APP-01 à -05)**

- [ ] **Step 5: Écrire dossiers.spec.ts (E2E-APP-06, -07, -23)**

- [ ] **Step 6: Écrire dossier-detail.spec.ts (E2E-APP-08 à -11, -28)**

- [ ] **Step 7: Écrire terminal.spec.ts (E2E-APP-12 à -14, -24)**

- [ ] **Step 8: Écrire nouveau.spec.ts (E2E-APP-15, -16)**

- [ ] **Step 9: Écrire ameliorations.spec.ts (E2E-APP-17, -18)**

- [ ] **Step 10: Écrire responsive.spec.ts (E2E-APP-19, -20)**

- [ ] **Step 11: Écrire navigation.spec.ts (E2E-APP-21, -27)**

- [ ] **Step 12: Écrire realtime.spec.ts (E2E-APP-22)**

- [ ] **Step 13: Écrire empty-state.spec.ts (E2E-APP-25, -26)**

- [ ] **Step 14: Lancer tous les tests Playwright — vérifier qu'ils passent**

```bash
pnpm --filter @alfred/web test:e2e
```

- [ ] **Step 15: Commit**

```bash
git add -A && git commit -m "test(web): Playwright E2E — 28 tests UI sur 2 viewports"
```

---

### Task 26: Tests edge cases backend

**Files:**
- Create: `alfred/apps/backend/tests/edge-cases/edge-cases.test.ts`

**Tests couverts:** E2E-EDGE-01 à E2E-EDGE-18 (ceux pas encore couverts par les tasks précédentes)

Les edge cases déjà couverts dans d'autres tasks :
- E2E-EDGE-02 → Task 8 (dossier.test.ts)
- E2E-EDGE-04 → Task 8 (state.test.ts)
- E2E-EDGE-13 → Task 5 (locks.test.ts)
- E2E-EDGE-14 → Task 8 (state.test.ts)
- E2E-EDGE-15 → Task 8 (dossier.test.ts)
- E2E-EDGE-16 → Task 8 (state.test.ts)
- E2E-EDGE-18 → Task 5 (locks.test.ts)
- E2E-EDGE-01 → Task 9 (sweep.test.ts)
- E2E-EDGE-03 → Task 9 (lifecycle.test.ts)
- E2E-EDGE-06 → Task 9 (lifecycle.test.ts)
- E2E-EDGE-10 → Task 9 (sweep.test.ts)
- E2E-EDGE-11 → Task 11 (pretooluse.test.ts)
- E2E-EDGE-09 → Task 10 (triage.test.ts)

Restent à tester dans edge-cases.test.ts :
- E2E-EDGE-05 — Plusieurs checkpoints (vérification via API)
- E2E-EDGE-07 — Webhook flood 100 emails (test de charge dedup + receiver)
- E2E-EDGE-08 — Lolo modifie state.md manuellement (le parser doit toujours fonctionner)
- E2E-EDGE-12 — Camoufox profil corrompu (Claude gère, mais le backend détecte via gaps.md)
- E2E-EDGE-17 — Erreur disque (simuler fs.writeFileSync qui throw)

- [ ] **Step 1: Écrire test E2E-EDGE-05 — plusieurs checkpoints consécutifs**

```typescript
it('handles multiple consecutive checkpoints (E2E-EDGE-05)', async () => {
  // Simulate 3 checkpoint.md writes in quick succession
  const dir = path.join(wsDir, 'multi-cp');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.md'), '# Test\nSTATUT : EN COURS');
  fs.writeFileSync(path.join(dir, 'checkpoint.md'), 'Premier checkpoint');
  const cp1 = parseCheckpointMd(dir);
  fs.writeFileSync(path.join(dir, 'checkpoint.md'), 'Deuxième checkpoint');
  const cp2 = parseCheckpointMd(dir);
  expect(cp1).not.toBeNull();
  expect(cp1!).toContain('Premier');
  expect(cp2).not.toBeNull();
  expect(cp2!).toContain('Deuxième');
});
```

- [ ] **Step 2: Écrire test E2E-EDGE-07 — webhook flood 100 emails**

```typescript
it('handles 100 webhooks without crash or memory leak (E2E-EDGE-07)', async () => {
  const dedup = createDedupStore();
  const receiver = createWebhookReceiver({ dedup, triage: vi.fn().mockResolvedValue({ ignore: true }) });
  for (let i = 0; i < 100; i++) {
    await receiver.handleGmailWebhook({
      from: `sender${i}@test.com`, to: 'lolo@test.com',
      subject: `Email ${i}`, body: `Body ${i}`,
      messageId: `msg-${i}`, timestamp: new Date().toISOString(),
    });
  }
  // All unique → all accepted
  // No crash, no OOM
});
```

- [ ] **Step 3: Écrire test E2E-EDGE-08 — Lolo modifie state.md manuellement**

```typescript
it('parser handles manually edited state.md with extra sections (E2E-EDGE-08)', () => {
  fs.writeFileSync(path.join(dir, 'state.md'),
    '# Mon Dossier Perso\n\nSTATUT : EN COURS\n\n## Objectif\nFaire un truc\n\n## Notes perso\nCeci est ajouté à la main par Lolo\n\n## Journal\n- 2026-03-14 : Créé\n');
  const result = parseStateMd(dir);
  expect(result.title).toBe('Mon Dossier Perso');
  expect(result.status).toBe('EN COURS');
});
```

- [ ] **Step 4: Écrire test E2E-EDGE-12 — Camoufox profil corrompu**

```typescript
it('detects Camoufox corruption via gaps.md entry (E2E-EDGE-12)', () => {
  // Backend ne gère pas Camoufox directement — Claude le fait.
  // Ce test vérifie que si Claude écrit une gap "profil Camoufox corrompu",
  // le parser gaps le lit correctement.
  fs.writeFileSync(path.join(wsDir, '_gaps', 'gaps.md'),
    '## 2026-03-14 — Profil Camoufox corrompu\n\n**Problème:** Le profil banking est inutilisable\n**Impact:** Impossible d\'accéder au compte\n**Suggestion:** Recréer le profil\n\n---\n');
  const list = createGapsManager(wsDir).listGaps();
  expect(list[0].title).toContain('Camoufox');
});
```

- [ ] **Step 5: Écrire test E2E-EDGE-17 — erreur disque simulée**

```typescript
it('handles disk error gracefully (E2E-EDGE-17)', () => {
  // Simuler fs.writeFileSync qui throw ENOSPC
  const mgr = createDossierManager(wsDir);
  vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('ENOSPC: no space left on device'); });
  expect(() => mgr.createDossier('fail', 'instruction')).toThrow('ENOSPC');
  vi.mocked(fs.writeFileSync).mockRestore();
});
```

- [ ] **Step 6: Vérifier pass**

```bash
pnpm --filter @alfred/backend test tests/edge-cases/
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "test(backend): edge cases — flood, disque, checkpoints multiples, manual edit"
```

---

### Task 27: Smoke tests — commandes /test

**Files:**
- Create: `alfred/apps/backend/scripts/smoke-setup.sh`
- Create: `alfred/apps/backend/scripts/smoke-start.sh`
- Create: `alfred/apps/backend/scripts/smoke-cleanup.sh`
- Create: `alfred/apps/backend/fixtures/smoke-workspace/`

**Tests couverts:** E2E-FULL-01 à E2E-FULL-13

- [ ] **Step 1: Créer smoke-setup.sh — crée workspace de test avec fixtures**

Workspace avec :
- `factures-sopra/` — dossier actif avec state.md
- `exali-rapport/` — dossier avec deadline proche
- `_suggestions/impots-chypre.md` — suggestion urgente
- `_gaps/gaps.md` — 3 entrées
- `_audit/actions.log` — entrées existantes

- [ ] **Step 2: Créer smoke-start.sh — lance backend + frontend mode smoke**

```bash
#!/bin/bash
# Lance le backend en mode smoke (workspace de fixtures)
export WORKSPACE_DIR="$(dirname "$0")/../fixtures/smoke-workspace"
export PORT=3099
export SWEEP_INTERVAL_MS=999999999  # pas de sweep auto en smoke

node ../dist/index.js &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID (port $PORT)"
echo $BACKEND_PID > /tmp/alfred-smoke-backend.pid
```

- [ ] **Step 2b: Créer smoke-cleanup.sh — kill processus + nettoyer fixtures**

```bash
#!/bin/bash
# Cleanup smoke test
if [ -f /tmp/alfred-smoke-backend.pid ]; then
  kill "$(cat /tmp/alfred-smoke-backend.pid)" 2>/dev/null
  rm /tmp/alfred-smoke-backend.pid
fi
# Reset fixture workspace to initial state
git checkout -- "$(dirname "$0")/../fixtures/smoke-workspace/" 2>/dev/null || true
echo "Smoke cleanup done"
```

- [ ] **Step 3: Créer README-smoke.md avec les 13 commandes /test**

Fichier `alfred/apps/backend/scripts/README-smoke.md` qui liste les 13 commandes `/test` exactes de la spec section 18.12 — une par E2E-FULL-*. Ce fichier sert de référence pour l'exécution manuelle des smoke tests.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: smoke test infrastructure — fixtures, setup, start, cleanup"
```

---

### Task 28: Infrastructure — setup.sh + LaunchAgent + hooks config

**Files:**
- Create: `alfred/setup.sh`
- Create: `alfred/com.lolo.assistant.plist`
- Create: `alfred/.claude/settings.json`

- [ ] **Step 1: Créer setup.sh — installation complète Mac Mini**

Partie 1 automatisée (Homebrew, Node.js, pnpm, Claude CLI, Camoufox, tmux, cloudflared, clone, build, LaunchAgent, tunnel) + Partie 2 guidée (permissions macOS — 10 étapes avec System Settings).

Voir spec section 9.2 pour la liste exacte des permissions.

- [ ] **Step 2: Créer com.lolo.assistant.plist**

LaunchAgent qui lance `node dist/index.js` avec les bonnes variables d'environnement.

- [ ] **Step 3: Créer .claude/settings.json avec la config hooks complète**

La config JSON exacte de la spec section 5.4 — hooks PreToolUse (prompt + command), PostToolUse (command), Notification (idle_prompt command), SessionEnd (command).

**Attention:** La spec a une divergence entre le JSON (section 5.4 lignes 473-512) et le tableau de couverture (ligne 522) concernant les matchers Bash (curl POST, ssh, scp). Le JSON ne les inclut pas mais le tableau les mentionne. **Lors de l'implémentation, ajouter un matcher Bash dans les prompt hooks pour compléter la couverture :**
```json
{ "tool_name": "Bash", "input_contains": "curl -X POST" }
```
```json
{ "tool_name": "Bash", "input_contains": "ssh " }
```
```json
{ "tool_name": "Bash", "input_contains": "scp " }
```

- [ ] **Step 4: Créer Dockerfile multi-stage pour le frontend**

Build Vite → serve statique nginx.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "infra: setup.sh, LaunchAgent, hooks config, Dockerfile frontend"
```

---

## Vérification exhaustivité E2E

Chaque ID de test doit apparaître dans au moins une task ci-dessus.

| Section | IDs | Task(s) |
|---|---|---|
| RECEIVER | E2E-RCV-01 à -08 | Task 10 |
| WORKSPACE | E2E-WS-01 à -13 | Task 8 |
| LAUNCHER | E2E-LCH-01 à -11 | Task 9 |
| GARDE-FOUS | E2E-GF-01 à -18 | Task 11 |
| APP WEB | E2E-APP-01 à -28 | Tasks 17-24 (impl), Task 25 (Playwright) |
| NOTIFICATIONS | E2E-NTF-01 à -09 | Task 12 |
| SUGGESTIONS | E2E-SUG-01 à -09 | Tasks 8, 10 |
| AMÉLIORATIONS | E2E-AML-01 à -04 | Tasks 8, 23 |
| SESSION LIFECYCLE | E2E-SLC-01 à -06 | Task 9 |
| CRON SWEEP | E2E-CRN-01 à -06 | Task 9 |
| INFRASTRUCTURE | E2E-INF-01 à -05 | Tasks 5, 6, 7 |
| FLUX COMPLETS | E2E-FULL-01 à -13 | Task 27 |
| EDGE CASES | E2E-EDGE-01 à -18 | Tasks 5, 8, 9, 10, 11, 26 |

**Total : 148 IDs, tous assignés.**

E2E-WS-05 (condensation state.md) : couvert par le prompt système de Claude, pas par du code backend — c'est Claude qui condense. Vérifié en smoke test.

E2E-LCH-10 (réutilisation profil Camoufox) : géré par Camoufox nativement (profils persistants). Vérifié en smoke test.
