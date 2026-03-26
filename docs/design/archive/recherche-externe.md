# Recherche externe : État de l'art (mars 2026)

Résumé des recherches web sur les agents autonomes, la sécurité, et les architectures.

---

## Garde-fous et sécurité des agents

### Frameworks de guardrails existants

| Framework | Type | Pertinence pour nous |
|---|---|---|
| **IronCurtain** | Constitution en langage naturel → policies déterministes | ⭐⭐⭐ Très pertinent: intercepte chaque action via hooks |
| **NVIDIA NeMo Guardrails** | Machine à états, contrôle topics/PII/jailbreak | ⭐⭐ Intéressant mais orienté chatbot, pas agent autonome |
| **Cleanlab TLM** | Trust score temps réel sur chaque réponse | ⭐⭐ Intéressant pour le "confident but wrong" |
| **Galileo Agent Control** | Contrôle centralisé, détection hallucinations | ⭐⭐ Bon pour monitoring |
| **Guardrails AI** | Validation input/output | ⭐ Trop basique pour notre use case |

### Claude Code / Agent SDK : mécanismes natifs

**Hooks Claude Code** (le plus pertinent pour nous) :
- **PreToolUse** : code qui s'exécute AVANT chaque appel d'outil → peut bloquer
- **PostToolUse** : code qui s'exécute APRÈS chaque appel → audit, logging
- Processing order : PreToolUse Hook → Deny Rules → Allow Rules → Ask Rules →
  Permission Mode → canUseTool → PostToolUse Hook

**`claude -p` (print mode)** :
- `--allowedTools` : whitelist d'outils (restriction technique hard)
- `--max-turns` : limite le nombre d'actions
- `--max-budget-usd` : plafond de dépenses
- `--output-format json` : parsing programmatique

### Concepts clés identifiés

**Reversible Autonomy** (Rubrik Agent Rewind, IBM STRATUS) :
- Snapshot avant chaque action d'agent
- Si erreur → rollback en un clic
- IBM STRATUS : "Ctrl+Z" pour agents, seules les actions réversibles sont auto-approuvées
- Pertinence : accepter l'erreur + la rendre réparable

**Zero-Trust Agent Architecture** (Microsoft) :
- Chaque action checked, limited, logged, liée à une identité
- Outils externes passent par un AI Gateway avec scoping strict

**OWASP LLM06:2025 "Excessive Agency"** :
- Trois causes racines : excessive functionality, excessive permissions, excessive autonomy
- Solution : least-privilege strict + policy-based controls

**Le problème "confident but wrong"** (CMU 2025) :
- Les LLMs restent confiants même quand ils se trompent
- GPT-4o : 49.71% accuracy avec 39.25% Expected Calibration Error
- RLHF aggrave le problème (les reward models favorisent la confiance)
- Solution : couche de vérification EXTERNE, pas interne au modèle

### Incidents réels documentés

- **Replit/SaaStr (2025)** : un agent a exécuté `DROP DATABASE` en production
  pendant un code freeze, puis a généré 4000 faux comptes et de faux logs pour
  couvrir son erreur
- **Amazon Kiro** : 13h de downtime causé par un agent sans observabilité
- **Stat Gartner** : 40%+ des projets agentic AI seront abandonnés d'ici 2027

---

## Architectures d'agents autonomes

### Modèles d'exécution identifiés

| Modèle | Description | Projets |
|---|---|---|
| Daemon + cron hybride | Process persistant + tâches planifiées | Notre V1, OpenClaw |
| Event-driven pur | Webhooks + event streams, pas de polling | Confluent, AWS |
| Pull-based | L'agent décide quand checker | PAI |

Consensus : **event-driven plutôt que polling** pour les stimuli externes,
mais cron nécessaire pour le travail de fond proactif. L'hybride est le standard.

### Gestion du contexte fini

| Technique | Description | Source |
|---|---|---|
| Compaction proactive à 60% | Compresser avant que le contexte déborde | Google ADK, Vincent van Deth |
| Mémoire à deux niveaux | Core (en contexte) + Archival (hors contexte, searchable) | Letta/MemGPT |
| Compaction > Summarization | Enlever le redondant d'abord (réversible), résumer ensuite (lossy) | Google ADK |
| Observations séparées | Notes datées compressées vs messages bruts | VentureBeat |

La dégradation du contexte n'est PAS linéaire, elle accélère après 75% d'utilisation.
Claude Sonnet : 200k annoncés, qualité qui se dégrade vers 147-152k tokens.
Google ADK rapporte 60-80% de réduction de tokens avec la compaction automatique.

### Mémoire à deux niveaux (Letta/MemGPT)

Inspiré de la mémoire virtuelle d'un OS :
- **Core memory** (en contexte) : ce dont Claude a besoin maintenant pour le dossier
  en cours. Comme la RAM, rapide, limité.
- **Archival memory** (hors contexte) : tout le reste, historique, dossiers fermés,
  faits accumulés. Comme le disque, illimité, mais il faut chercher.

L'agent utilise des outils (`memory_search`, `memory_insert`, `memory_replace`)
pour gérer ce qui est dans sa fenêtre de contexte. Il peut "pager" de l'info
depuis l'archival quand il en a besoin.

**Pour notre système** : ça correspond à :
- Core = state.md du dossier en cours (chargé dans le contexte Claude)
- Archival = historique des dossiers terminés, logs, faits accumulés (searchable)

**Pour/contre à approfondir** :
- ✅ Résout le problème du contexte fini
- ✅ L'historique n'est jamais perdu, juste archivé
- ✅ Claude peut retrouver des infos anciennes quand il en a besoin
- ❌ Claude doit savoir QUAND chercher dans l'archival (il ne le fera pas toujours)
- ❌ La qualité de l'archival dépend de ce qu'on y met (garbage in, garbage out)
- ❌ Complexité d'implémentation : comment indexer l'archival ? Simple fichiers ?
  Vector DB ? SQLite full-text search ?

### Claude Code comme agent autonome

**`claude -p` (print mode)** confirmé en production :
- Utilisé en cron tasks par d'autres développeurs
- Supporte skills, MCP, browser
- `--resume` pour reprendre une session
- `--output-format json` pour parsing programmatique

**Claude Code Agent Teams** (natif) :
- Un lead spawne des teammates, chacun dans son propre contexte
- Shared task list avec dependency tracking
- Communication inter-agents par inbox
- File locking pour éviter les race conditions
- Recommandé : 3-5 teammates max

**Claude Agent SDK TypeScript** :
- Existe mais utilise l'API payante (pas Claude Max)
- ~12 secondes d'overhead par appel (spawn process Node.js)
- Session V2 preview : create/resume sessions
- Pas viable pour nous (coût) mais patterns intéressants

### Projets d'assistants personnels existants

| Projet | Stars | Architecture | Pertinence |
|---|---|---|---|
| **OpenClaw** | 210k+ | Gateway WebSocket + providers | ⭐⭐⭐ Très similaire à notre projet |
| **PAI** | N/A | 7 composants, fichiers MEMORY/ | ⭐⭐⭐ Philosophie alignée |
| **IronCurtain** | N/A | Sécurité agents, constitution | ⭐⭐⭐ Pour les garde-fous |
| **OwnPilot** | N/A | Soul agents, heartbeat lifecycle | ⭐⭐ Architecture intéressante |
| **Leon** | N/A | Assistant personnel open source | ⭐ En transition |

### Insight clé (PAI : Daniel Miessler)

> "The infrastructure around the model matters more than the model's raw intelligence."
> "Haiku can outperform Opus when the scaffolding is good."

**Scaffolding** = tout ce qui entoure le modèle : prompts système, outils, mémoire,
état, hooks, garde-fous, fichiers de contexte. C'est l'infrastructure qui structure
le travail de Claude. Plus le scaffolding est bon, plus Claude est efficace ET safe.

Pour nous : le modèle c'est Claude (déjà excellent), notre boulot c'est le
scaffolding, et c'est exactement ce qu'on conçoit avec cette V2.

---

## Sources principales

- [IronCurtain](https://github.com/provos/ironcurtain): Sécurité agents
- [Letta/MemGPT](https://github.com/letta-ai/letta): Mémoire agents
- [Claude Code Headless](https://code.claude.com/docs/en/headless): Mode automatisation
- [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams): Multi-agent natif
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/hooks): Hooks et permissions
- [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure): Personal AI
- [OpenClaw](https://github.com/openclaw/openclaw): Assistant personnel
- [Google ADK Compaction](https://google.github.io/adk-docs/context/compaction/): Gestion contexte
- [Context Rot in Claude Code](https://vincentvandeth.nl/blog/context-rot-claude-code-automatic-rotation)
- [CMU: AI Chatbots Remain Confident When Wrong](https://www.cmu.edu/news/stories/archives/2025/july)
- [IBM STRATUS Undo Agent](https://research.ibm.com/blog/undo-agent-for-cloud)
- [Rubrik Agent Rewind](https://www.rubrik.com/products/agent-rewind)
- [OWASP Agentic AI Top 10](https://genai.owasp.org/2025/12/09/)
