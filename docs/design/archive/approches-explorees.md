# Approches explorées

Historique de toutes les approches discutées, avec le raisonnement et pourquoi
on les a gardées ou écartées. Important pour ne pas refaire les mêmes erreurs
si on revient sur ces questions.

---

## Approche A : Moteur de workflows avec checkpoints

### L'idée
Remplacer le task system par un moteur de workflows : chaque tâche admin est un
workflow défini avec des étapes, des checkpoints humains, et un état persisté.

### Exemple
```
factures-mensuelles:
  1. [auto]  Lister les mois, vérifier quelles factures existent
  2. [auto]  Chercher les timesheets pour les mois manquants
  3. [auto]  Créer les factures manquantes
  4. [CHECK] Montrer les factures à l'utilisateur pour validation
  5. [auto]  Envoyer les mails après OK
```

### Pourquoi on l'a gardée en partie
Le concept de "checkpoints dans un workflow" est bon. C'est le bon modèle mental.

### Pourquoi on ne l'a pas retenue telle quelle
Définir les workflows à l'avance en code est rigide. Si le workflow change
(nouveau client, nouveau format de facture), il faut modifier le code. Or Claude
peut adapter son approche dynamiquement, il n'a pas besoin d'un workflow codé en dur.
De plus, chaque step qui spawn un subprocess Claude a un overhead d'initialisation.

---

## Approche B : Backend minimal avec règles déclaratives

### L'idée
Simplifier le backend à 3 choses : recevoir events, matcher des règles YAML, lancer Claude.

```yaml
rules:
  - source: gmail
    from: "*@sopra*"
    action: run_workflow("facturation")
```

### Pourquoi on l'a écartée
Les règles déclaratives sont un triage bête déguisé en configuration :
- Un email de Sopra qui n'est PAS lié à la facturation → mauvais routing
- Un email d'une nouvelle adresse → aucune règle → perdu
- La comptable qui écrit depuis son adresse perso → pas matché
- Un email urgent d'un inconnu → ignoré

On finit par maintenir des règles de plus en plus complexes. C'est le problème
des filtres email. ça marche pour les cas simples, ça casse dès que la réalité
est nuancée. Et ça ne gère pas l'inattendu, qui est justement l'intérêt d'avoir
une IA.

---

## Approche C : Agent unique avec bureau virtuel

### L'idée
Un seul Claude Code long-running qui gère un "bureau" : un dossier workspace/
avec un fichier par dossier en cours. Claude se lance, lit son bureau, décide
quoi faire.

### Ce qu'on a aimé
- Claude décide lui-même quoi faire, dans quel ordre, quand relancer
- Maximum d'intelligence, minimum de code
- Les fichiers markdown sont le "cerveau", lisibles par l'humain ET par Claude

### Pourquoi on ne l'a pas retenue
- UN seul agent = UN seul contexte = goulot d'étranglement
- Si Claude travaille sur les factures et qu'un email urgent arrive, il fait quoi ?
- Le contexte grandit avec chaque dossier ouvert → dilution
- Un échec sur un dossier bloque tout le reste
- Pas de parallélisme

C'est le feedback clé de l'utilisateur : le vrai problème c'est que le contexte est fini.
Un Claude ne peut pas avoir tous les dossiers en tête en même temps. Et une session
qui tourne trop longtemps dérive.

---

## Approche D : Bureau d'agents (multi-agent avec dispatch)

### L'idée
Un dispatcher intelligent (triage Claude rapide) + plusieurs agents Claude
spécialisés par domaine (compta, admin, social), chacun avec son workspace.

### Ce qu'on a aimé
- Parallélisme réel
- Contexte focalisé par agent
- Scalable (nouvel agent = nouveau dossier + prompt)

### Pourquoi on l'a fait évoluer
La spécialisation par DOMAINE (compta, admin, social) n'apporte pas tant que ça.
Claude est déjà généraliste et peut choisir les bons skills lui-même. La bonne
granularité n'est pas le domaine, c'est le DOSSIER. Un Claude par dossier en
cours, pas un Claude par domaine.

Ça a mené à la décision clé : sessions focalisées par dossier, pas agents
spécialisés par domaine (voir decisions-cles.md).

---

## Approche E : Claude Code natif (skills only)

### L'idée
Virer le backend, tout faire avec des skills Claude Code. Chaque "agent" est un
skill (/compta, /admin, /triage). Un micro-trigger (50 lignes) lance Claude avec
le bon skill.

### Intérêt
Simplicité maximale, des prompts markdown, pas de code.

### Pourquoi on l'a nuancée
On a quand même besoin d'un backend pour la plomberie : recevoir les webhooks,
gérer les watchers, persister l'état, gérer les locks, dédup. "50 lignes" c'est
optimiste. Mais l'idée que les skills portent l'intelligence est bonne.

---

## Approche F : Stateless pur (sessions éphémères)

### L'idée
Pas d'agents persistants. Chaque event = une session Claude fraîche qui :
1. Lit l'état du dossier (fichier markdown)
2. Fait UNE action
3. Met à jour l'état
4. Se termine

### Ce qu'on a aimé
- Ultra robuste (crash = relance, Claude relit le fichier, reprend)
- Pas de state en mémoire, pas de session zombie
- Chaque invocation = contexte propre et focalisé

### Limites
- Overhead de cold-start à chaque invocation
- Pour des tâches qui nécessitent beaucoup de contexte (formulaire web complexe),
  relancer à chaque étape est coûteux
- Perte de l'état browser entre sessions (cookies, page ouverte)

---

## Approche G : Hybride stateless/stateful

### L'idée
Stateless par défaut (90% des cas), stateful quand nécessaire (tâches complexes).

Le dispatcher décide du mode :
- Éphémère : triage, mise à jour d'état, notification, lecture d'emails
- Long : navigation web, création de documents, interactions multi-étapes

### Pourquoi c'est resté dans la course
C'est le compromis le plus pragmatique. Mais les détails d'implémentation
restent flous (comment décider du mode ? comment gérer la transition ?).

---

## Approche H : Toolbox CLI

### L'idée
Remplacer les MCP servers par des CLIs simples que Claude appelle via Bash :
`gmail search ...`, `invoice create ...`, `bank transactions ...`

### Pourquoi on l'a écartée
En y réfléchissant, c'est juste reformater ce qui existe déjà :
- Les MCP servers font déjà exactement ça (search, send, read)
- On ne gagne rien à changer le format du wrapper
- PIRE : certains CLIs qu'on imaginait (ex: `invoice list --missing`) encodaient
  de la logique métier dans le CLI. Or Claude sait déjà faire ce raisonnement.
  Les outils doivent être des ponts vers les services, pas de la logique métier.

L'utilisateur a souligné que ça revenait à "programmer ce que Claude est déjà capable de faire."

---

## Synthèse : ce qu'on retient de chaque approche

| Approche | Concept retenu | Concept écarté |
|---|---|---|
| A (Workflows) | Checkpoints dans un flux | Workflows codés en dur |
| B (Règles) | (none) | Routing par règles statiques |
| C (Agent unique) | Bureau virtuel en fichiers | Agent unique (contexte limité) |
| D (Multi-agent) | Parallélisme isolé | Spécialisation par domaine |
| E (Skills only) | Intelligence dans les prompts/skills | Backend de 50 lignes (irréaliste) |
| F (Stateless) | Sessions fraîches = robuste | Tout stateless (perte état browser) |
| G (Hybride) | Éphémère par défaut, long si besoin |: (reste candidat) |
| H (CLI) | (none) | Réécrire les MCP en CLI |
