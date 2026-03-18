# Décisions clés pour V2

## Le vrai problème technique : le contexte est fini

### Comment on en est arrivé là

On a d'abord pensé en termes d'"agents spécialisés" (un agent compta, un agent admin,
un agent social) — c'est l'approche D (bureau d'agents). L'idée était séduisante :
chaque agent a son domaine, son prompt optimisé, son workspace.

Mais en réfléchissant, Lolo a fait remarquer que Claude peut lui-même déterminer
quels skills utiliser et quel contexte charger. La spécialisation par domaine
n'apporte pas grand-chose — Claude est déjà généraliste et bon dans tous ces domaines.

Par contre, ce qui est CERTAIN, c'est qu'on ne peut pas avoir UN SEUL Claude qui gère
tout. Pas parce qu'il n'est pas assez intelligent, mais parce que son contexte est fini.
Si on lui donne l'état de tous les dossiers + tous les emails + tous les messages +
toutes les tâches en cours, ça déborde. Et même si ça rentre, la qualité se dégrade
quand le contexte est trop chargé.

Et on ne peut pas non plus le laisser tourner indéfiniment sur une session longue —
le contexte s'accumule, le bruit augmente, les réponses dérivent.

### La solution : sessions focalisées par dossier

Pas d'agents "spécialisés" par domaine. Un seul type d'agent : un Claude Code
chargé avec le bon contexte pour un dossier précis.

Exemples :
- Claude travaille sur "factures Sopra" → chargé avec : état du dossier factures,
  infos Sopra, accès Gmail. C'est tout.
- Claude travaille sur "rapport exali" → chargé avec : état du dossier exali,
  credentials, accès browser. C'est tout.
- Claude répond à la comptable → chargé avec : l'email de la comptable, les docs
  concernés. C'est tout.

Le même Claude, juste des contextes différents. Quand il a fini (ou quand il a besoin
de Lolo), il sauvegarde son état et se termine. Session propre à chaque fois.

### Ce que ça résout
- **Contexte fini** → chaque session ne charge que ce dont elle a besoin
- **Parallélisme** → plusieurs sessions indépendantes en même temps, qui ne se
  marchent pas sur les pieds
- **Pas de dérive** → sessions courtes et focalisées, pas de contexte qui gonfle
- **Pas de spécialisation à maintenir** → un seul type d'agent, pas N prompts
  système à maintenir et synchroniser

### Craintes et questions ouvertes sur ce modèle
- **Qui décide quel contexte charger ?** Si c'est du code, il faut savoir à l'avance
  quel dossier est concerné par un event. Si c'est Claude (un "triage Claude"), ça
  ajoute une étape mais c'est plus intelligent. On n'a pas tranché.
- **Comment gérer un event qui concerne plusieurs dossiers ?** Ex: un email de Sopra
  qui parle à la fois de la facture ET d'un changement de contrat. Dupliquer l'event ?
  Créer un nouveau dossier ? Laisser Claude décider ?
- **Quelle taille de contexte par dossier ?** Si un dossier accumule beaucoup d'historique
  (ex: factures sur 2 ans), le fichier d'état devient gros. Comment garder ça concis
  sans perdre d'info importante ?
- **Comment le dossier "sait" quels outils il a besoin ?** Est-ce que c'est encodé
  dans le fichier d'état ? Ou Claude découvre par lui-même ?

---

## Interface : comment Lolo interagit avec l'assistant

### Le cheminement de réflexion

Au départ, le projet V1 utilisait Telegram comme interface principale (messages,
topics par tâche, approbations). Mais en réfléchissant, on s'est rendu compte que
Telegram est trop limitant pour prendre des actions complexes :
- Pas de visualisation riche (statuts, dossiers, historique)
- Pas de formulaires ou d'interactions complexes
- Boutons limités
- Pas de contexte visuel (screenshots, PDFs, formulaires à valider)

### Décision : App web + Telegram notifications + Claude Code interactif

**App web (interface principale)**
- Visualiser les dossiers en cours, statuts, ce qui tourne
- Valider/refuser des actions avec le contexte complet (voir la facture avant
  de valider l'envoi, lire le draft d'email avant de l'approuver)
- Donner des instructions et créer des tâches/dossiers
- Debugger quand ça marche pas (logs, historique des actions, état des sessions)
- Accessible depuis le téléphone ET l'ordi
- Permet potentiellement d'intervenir quand Claude est bloqué (captcha, MFA)
  en montrant le browser/terminal

**Telegram (notifications push uniquement)**
- "J'ai besoin de toi" → lien vers l'app web pour agir
- "J'ai fini X" → résumé + lien pour voir les détails
- "Truc urgent arrivé" → alerte avec contexte minimal
- PAS d'actions depuis Telegram — juste des notifications qui renvoient vers l'app

**Claude Code interactif (usage ponctuel)**
- Quand Lolo veut faire quelque chose lui-même directement
- Utilise les mêmes skills et outils que les agents autonomes
- Pas de changement par rapport à aujourd'hui

### Craintes et questions ouvertes
- **L'app web ajoute de la complexité** — C'est un frontend à maintenir. Le dashboard V1
  existe déjà (React 19, Fastify API), est-ce qu'on le réutilise ou on repart de zéro ?
- **Intervention sur captcha/MFA via web** — Est-ce que c'est réaliste techniquement ?
  Il faudrait que l'app web montre le browser de Claude en temps réel et permette
  à Lolo d'interagir. C'est faisable (VNC, noVNC, screenshot polling) mais complexe.
- **Mobile-first ou desktop-first ?** — Lolo est souvent sur mobile. L'app doit être
  utilisable sur téléphone pour les validations rapides.

---

## Ce qu'on a écarté et pourquoi

### CLIs custom pour remplacer les MCP servers
On a exploré l'idée de remplacer les MCP servers (Gmail, Calendar, etc.) par des CLIs
simples. Conclusion : c'est juste reformater ce qui existe déjà. Les MCP servers font
déjà exactement ça. Et Claude sait déjà les utiliser. Pas de valeur ajoutée, juste du
travail de réécriture.

De plus, les CLIs qu'on imaginait (ex: `invoice list --missing`) encodaient de la
logique métier dans le CLI. Or Claude sait déjà faire ce raisonnement. On n'a pas besoin
de programmer "trouver les factures manquantes" — Claude peut chercher dans Gmail,
comparer, et conclure. Le rôle des outils c'est juste des ponts vers les services
(chercher, envoyer, lister), pas de la logique métier.

### Claude API / Agent SDK
L'API Claude est payante au token — beaucoup trop cher pour un usage intensif 24/7.
L'Agent SDK utilise aussi l'API. Claude Code avec Claude Max est gratuit et a déjà
tout l'écosystème (skills, MCP, browser). Choix évident.

### Agents spécialisés par domaine
Discuté longuement. Claude est déjà généraliste et peut lui-même choisir les bons
skills. La spécialisation par domaine (compta, admin, social) ajoute de la complexité
(N prompts système à maintenir, routing entre agents) sans apporter de valeur claire.
La bonne granularité c'est le dossier, pas le domaine.

### Conversations autonomes temps réel
Feature "amusante" de la V1 mais pas un besoin réel. L'assistant doit résoudre des
problèmes et atteindre des objectifs, pas chatter. Si un cas d'usage demande de la
réactivité (réservation restaurant, appel), c'est un outil spécialisé, pas le système
principal.
