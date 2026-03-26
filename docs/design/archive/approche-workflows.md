# Approche 1 : Moteur de Workflows

## Idée centrale

L'assistant n'exécute pas des "tâches", il exécute des **workflows** : des suites
d'étapes autonomes avec des checkpoints humains aux moments critiques.

## Principe

```
step(auto) → step(auto) → CHECKPOINT(humain) → step(auto) → done
```

Chaque étape = un appel Claude Code (skill, MCP, browser, etc.)
Entre les étapes = état persisté + décision de continuer ou s'arrêter

## Exemple : Factures mensuelles

```
1. [auto]  Lister les mois 2025/2026, vérifier quelles factures existent
2. [auto]  Pour chaque mois manquant, chercher le timesheet dans les mails
3. [auto]  Créer les factures manquantes via /comptable
4. [CHECK] Montrer les factures + mails préparés → attendre validation
5. [auto]  Envoyer les mails après OK
```

## Checkpoints intelligents

Pas de "confirm: true/false" binaire. Des règles :
- Avant d'envoyer un email/message
- Avant de soumettre un formulaire
- Quand un montant dépasse X€
- Quand c'est un nouveau destinataire
- Quand l'assistant n'est pas sûr (confidence < seuil)

Le reste se fait sans déranger.

## Architecture envisagée

```
WORKFLOW ENGINE
  ├── Définition des workflows (steps + checkpoints)
  ├── État persisté (step courante, données accumulées)
  ├── Scheduler (cron ou trigger event)
  └── Notification (Telegram/Dashboard pour checkpoints)
       ↓ utilise
  Claude Code (subprocess) : skills, MCP, browser
```

## Forces
- Réutilise tout l'existant (skills, MCP, browser)
- Ajoute juste la couche d'orchestration manquante
- Checkpoints granulaires au lieu de binaire
- État persisté = survit aux restarts

## Faiblesses
- Définir les workflows à l'avance = rigide
- Chaque step spawn un subprocess Claude = overhead
- Pas de capacité d'adaptation mid-workflow
