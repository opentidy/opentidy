# Hooks Claude Code — Référence technique

Détails techniques des hooks Claude Code pour le système de garde-fous.

## Ce que le hook reçoit (stdin JSON)

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/dir",
  "permission_mode": "ask",
  "hook_event_name": "PreToolUse",
  "tool_name": "mcp__gmail__send",
  "tool_use_id": "toolu_xxx",
  "tool_input": {
    "to": "billing@sopra.com",
    "subject": "Facture avril 2025",
    "body": "Veuillez trouver ci-joint..."
  }
}
```

Points importants :
- `tool_input` contient les paramètres COMPLETS de l'outil
- `transcript_path` pointe vers l'historique COMPLET de la conversation (JSONL)
- Pour les outils browser (Playwright), `tool_input` contient un champ `element`
  avec une DESCRIPTION textuelle de l'élément ("Confirm Payment button", etc.)

## Ce que le hook peut répondre

### Simple (exit codes)
- `exit 0` → ALLOW (stdout affiché dans le transcript)
- `exit 2` → DENY (stderr envoyé à Claude comme explication)
- `exit 1` → erreur non-bloquante

### Structuré (JSON stdout)
```json
{
  "hookSpecificOutput": {
    "permissionDecision": "allow|deny|ask",
    "updatedInput": {"modified": "params"}
  },
  "systemMessage": "Message injecté dans le contexte de Claude",
  "additionalContext": "Contexte supplémentaire"
}
```

- `allow` → continue
- `deny` → bloque, Claude reçoit le systemMessage
- `ask` → demande confirmation à l'utilisateur (Lolo)
- `updatedInput` → peut MODIFIER les paramètres de l'outil avant exécution

## Types de hooks

### type: "command" (script shell)
```json
{
  "type": "command",
  "command": "python3 /path/to/validator.py",
  "timeout": 60
}
```
Le script reçoit le JSON sur stdin, retourne sa décision.
Peut lancer n'importe quel processus (curl, claude -p, psql, etc.).

### type: "prompt" (évaluation LLM) ← LA CLÉ
```json
{
  "type": "prompt",
  "prompt": "Vérifie cette action. Est-elle safe ?",
  "timeout": 30
}
```
Claude évalue l'action avec le prompt fourni, SÉPARÉMENT de la session principale.
Pas de subprocess à spawner. Natif. C'est le mini-Claude vérificateur intégré.

## Configuration

Dans `~/.claude/settings.json` ou `.claude/settings.json` :

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__gmail__send|mcp__gmail__reply",
        "hooks": [{
          "type": "prompt",
          "prompt": "Vérifie cet envoi d'email...",
          "timeout": 30
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__gmail__send|mcp__plugin_playwright_.*",
        "hooks": [{
          "type": "command",
          "command": "node /path/to/audit-logger.js",
          "timeout": 5
        }]
      }
    ]
  }
}
```

## Matchers (sélection des outils)

Supportent les regex, case-sensitive :
```
"Bash"                                    → uniquement Bash
"Write|Edit|MultiEdit"                    → écriture de fichiers
"mcp__gmail__send|mcp__gmail__reply"      → envois Gmail uniquement
"mcp__plugin_playwright_.*__browser_(click|fill_form)" → clics et formulaires
"mcp__.*"                                 → tous les outils MCP
"*"                                       → tout
```

## Outils Playwright disponibles et leurs paramètres

| Outil | Paramètres clés | Risque |
|---|---|---|
| `browser_navigate` | `url` | Faible (navigation) |
| `browser_click` | `ref`, `element` (description) | Variable (dépend de l'élément) |
| `browser_type` | `ref`, `text`, `submit` | Moyen (saisie) |
| `browser_fill_form` | `fields[]` (ref, name, type, value) | Moyen-élevé (formulaire) |
| `browser_evaluate` | `function` (JS code) | Élevé (exécution JS) |
| `browser_run_code` | `code` (Playwright script) | Élevé (script) |
| `browser_snapshot` | `filename` | Nul (lecture) |
| `browser_hover` | `ref`, `element` | Nul (survol) |
| `browser_press_key` | `key` | Faible |
| `browser_close` | - | Nul |

Le champ `element` dans `browser_click` contient une description textuelle
de l'élément cliqué → "Confirm Payment button", "Search button", "Submit form", etc.
C'est ce qui permet au hook de distinguer les clics dangereux des clics safe.

## Contraintes

- **Timeout** : 60s par défaut, max 600s (10 minutes)
- **Hooks chargés au démarrage** : changements nécessitent restart Claude Code
- **Hooks parallèles** : plusieurs hooks sur le même matcher s'exécutent en parallèle
- **Pas de récursion** : attention si un hook lance `claude -p`, ce child
  déclencherait ses propres hooks
