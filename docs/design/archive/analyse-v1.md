# Analyse de l'assistant V1

## Contexte de création

L'utilisateur a commencé par demander à Claude Code d'automatiser la création de factures
(aller sur les mails, récupérer les dépenses, les uploader dans le portail bancaire).
C'est devenu le skill /comptable. En voyant Claude Code travailler, il a constaté
que Claude est capable d'être quasi 100% autonome, impressionnant sur la plupart
des tâches, limité seulement par l'authentification (captcha, MFA, etc.).

De là est née l'idée d'un assistant complet qui gérerait toutes les tâches
administratives. Le projet a grandi avec un backend TypeScript, un système de tâches,
un event pipeline, des conversations autonomes, un dashboard, etc.

## Ce qui marche bien

### Skills Claude Code (le vrai moteur)
- **/comptable** : facturation, timesheets, dépenses: fonctionne très bien en interactif
- **/navigate** + Playwright : navigation web, formulaires, scraping
- **/sms**, **/whatsapp** : envoyer/lire des messages
- **/bitwarden** : gestion des mots de passe
- **/search**, **/deepsearch** : recherche web

### MCP servers (ponts vers les services)
- Gmail, Calendar, Notion, Coolify, Atlassian, Miro
- Fonctionnent bien, donnent à Claude l'accès direct aux APIs

### Infrastructure backend solide
- **Event bus** : store-then-emit, dédup par hash, replay au restart
- **Queue** : locks PID pour ressources partagées (Chrome, wacli, email),
  auto-retry après 5s
- **Factory pattern** : toute l'architecture est testable, tous les modules
  s'exportent via createX() → facile à mocker
- **tmux sessions** : Claude tourne dans des tmux détachés, le dashboard peut
  montrer les terminaux, genuinely clever

## Ce qui ne marche pas / est superflu

### Le backend réinvente ce que Claude fait nativement

~3000 lignes de TypeScript qui essaient de faire le boulot de Claude :

- **Triage IA** (src/events/triage.ts) : un prompt custom pour classifier les events
  en urgent/normal/ignored. Mais Claude pourrait faire ça directement si on lui
  donne l'event. Le code parse la réponse JSON, gère les fallbacks... tout ça
  pour reproduire le jugement de Claude dans du code structuré.

- **Event processor** (src/events/processor.ts) : route les events triagés vers
  les bonnes actions. Mais c'est de la logique métier encodée dans du code, si
  urgent et pas de taskId, notify Telegram; si normal et taskId, queue avec
  priorité 5; etc. Claude pourrait décider ça lui-même.

- **Conversation manager** (src/events/conversations.ts) : machine à états pour
  les conversations autonomes (pending → authorized → active → inactive). Gère
  le buffering de messages, le style mimicry, les escalations. Feature amusante
  mais pas un besoin réel, l'utilisateur n'a pas besoin que l'assistant chatte à sa place.

- **Knowledge base** (src/shared/knowledge.ts) : facts plats en SQLite
  (entity, category, fact, confidence). Pas de relations, pas de graph,
  pas vraiment exploité par le reste du système.

- **Queue avec priorités** (src/shared/queue.ts) : système de priorités 0-10
  avec persistence SQLite. Sur-engineeré pour le use case réel.

### Système de tâches trop simple pour les vrais besoins

Le task manager gère des tâches avec cron + confirm mode. Mais les vrais besoins
de l'utilisateur sont des **workflows multi-étapes** qui durent des jours/semaines :
- Créer les factures manquantes = chercher → comparer → créer → valider → envoyer
- Répondre à la comptable = lire l'email → trouver les docs → préparer la réponse → valider
- Rapport exali = se connecter → remplir le formulaire → valider avant soumission

Le task system ne gère pas ça. Il gère "lance un script à 9h" ou "lance Claude
avec ce prompt quand on trigger la tâche."

### Style mimicry : surface seulement

Extrait 40 messages de l'historique de conversation, les donne à Claude comme
exemples. Claude imite. Ça marche un peu, mais :
- Très sensible aux samples (si les samples sont formels → réponse formelle)
- Pas de vraie compréhension du style de l'utilisateur
- Detection d'escalation par keyword ("ESCALADE:"): fragile

De toute façon, les conversations autonomes ne sont pas un besoin prioritaire.

## Autonomie réelle : ~30-40%

**Là où c'est autonome** :
- Conversations une fois approuvées
- Tâches cron sans confirm
- Triage des events

**Là où il faut l'humain** :
- Chaque nouvelle conversation WhatsApp/SMS : "oui" requis
- Tâches avec confirm: true : dry-run + approbation
- Création de tâches : manuelle
- Tout ce qui est hors des patterns prévus par le code

## Les vraies tâches de l'utilisateur (ce que V2 doit gérer)

1. Remplir les justificatifs de dépenses (portail bancaire)
2. Vérifier les factures manquantes (1/mois 2025-2026), créer celles qui manquent
3. Récupérer les timesheets dans les mails, identifier les manquants
4. Répondre aux demandes de justificatifs de la comptable
5. Envoyer la demande de non-dom au comptable (Chypre)
6. Vérifier l'expatriation côté Belgique
7. Appeler Bruno (comptable belge) pour suivi fermeture société
8. Mettre en vente sur 2ememain + gérer les acheteurs
9. Exali.com : rapport annuel assurance pro (rappel reçu, deadline)

### Pattern commun de ces tâches
- Multi-étapes sur plusieurs jours/semaines
- Nécessitent de la navigation web et des interactions avec des services
- Sensibles (financier, légal, administratif)
- Checkpoints humains à des moments précis (avant envoi, avant soumission)
- Certaines nécessitent des interactions multiples et imprévisibles (MFA, captcha)
- Besoin de suivi (relancer si pas de réponse, vérifier que c'est fait)

## Verdict

Le code est de bonne qualité et l'architecture est testable. Mais le projet a grandi
organiquement autour de features (conversations, knowledge, triage) au lieu de se
concentrer sur le besoin fondamental : permettre à Claude de gérer des dossiers
administratifs en autonomie avec des checkpoints humains.

La V2 devrait garder l'infrastructure solide (locks, dédup, retry), garder les outils
(skills, MCP), et remplacer tout le "cerveau" (triage, routing, conversations,
knowledge) par Claude lui-même.
