# Approche D : Bureau d'agents : Multi-agent avec dispatch intelligent

## Idée centrale

Combiner un dispatcher minimal intelligent avec plusieurs agents Claude Code
spécialisés, chacun avec son propre workspace et contexte focalisé.

## Architecture

```
                    ┌─────────────────────┐
   Events ────────→ │   DISPATCHER        │
   (webhooks,       │   (~200 lignes)     │
    watchers,       │                     │
    crons)          │   1. Reçoit event   │
                    │   2. Triage Claude  │
                    │      (rapide, 10s)  │
                    │   3. Route → agent  │
                    └────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │ AGENT COMPTA │ │ AGENT ADMIN  │ │ AGENT SOCIAL │
     │ workspace/   │ │ workspace/   │ │ workspace/   │
     │  compta/     │ │  admin/      │ │  social/     │
     └──────────────┘ └──────────────┘ └──────────────┘

     Chaque agent = 1 session Claude Code
     avec son propre prompt système + workspace
```

## Le dispatcher (seul code backend)

Vraiment minimal :
1. Recevoir un event (webhook, watcher, cron)
2. Triage Claude rapide (10s) : "Quel agent ? Urgent ?"
3. Écrire l'event dans `workspace/<agent>/inbox.md`
4. Si agent pas actif → le lancer
5. Si urgent → notifier Telegram en parallèle

Le dispatcher route avec intelligence (Claude triage) au lieu de règles statiques YAML.
Il ne fait aucun traitement, il route.

## Les agents

Chaque agent = session Claude Code persistante avec :
- Prompt système spécialisé (rôle, responsabilités, outils)
- Workspace dédié (dossiers, état, inbox)
- Accès aux outils (Skills, MCP, browser)

Boucle d'un agent :
1. Lire inbox (nouveaux events)
2. Lire dossiers en cours (état workflows)
3. Décider quoi faire (prioriser lui-même)
4. Exécuter (skills, MCP, browser)
5. Mettre à jour ses dossiers
6. Besoin de l'utilisateur → message Telegram + pause
7. Plus rien à faire → se terminer

## Workspace (fichiers markdown, pas DB)

```
workspace/
├── compta/
│   ├── system-prompt.md
│   ├── inbox.md
│   ├── dossiers/
│   │   ├── factures-2025.md
│   │   ├── justificatifs-q1.md
│   │   └── demandes-comptable.md
│   └── rules.md                  # checkpoints spécifiques
├── admin/
│   ├── system-prompt.md
│   ├── inbox.md
│   ├── dossiers/
│   │   ├── exali-rapport.md
│   │   ├── expatriation-chypre.md
│   │   └── fermeture-societe-belgique.md
│   └── rules.md
├── social/
│   ├── system-prompt.md
│   ├── inbox.md
│   ├── dossiers/
│   │   └── 2ememain-ventes.md
│   └── rules.md
└── shared/                       # connaissances partagées entre agents
    ├── contacts.md
    ├── calendar.md
    └── decisions-log.md
```

## Avantages

- Parallélisme : agents travaillent en même temps sans se bloquer
- Contexte focalisé : chaque agent ne voit que son domaine
- Simplicité backend : ~200 lignes au lieu de ~3000
- Intelligence dans les agents, pas dans le code
- Scalable : nouvel agent = nouveau dossier + prompt
- Fichiers lisibles et éditables par l'humain ET par Claude

## Risques identifiés

1. **Coordination inter-agents**. Un event qui concerne 2 domaines : le dispatcher doit choisir ou dupliquer
2. **Limites Claude Max**, Plusieurs sessions parallèles = plus de consommation
3. **Conflits ressources**, 2 agents veulent Chrome → résolu par locks existants
4. **Dérive d'état**. Crash mid-update → fichier incohérent (mitigé : updates atomiques)
5. **Cold start**. Agent relit tout son workspace au lancement → consomme du contexte
