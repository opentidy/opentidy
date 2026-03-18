# V2 — Spec technique d'implémentation

Document vivant. Contient toutes les décisions techniques validées, les contraintes,
et les questions ouvertes pour l'implémentation de la V2.

Référence architecture : [v2-final.md](v2-final.md)
Tests E2E : [e2e-tests.md](e2e-tests.md) (148 tests)

---

## 1. Décisions structurantes

### Nouveau repo
V2 = nouveau repo séparé (`assistant-v2` ou nom à définir). Pas dans le repo AI-assistant.
Le repo V1 reste intact comme référence.

### Monorepo pnpm workspaces
```
alfred/
├── pnpm-workspace.yaml
├── packages/
│   └── shared/              # types TypeScript, Zod schemas
├── apps/
│   ├── backend/             # Hono API, daemon, launcher, receiver
│   └── web/                 # React SPA, Vite
```

Pas de Turborepo pour l'instant — pnpm workspaces suffit pour 2 apps + 1 package.
Si ça grandit, Turborepo se branche par-dessus sans rien changer.

### Stratégie de plan piloté par les tests
Le plan d'implémentation sera piloté par les 148 tests E2E. Chaque étape du plan
liste les IDs de tests qu'elle doit faire passer. Si un ID n'apparaît dans aucune
étape, c'est un trou. Objectif : traçabilité parfaite spec → plan → code → tests.

---

## 2. Infrastructure

### Mac Mini dédié
- Machine dédiée à l'assistant, tourne 24/7
- macOS natif (pas de container) — nécessaire pour AppleScript, Contacts,
  Messages, osascript, accès système complet
- Le Mac Mini est l'environnement isolé de l'assistant, pas de conflit avec Lolo

### Déploiement backend — LaunchAgent macOS
- `com.opentidy.agent.plist` dans `~/Library/LaunchAgents/`
- Daemon Node.js qui tourne en permanence
- Logs dans `~/Library/Logs/` (rotation 5MB)
- Première install via `setup.sh` (voir section ci-dessous)
- Mises à jour : `git pull && pnpm build && launchctl kickstart`

### setup.sh — installation complète Mac Mini

Script d'installation unique qui configure tout le Mac Mini. Deux parties :

**Partie 1 — Installation des dépendances** (automatisé) :
- Homebrew (si absent)
- Node.js, pnpm
- Claude CLI + OAuth login
- Camoufox
- tmux
- Tunnel Cloudflare (`cloudflared`)
- Clone du repo, `pnpm install && pnpm build`
- Installation du LaunchAgent
- Configuration du tunnel Cloudflare

**Partie 2 — Permissions macOS** (guidé, clics manuels nécessaires) :

Le script ouvre chaque panneau System Settings et attend confirmation.
Apple impose l'approbation manuelle pour les permissions TCC — aucun moyen
de les accorder programmatiquement sans MDM (et les profils PPPC MDM ne
peuvent pas pré-autoriser Screen Recording, Camera, Microphone de toute façon).

L'astuce : accorder les permissions à **Terminal.app**. Tous les processus
enfants (LaunchAgent, tmux, claude, scripts) héritent automatiquement.

| Permission | Panneau System Settings | Accorder à |
|---|---|---|
| Full Disk Access | Privacy & Security → Full Disk Access | Terminal.app |
| Accessibility | Privacy & Security → Accessibility | Terminal.app |
| Automation (Messages) | Privacy & Security → Automation | Terminal → Messages |
| Automation (Contacts) | Privacy & Security → Automation | Terminal → Contacts |
| Automation (Calendar) | Privacy & Security → Automation | Terminal → Calendar |
| Automation (Finder) | Privacy & Security → Automation | Terminal → Finder |
| Automation (System Events) | Privacy & Security → Automation | Terminal → System Events |
| Screen Recording | Privacy & Security → Screen Recording | Terminal.app |
| Input Monitoring | Privacy & Security → Input Monitoring | Terminal.app |
| Developer Tools | Privacy & Security → Developer Tools | Terminal.app |

```bash
# Exemple de ce que fait setup.sh pour les permissions :
echo "=== Permissions macOS ==="
echo "Je vais ouvrir les panneaux System Settings un par un."
echo "Pour chacun, ajoute Terminal.app et coche la case."
echo ""

# Désactiver Gatekeeper (Mac dédié, pas besoin)
sudo spctl --master-disable

# Full Disk Access
echo "1/7 — Full Disk Access → ajoute Terminal.app"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
read -p "   Appuie sur Entrée quand c'est fait..."

# Accessibility
echo "2/7 — Accessibility → ajoute Terminal.app"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
read -p "   Appuie sur Entrée quand c'est fait..."

# Automation
echo "3/7 — Automation → Terminal → coche Messages, Contacts, Calendar, Finder, System Events"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
read -p "   Appuie sur Entrée quand c'est fait..."

# Screen Recording
echo "4/7 — Screen Recording → ajoute Terminal.app"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
read -p "   Appuie sur Entrée quand c'est fait..."

# Input Monitoring
echo "5/7 — Input Monitoring → ajoute Terminal.app"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
read -p "   Appuie sur Entrée quand c'est fait..."

# Developer Tools
echo "6/7 — Developer Tools → ajoute Terminal.app"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_DevTools"
read -p "   Appuie sur Entrée quand c'est fait..."

# Vérification
echo "7/7 — Vérification..."
# Test rapide : accès Contacts via osascript
osascript -e 'tell application "Contacts" to get name of first person' && echo "✓ Contacts OK" || echo "✗ Contacts FAILED"
# Test rapide : accès fichiers
ls ~/Desktop > /dev/null 2>&1 && echo "✓ Full Disk Access OK" || echo "✗ FDA FAILED"

echo "=== Setup terminé ==="
```

**Approche écartée : profils PPPC (.mobileconfig)**
Les profils PPPC nécessitent un MDM (Mobile Device Management) pour être installés.
Impossible d'installer un `.mobileconfig` sur un Mac perso sans MDM — Apple bloque
avec "Profile must originate from a user-approved MDM server". De plus, Screen Recording
et Camera/Microphone ne peuvent JAMAIS être pré-autorisés même avec MDM (deny-only).
Pour un seul Mac Mini dédié, un MDM serait overkill.

### Déploiement frontend — Coolify
- App web (React SPA) hébergée sur Coolify
- Dockerfile multi-stage : build Vite → serve statique (nginx/Caddy)
- Deploy automatique depuis le repo git

### Réseau
- Mac Mini exposé via **tunnel Cloudflare** (pas de port ouvert)
- L'app web sur Coolify communique avec le backend à travers le tunnel
- En dev : tout sur `localhost`, pas de tunnel

### Sessions Claude
- **Tmux** pour toutes les sessions (validé dans la spec)
- **`--dangerously-skip-permissions`** sur toutes les sessions — désactive les
  prompts de permission Claude Code. La sécurité est assurée par les hooks
  PreToolUse (garde-fous), pas par le système de permissions intégré.
  Les hooks firent AVANT le check de permissions, donc restent actifs.
- Lock PID par dossier dans `/tmp/opentidy-locks/`
- Crash recovery : détection PID mort → nettoyage lock
- Session ID persisté dans `workspace/<dossier>/.session-id` pour resume

### Browser
- **Camoufox** (pas Chrome/Playwright) — anti-détection, profils isolés
- Chaque session a son propre profil → parallélisme total
- Lolo garde Chrome pour lui

### Cron sweep — `claude -p` périodique (APPROCHE VALIDÉE)

**Décision** : `setInterval` dans le backend + `claude -p` pour le scan.

```
setInterval(sweep, SWEEP_INTERVAL_MS)  // défaut: 1h, configurable env var

sweep():
  claude -p "Lis workspace/*/state.md. Pour chaque dossier actif, dis-moi
  si une action est nécessaire (deadline, relance, travail à avancer).
  Crée des suggestions dans _suggestions/ si besoin.
  Réponds avec la liste des dossiers à lancer."
  → backend parse la réponse → lance les sessions tmux focalisées
```

**C'est le seul usage de `claude -p` dans tout le système.** Justifié parce que le sweep
est read-only (pas d'interaction, pas de browser, juste lire des fichiers et réfléchir).
Tout le reste utilise tmux (interactif, browser, MFA).

`setInterval` suffit pour un seul timer. Pas besoin de `node-cron` (syntaxe cron pour
un seul job, c'est overkill).

#### Approches explorées et écartées

**Approche B — Session tmux pour le sweep** :
Le sweep lance une session tmux classique. Claude scanne, écrit les résultats dans
`workspace/_sweep/results.json`. SessionEnd hook fire → backend lit le fichier → lance
les sessions.
- Pro : cohérent avec le reste (tout en tmux)
- Con : plus indirect, fichier intermédiaire, le sweep prend la place d'une session
  parallèle pour un job qui n'a pas besoin d'interactivité
- **Écarté** : ajoute de la complexité pour rien, `claude -p` est plus direct

**Approche C — Backend pur avec métadonnées structurées** :
Standardiser le haut de state.md avec des champs parsables (PROCHAINE_ACTION,
DEADLINE, DERNIÈRE_ACTION). Le backend parse les dates et décide quels dossiers
lancer. Claude n'est pas utilisé pour le sweep.
- Pro : zéro session Claude consommée (~24/jour économisées)
- Con : fragile — Claude n'écrit pas toujours les métadonnées correctement, parser
  du markdown semi-structuré est hacky, on contraint le format libre de state.md,
  et on économise des sessions Claude Max qui sont de toute façon illimitées
  (principe #3 : le budget n'est pas une contrainte)
- **Écarté** : fragilité injustifiée pour une optimisation inutile. L'intelligence
  reste dans Claude (principe #4), state.md reste un scratchpad libre.

**Approche hybride (2 jobs séparés)** :
Job 1 = backend pur (dates structurées) pour les dossiers. Job 2 = `claude -p` toutes
les 4-6h pour scanner l'inbox.
- **Écarté** : même problèmes que l'approche C pour le job 1, et la séparation
  en 2 jobs ajoute de la complexité sans gain réel.

---

## 3. Stack backend

### Validé
- **Runtime** : Node.js
- **Langage** : TypeScript
- **Framework web** : Hono
  - SSE intégré (`streamSSE`)
  - Minimal, ~7KB
  - Excellent TypeScript
  - Fonctionne sur Node.js

- **Telegram bot** : grammY (V1, mature, gère retry/rate limiting, extensible si besoin)
- **Validation** : Zod (partagé avec le frontend via `packages/shared/`)
- **Cron sweep** : `setInterval` + `claude -p` (voir section Infra pour le détail)

### Détection d'état — hooks centralisés (pas de file watching)

Pas de file watching (ni chokidar, ni fs.watch, ni polling). La détection de l'état
des sessions Claude est faite par les **hooks Claude Code** qui notifient le backend
via un endpoint centralisé.

**Principe** : les hooks système firent automatiquement, que Claude le veuille ou non.
Le backend est notifié de tout ce qui se passe sans dépendre d'une instruction à Claude.

**Endpoint centralisé** : `POST /api/hooks`

Tous les hooks `type: "command"` appellent le même endpoint. Le backend route en interne :

| Hook | Quand | Action backend |
|---|---|---|
| `idle_prompt` | Claude attend un input | `tmux capture-pane` → notification Telegram + push SSE |
| `SessionEnd` | Session terminée | Cleanup lock, check state.md, notification + SSE |
| `Stop` | Claude arrête de générer | Check état, push SSE |
| `PostToolUse` | Action exécutée | Audit log dans `_audit/actions.log` |

**Config hooks Claude Code** :
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__gmail__send|mcp__gmail__reply|mcp__gmail__draft",
        "hooks": [
          { "type": "prompt", "prompt": "Vérifie cet envoi d'email...", "timeout": 30 },
          { "type": "command", "command": "curl -s -X POST http://localhost:3001/api/hooks -d @-" }
        ]
      },
      {
        "matcher": "mcp__camofox__click|mcp__camofox__fill_form|mcp__camofox__camofox_evaluate_js",
        "hooks": [
          { "type": "prompt", "prompt": "Vérifie ce clic/formulaire...", "timeout": 10 },
          { "type": "command", "command": "curl -s -X POST http://localhost:3001/api/hooks -d @-" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__gmail__|mcp__camofox__",
        "hooks": [
          { "type": "command", "command": "curl -s -X POST http://localhost:3001/api/hooks -d @-" }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "idle_prompt",
        "hooks": [
          { "type": "command", "command": "curl -s -X POST http://localhost:3001/api/hooks -d @-" }
        ]
      }
    ],
    "SessionEnd": [
      { "type": "command", "command": "curl -s -X POST http://localhost:3001/api/hooks -d @-" }
    ]
  }
}
```

**2 types de hooks, 2 rôles distincts** :
- `type: "prompt"` → **Garde-fous** (mini-Claude évalue ALLOW/DENY). Bloquant.
- `type: "command"` → **Détection + audit** (notifie le backend). Non-bloquant.

Les deux cohabitent sur le même matcher (exécution parallèle). Pour un `gmail.send` :
1. Le prompt mini-Claude évalue → ALLOW/DENY (sécurité)
2. Le curl notifie le backend → audit log (traçabilité)

**Checkpoint.md** : optionnel. Si Claude l'écrit → l'app affiche un résumé structuré.
Si Claude ne l'écrit pas → fallback sur `tmux capture-pane` (dernières lignes du terminal).
La détection ne dépend JAMAIS d'une instruction à Claude.

### Ce que le backend fait (~200-400 lignes)
1. **Receiver** — reçoit webhooks Gmail, watchers SMS/WhatsApp, instructions app web
2. **Launcher** — lance/résume sessions Claude dans tmux, gère locks
3. **Hook handler** — endpoint centralisé `/api/hooks`, route les events hooks
4. **State manager** — lit les fichiers workspace/ (state.md, suggestions, gaps)
5. **API** — routes pour l'app web (dossiers, suggestions, sessions, fichiers)
6. **SSE** — events temps réel vers l'app web (alimenté par le hook handler)
7. **Notifications** — push Telegram via grammY (liens vers app web)
8. **Infrastructure** — dedup events, locks, retry/backoff, crash recovery, audit trail

### Ce que le backend ne fait PAS
- Pas de triage IA (Claude le fait)
- Pas de queue avec priorités
- Pas de logique métier
- Pas de conversation manager
- Pas de knowledge base

---

## 4. Stack frontend

### Validé
- **Framework** : React 19
- **Build** : Vite
- **Router** : React Router
- **SSE** : EventSource natif du browser
- **Terminal** : xterm.js (pour afficher/interagir avec les sessions tmux)

- **Styling** : Tailwind CSS
- **State management** : Zustand (~1KB, structure les données live sans boilerplate)

### Les 6 routes
```
/                    → Home (actions ou zen)
/dossiers            → Liste des dossiers
/dossier/:id         → Détail d'un dossier
/terminal            → Sessions tmux (onglets)
/nouveau             → Créer un dossier
/ameliorations       → Gaps détectés par Claude
```

### PWA
- Responsive : desktop (icon rail gauche) + mobile (tab bar bas)
- Installable en PWA (manifest, service worker basique)

---

## 5. Stack testing

- **Unit/integration** : Vitest
- **E2E browser** : Playwright
- **E2E système (smoke)** : `/test` skill (Claude + Playwright, fin d'implémentation)

### Stratégie
- Les 148 tests E2E du document `e2e-tests.md` sont la référence
- Chaque step du plan d'implémentation = liste d'IDs E2E à faire passer
- Tests unitaires pour les modules backend (receiver, launcher, state manager)
- Tests Playwright pour l'app web
- Tests d'intégration pour les flux cross-composants

---

## 6. Stack dev/tooling

- **Package manager** : pnpm (enforced via `"preinstall": "npx only-allow pnpm"` + `"packageManager": "pnpm@10.x"` dans package.json racine — `npm install` échoue avec un message d'erreur)
- **Linting/Formatting** : ESLint + Prettier
- **TypeScript** : strict mode

---

## 7. Packages partagés (`packages/shared/`)

Types et schemas partagés entre backend et frontend :
- Types des dossiers (statut, metadata)
- Types des suggestions (urgence, source)
- Types des events SSE
- Zod schemas pour la validation API
- Types des checkpoints

---

## 8. Questions ouvertes

### Nom du projet
**Alfred**. Repo : `alfred`. Structure monorepo inchangée :
```
alfred/
├── pnpm-workspace.yaml
├── packages/
│   └── shared/
├── apps/
│   ├── backend/
│   └── web/
```

---

## 9. Contraintes et inquiétudes

### Plan d'implémentation incomplet
**Inquiétude** : les plans d'implémentation passés ont manqué des features.
**Solution** : plan piloté par les 148 tests E2E. Chaque step = IDs de tests.
Vérification : tout ID doit apparaître dans au moins un step.

### Claude Max rate limits
**Inquiétude** : on ne sait pas combien de sessions parallèles Claude Max supporte.
**Solution** : à tester empiriquement. Le backend doit gérer le backoff gracieusement.

### Complexité tmux + xterm.js
**Inquiétude** : faire marcher un vrai terminal dans le browser via tmux est non-trivial.
**Solution** : c'est un composant isolé. On peut le développer et tester indépendamment.
Besoin d'un process côté backend qui bridge tmux ↔ WebSocket ↔ xterm.js.

### Sécurité tunnel Cloudflare
**Inquiétude** : le backend est exposé via le tunnel. Qui peut y accéder ?
**Solution** : auth sur l'API (au minimum un token, ou Cloudflare Access).
À définir avant le déploiement.

### Migration V1 → V2
**Inquiétude** : transition entre les deux versions.
**Solution** : V2 est indépendant. On peut faire tourner V1 et V2 en parallèle le
temps de valider. Les skills et MCP servers sont réutilisés tels quels.
