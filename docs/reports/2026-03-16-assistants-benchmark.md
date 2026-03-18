# Benchmark des assistants personnels IA — Mars 2026

> Analyse comparative de 12 projets (open-source + commerciaux) par rapport a Alfred.
> Focus : features d'assistant admin, ameliorations de systemes existants.
> Genere le 2026-03-16.

---

## Table des matieres

1. [Projets analyses](#projets-analyses)
2. [Features qu'Alfred n'a pas](#features-qualfred-na-pas)
3. [Ameliorations de nos systemes actuels](#ameliorations-de-nos-systemes-actuels)
4. [Ce qu'Alfred fait mieux que tous](#ce-qualfred-fait-mieux-que-tous)
5. [Recommandations prioritaires](#recommandations-prioritaires)

---

## Projets analyses

| # | Projet | Type | Focus |
|---|--------|------|-------|
| 1 | **Inbox Zero** | Open-source (10.2k stars) | Email AI management |
| 2 | **Mail-0/Zero** | Open-source (10.5k stars) | Email client AI-native |
| 3 | **Sentient** | Open-source (~2k stars) | Assistant GSuite + knowledge graph |
| 4 | **PAI** (danielmiessler) | Open-source (10k stars) | Infra Claude Code + self-learning |
| 5 | **CoPaw** | Open-source (8.7k stars) | Agent personnel multi-canal |
| 6 | **Leon** | Open-source (16.8k stars) | Assistant voice/texte + pulse proactif |
| 7 | **TaxHacker** | Open-source (~250 stars) | Traitement factures/recus IA |
| 8 | **Skyvern** | Open-source (20.7k stars) | Automatisation formulaires web |
| 9 | **PyGPT** | Open-source (1.6k stars) | Desktop AI assistant multi-mode |
| 10 | **Lindy.ai** | Commercial ($49/mo) | Executive assistant no-code |
| 11 | **Perplexity Assistant** | Commercial ($200/mo) | Email agent + Tasks |
| 12 | **Google Gemini/Mariner** | Commercial (Google) | Email/Calendar AI + browser agent |

---

## Features qu'Alfred n'a pas

### Tier 1 — Features directement utiles, absentes d'Alfred

#### 1. Email triage multi-couches (Inbox Zero)
**Le probleme** : Alfred traite chaque email entrant avec un appel LLM complet (one-shot Claude). C'est lent et couteux pour les emails recurrents.

**Ce que font les autres** : Inbox Zero a 3 couches de matching :
- **Couche 1 — Learned patterns** : si `invoice@stripe.com` a ete classe 5 fois dans "Factures", les prochains le sont directement en DB, sans LLM
- **Couche 2 — Regex/conditions statiques** : matching sur from/to/subject/body avec wildcards
- **Couche 3 — AI** : seulement si les 2 premieres echouent

**Impact pour Alfred** : reduire les appels LLM de ~80% sur les emails recurrents. Stocker les patterns sender→dossier dans un fichier JSON ou SQLite.

#### 2. Thread continuity (Inbox Zero)
**Le probleme** : quand un email arrive dans un thread deja associe a un dossier, Alfred relance le triage complet.

**Ce que font les autres** : Inbox Zero route automatiquement les reponses dans un thread vers la meme regle, sans re-triage.

**Impact pour Alfred** : si un email est une reponse dans un thread deja route vers un dossier, bypasser le triage et relancer directement la session du dossier.

#### 3. Writing style matrix (Mail-0)
**Le probleme** : les emails rediges par Alfred ne sonnent pas comme l'utilisateur.

**Ce que font les autres** : Mail-0 analyse les emails envoyes avec 52+ metriques (longueur de phrases, densite lexicale, taux de contractions, formalite, emojis, sentiment). Algorithme de Welford pour la variance en ligne. Injecte le profil dans le prompt de draft.

**Impact pour Alfred** : analyser une fois les emails envoyes par l'utilisateur, stocker le profil de style dans la memoire, l'injecter dans le CLAUDE.md des sessions qui redigent des emails.

#### 4. Auto-draft pour emails simples (Mail-0)
**Le probleme** : Alfred lance une session tmux complete pour chaque email, meme un simple accuse de reception.

**Ce que font les autres** : Mail-0 detecte l'intent (question/request/meeting/urgent via regex), genere un brouillon Gmail automatiquement, et notifie l'utilisateur de le valider. Pas de session longue pour un email trivial.

**Impact pour Alfred** : ajouter un fast-path dans le triage : si l'email est simple (accusé de reception, confirmation, remerciement), generer un draft Gmail directement sans lancer de session, puis notifier l'utilisateur.

#### 5. Follow-up tracking (Lindy, Perplexity)
**Le probleme** : Alfred ne sait pas si un email envoye a recu une reponse.

**Ce que font les autres** : Lindy track les threads sans reponse et envoie des relances automatiques sur un schedule. Perplexity detecte les emails envoyes sans reponse apres N jours ouvrables.

**Impact pour Alfred** : un sweep qui scanne les threads envoyes sans reponse et cree des suggestions de relance dans `_suggestions/`.

#### 6. Suggested To-Dos / extraction d'actions (Google Gemini)
**Le probleme** : Alfred traite les emails comme des evenements a router, pas comme des sources d'actions.

**Ce que font les autres** : Gmail AI Inbox extrait proactivement les "to-dos" des emails : "facture a payer avant le 15", "confirmer le RDV", "envoyer le document signe". Les surface avant meme que l'utilisateur ouvre l'email.

**Impact pour Alfred** : au triage, extraire les actions concretes + deadlines de l'email et les stocker dans le `state.md` du dossier. Permet au sweep/checkup de verifier les echeances.

#### 7. Triggered workflows configurables (Sentient)
**Le probleme** : le triage d'Alfred est une boite noire — Claude decide a chaque fois.

**Ce que font les autres** : Sentient permet de configurer des regles persistantes : "a chaque email de mon comptable → creer un dossier type 'Comptabilite'". Les regles sont evaluees avant le triage AI.

**Impact pour Alfred** : un fichier `workspace/rules.json` avec des regles declaratives (sender → dossier type, sujet contient X → action Y) evaluees avant le triage Claude.

#### 8. Approval interactif via messaging (CoPaw, Skyvern)
**Le probleme** : les hooks PreToolUse d'Alfred sont binaires — DENY ou ALLOW. Pas de "pause et demande".

**Ce que font les autres** :
- CoPaw suspend l'execution, envoie la question dans le canal (Telegram/iMessage), attend `/approve`
- Skyvern a un `HumanInteractionBlock` avec email + timeout + resume
- Paperclip (rapport precedent) a des approval records en DB

**Impact pour Alfred** : quand un hook detecte une action sensible mais pas interdite, envoyer un inline keyboard Telegram (Approuver / Rejeter) et suspendre la session. Timeout → DENY automatique.

#### 9. Memoire de formulaires cross-sessions (Skyvern)
**Le probleme** : chaque session Alfred qui remplit un formulaire web repart de zero.

**Ce que font les autres** : Skyvern maintient un FIELD_MAP persistant qui memorise la correspondance label→parametre pour chaque site. Auto-correction si le site change.

**Impact pour Alfred** : pour les sites visites regulierement (URSSAF, impots, CPAM), stocker un mapping de formulaire dans `workspace/_memory/form-maps/`. Le charger dans le CLAUDE.md quand le dossier implique ce site.

#### 10. Voice interface (Leon, Sentient)
**Le probleme** : Alfred n'a aucune interface vocale.

**Ce que font les autres** :
- Leon : wake word detection ONNX + STT (Whisper local) + TTS (Flite/ElevenLabs)
- Sentient : STT (Deepgram/Whisper) + TTS (ElevenLabs/Orpheus local)

**Impact pour Alfred** : pas prioritaire pour le use case admin, mais utile pour les instructions rapides quand l'utilisateur n'est pas devant un ecran.

---

### Tier 2 — Features interessantes, moins critiques

#### 11. Inbox RAG / vector search sur les emails (Mail-0)
Pre-vectoriser tous les threads email pour instant retrieval. Alfred pourrait pre-filtrer les emails pertinents aux dossiers actifs par similarite vectorielle avant meme le triage LLM.

#### 12. Privacy filters sur les emails (Sentient)
Filtrer par sender/keyword/label AVANT que Claude ne voie l'email. Utile si l'interface devient partagee.

#### 13. Cold email blocker (Inbox Zero)
Detecter les cold emails (nouveau sender, pas d'historique, pattern commercial) et les filtrer avant le triage. Signal `List-Unsubscribe` = email de masse = probablement pas urgent.

#### 14. PDF → workflow generation (Skyvern)
Transformer un SOP (procedure operationnelle) en workflow executable. Pour Alfred, convertir un document de procedure administrative en checklist de taches dans un dossier.

#### 15. Teach & Repeat (Google Mariner)
Demonstrer un workflow browser une fois, l'agent le replique pour les futures occurrences similaires. Pas encore open-source mais concept puissant.

---

## Ameliorations de nos systemes actuels

### A. Triage (receiver/triage.ts)

| Amelioration | Source | Detail |
|---|---|---|
| **Pre-filtre sender connu** | Inbox Zero | Stocker sender→dossier en JSON. Bypass LLM si match |
| **Thread continuity** | Inbox Zero | Si email est dans un thread deja route, bypass triage |
| **Header `List-Unsubscribe`** | Inbox Zero | Le detecter = signal fort "email de masse" |
| **Regex intent pre-check** | Mail-0 | isQuestion/isRequest/isMeeting/isUrgent avant LLM |
| **Action + deadline extraction** | Google Gemini | Extraire les to-dos au triage, stocker dans state.md |
| **Fast-path draft** | Mail-0 | Emails simples → draft Gmail direct, pas de session |

### B. Session management (launcher/session.ts)

| Amelioration | Source | Detail |
|---|---|---|
| **Watchdog auto-compact** | amux (rapport precedent) | Detecter `context < 20%` → `/compact` |
| **Writing style injection** | Mail-0, Inbox Zero | Profil de style de l'utilisateur injecte dans CLAUDE.md |
| **Form memory injection** | Skyvern | FIELD_MAP des sites recurrents injecte dans CLAUDE.md |
| **Pre-compaction memory flush** | OpenClaw (rapport precedent) | Prompt de sauvegarde avant compaction |
| **Approval flow Telegram** | CoPaw, Skyvern | Inline keyboard approve/reject + timeout |

### C. Sweep / checkup (launcher/checkup.ts)

| Amelioration | Source | Detail |
|---|---|---|
| **Follow-up tracking** | Lindy, Perplexity | Scanner les threads envoyes sans reponse |
| **Pulse suppression** | Leon | Backoff exponentiel sur les suggestions declinees |
| **Heartbeat configurable** | CoPaw | `HEARTBEAT.md` avec checklist personnalisable |
| **Behavioral principles** | Leon (self-model) | Promouvoir les patterns acceptes en principes |

### D. Memoire (memory/)

| Amelioration | Source | Detail |
|---|---|---|
| **Auto-extraction de facts** | Leon, Sentient | A chaque SessionEnd, extraire les facts durables |
| **TTL sur les facts** | Sentient | Court terme (24h) vs long terme (permanent) |
| **Profil utilisateur** | Leon (OWNER.md), PAI | `workspace/PROFILE.md` separe des dossiers |
| **Memoire relationnelle** | PAI | W/B/O notes avec score de confiance |
| **Vector search sur memoire** | Sentient, CoPaw | Index vectoriel sur les `.md` existants |

### E. Notifications (notifications/telegram.ts)

| Amelioration | Source | Detail |
|---|---|---|
| **Inline keyboard** | CoPaw | Boutons Approuver/Rejeter dans les notifs |
| **Approval avec timeout** | CoPaw, Skyvern | Suspend la session, timeout → DENY auto |
| **Web push VAPID** | Codeman (rapport precedent) | Alternative/complement a Telegram |

### F. Document processing (nouveau)

| Amelioration | Source | Detail |
|---|---|---|
| **PDF → vision LLM** | TaxHacker | `pdf2pic` + LLM vision = extraction sans OCR |
| **Schema dynamique par type** | TaxHacker | Champs configurables avec `llm_prompt` par field |
| **Double devise + taux historique** | TaxHacker | Conversion xe.com, cache 24h |
| **Texte brut full-text** | TaxHacker | Extraire et stocker le texte pour recherche |

---

## Ce qu'Alfred fait mieux que tous

| Avantage | Detail | Qui s'en approche le plus |
|----------|--------|--------------------------|
| **Dossiers long-lived isoles** | Chaque cas admin = session focalisee avec son propre contexte, state.md, artifacts. Peut durer des jours, attendre un event externe, reprendre | Aucun — tous sont conversationnels ou task-based court |
| **Triage intelligent event → dossier** | One-shot Claude qui lit tous les state.md et route automatiquement les events entrants | Aucun — Inbox Zero a des regles, mais pas de routing vers des sessions focalisees |
| **`## En attente` avec criteres** | Un dossier peut dire "j'attends un email de X" et le triage match l'event contre ces criteres | Sentient a `wait` tool, Skyvern a `HumanInteractionBlock`, mais pas de matching automatique |
| **Hooks PreToolUse non-contournables** | Mini-Claude cote systeme qui bloque les actions dangereuses AVANT execution | Leon et PyGPT n'ont aucun guard-rail. CoPaw a des regex YAML |
| **macOS natif** | osascript, Shortcuts, Messages, Calendar, Finder, LaunchAgent | CoPaw a iMessage via `imsg`, Leon a des context files OS |
| **Camoufox anti-detection** | Browser fingerprint-resistant, profils par dossier | Skyvern utilise Chromium standard |
| **Claude Code = l'intelligence** | Pas de plomberie LangGraph/ReAct/tool-calling custom. Claude fait TOUT directement | Sentient a 3 couches (planner → executor → agent). PAI est le plus proche |
| **Zero-cost** | Claude Max, pas de budget API, pas d'embeddings payants | Tous les autres dependant d'API payantes |

---

## Recommandations prioritaires

### Sprint 1 — Triage intelligent (impact maximal, effort modere)

**1. Pre-filtre sender → dossier** (Inbox Zero)
```
workspace/_config/sender-routes.json
{ "invoice@stripe.com": "dossier-facturation", "comptable@cabinet.com": "dossier-compta" }
```
Avant le triage LLM : lookup dans ce fichier. Si match → route direct.

**2. Thread continuity** (Inbox Zero)
Si l'email Gmail a un `threadId` deja associe a un dossier actif → bypass triage, relancer la session.

**3. Fast-path draft** (Mail-0)
Au triage, si l'email est simple (intent: ack/confirm/thanks) → generer un draft Gmail via MCP, notifier l'utilisateur sur Telegram, pas de session tmux.

### Sprint 2 — Sessions plus robustes (combinable avec le rapport orchestrateurs)

**4. Writing style profile** (Mail-0, Inbox Zero)
Analyser ~20 emails envoyes par l'utilisateur, extraire un profil de style, stocker dans `workspace/PROFILE.md`, injecter dans le CLAUDE.md des sessions qui redigent.

**5. Action + deadline extraction** (Google Gemini)
Au triage, extraire explicitement : actions requises + deadlines + contacts impliques. Stocker en section structuree dans `state.md`.

**6. Approval Telegram interactif** (CoPaw)
Quand un hook detecte une action sensible mais non-interdite → inline keyboard Approuver/Rejeter → pause session → timeout 10min → DENY auto.

### Sprint 3 — Proactivite

**7. Follow-up tracking** (Lindy)
Le sweep/checkup scanne les threads Gmail envoyes par les sessions sans reponse depuis >N jours → cree suggestion de relance.

**8. Pulse suppression** (Leon)
Quand l'utilisateur decline une suggestion, backoff exponentiel (24h → 7d → 30d). Quand il accepte, promouvoir en pattern appris.

**9. Triggered workflows** (Sentient)
`workspace/_config/triggers.json` : regles declaratives (sender X + sujet contient Y → ouvrir dossier type Z). Evaluees avant le triage AI.

### Sprint 4 — Memoire enrichie

**10. Auto-extraction de facts** (Leon, Sentient)
A chaque SessionEnd, hook qui extrait les facts durables (contacts decouverts, decisions prises, preferences apprises) et les ajoute a la memoire.

**11. User profile** (Leon OWNER.md, PAI)
`workspace/PROFILE.md` : preferences, contacts recurrents, style de communication, decisions passees. Mis a jour automatiquement. Separe des dossiers.

---

## Synthese croisee (avec le rapport orchestrateurs)

En combinant les deux rapports, les 5 ameliorations les plus impactantes pour Alfred sont :

| # | Amelioration | Source | Effort | Impact |
|---|---|---|---|---|
| 1 | **Watchdog auto-compact + restart** | amux | Moyen | Critique — sessions qui meurent |
| 2 | **Pre-filtre sender + thread continuity** | Inbox Zero | Faible | Haut — -80% appels LLM triage |
| 3 | **JSONL watcher + `--session-id`** | claude-session-driver, Codeman | Faible | Haut — visibilite sessions |
| 4 | **Approval Telegram interactif** | CoPaw, Paperclip | Moyen | Haut — actions sensibles gerees |
| 5 | **Writing style + fast-path draft** | Mail-0 | Faible | Moyen — qualite emails |
