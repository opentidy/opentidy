# Principes directeurs pour V2

Décisions et principes validés au fil de la réflexion.
Chaque principe inclut le raisonnement qui y a mené.

## 1. La vitesse n'est pas un critère

**Le principe** : L'assistant gère des dossiers administratifs, pas des conversations
temps réel. Que Claude mette 10 secondes ou 2 minutes pour trier un email, le résultat
est le même.

**Comment on y est arrivé** : On s'inquiétait de la performance du triage ("est-ce que
10s de triage Claude c'est trop lent ?", "faut-il optimiser le routing ?"). L'utilisateur a fait
remarquer que contrairement à un chatbot, l'assistant n'a pas besoin d'être rapide.
Il doit être fiable et atteindre des objectifs. Si une facture est envoyée 2 minutes
après au lieu de 30 secondes, personne ne le remarque.

**Conséquences concrètes** :
- Pas besoin d'optimiser le routing pour la vitesse
- Pas besoin de polling rapide (toutes les 5 min suffit largement)
- Pas besoin de conversations autonomes temps réel
- Claude peut trier/router lui-même, le temps n'est pas un problème
- Pas besoin de queue avec priorités ultra-fines
- On peut se concentrer sur la qualité des résultats plutôt que la latence

**Seule exception** : quand l'utilisateur demande quelque chose directement en mode interactif
(Claude Code terminal), là c'est du live, mais c'est déjà géré nativement.

## 2. Claude Code est le moteur d'exécution

**Le principe** : Tout le travail est fait par Claude Code, qui utilise Claude Max
(abonnement, pas de coût au token).

**Pourquoi** : On a évalué trois options :
- Claude API directement → trop cher pour un usage intensif 24/7
- Claude Agent SDK → utilise aussi l'API payante
- Claude Code avec Claude Max → gratuit, et a déjà tout (skills, MCP, browser)

Claude Code sait déjà faire quasi tout ce qu'on veut. Le problème n'est pas sa
capacité, c'est l'orchestration autour de lui.

**Le mode `-p` (print)** est intéressant pour les tâches autonomes, mais on a des
doutes sur sa capacité à gérer les tâches longues et les interactions (captcha, MFA).
Les sessions tmux (comme en V1) sont peut-être mieux pour les tâches qui nécessitent
du browser. C'est une question ouverte qui nécessite des tests concrets.

## 3. Le budget n'est pas une contrainte

**Le principe** : On met les moyens nécessaires. Pas de compromis d'architecture
pour économiser des tokens ou des ressources.

**Contexte** : On s'inquiétait des limites Claude Max (sessions parallèles, etc.).
L'utilisateur a confirmé que le budget n'est pas un problème. Ça libère les choix
architecturaux. on peut lancer plusieurs sessions en parallèle sans se soucier
du coût.

## 4. L'intelligence est dans Claude, pas dans le code

**Le principe** : Le code backend ne contient PAS de logique métier, de triage,
de décision, de routing intelligent. Il fait de la plomberie : recevoir events,
lancer Claude, persister l'état. Claude décide quoi faire, comment, dans quel ordre.

**Comment on y est arrivé** : En analysant la V1, on a réalisé que ~3000 lignes de
TypeScript réimplémentent ce que Claude fait nativement, triage IA, routing,
priorisation, gestion de conversations. On a "construit un cerveau autour du cerveau."

L'idée des CLIs custom a renforcé ce constat : on était en train de programmer des
commandes comme `invoice list --missing` alors que Claude sait déjà analyser les emails
et conclure quelles factures manquent. Les outils doivent être des ponts vers les
services (chercher, envoyer, lister), la logique métier c'est Claude.

**Nuance importante (challenge 3)** : certaines choses que fait le backend ne sont PAS
de l'intelligence mais de la plomberie nécessaire :
- Dédup des events (webhooks dupliqués)
- Resource locks entre sessions parallèles
- Retry/backoff sur rate limits
- Audit trail
- Crash recovery
Ces fonctions restent dans le code, c'est de l'infrastructure, pas de la décision.

## 5. Pas d'interruption : parallélisme isolé

**Le principe** : Si Claude travaille sur une facture, il finit. Un event urgent
ne l'interrompt pas, il lance une nouvelle session parallèle.

**Raisonnement** : On avait identifié l'interruption comme un problème (challenge 1).
L'utilisateur a clarifié : l'interruption est le mauvais modèle. Si un email urgent arrive
pendant que Claude crée une facture, il ne faut pas arrêter la facture. Il faut
lancer un deuxième Claude en parallèle qui gère l'email. Chaque Claude a son propre
espace et ses propres ressources.

**Conséquence** : il faut un système qui gère les conflits de ressources (deux Claude
veulent Chrome en même temps). Le système de locks de la V1 fonctionne déjà pour ça.

## 6. L'assistant tourne en fond, tranquillement

**Le principe** : Pas besoin de réactivité à la seconde. L'assistant travaille
méthodiquement, vérifie régulièrement, avance sur les dossiers, et ne dérange l'utilisateur
que quand c'est nécessaire.

**L'analogie retenue** : le système nerveux. L'agent ne "commence pas sa journée"
comme un humain. il tourne 24/7. Vigilant en permanence, il surveille les stimuli,
réagit quand il y a quelque chose, progresse sur le travail de fond quand c'est calme.

**Débat non tranché** : boucle continue (polling) vs event-driven pur vs hybride.
- Boucle continue → peut faire du travail de fond proactif, mais gaspille quand rien
  ne se passe
- Event-driven pur → efficace mais ne gère pas le travail de fond ni les relances
- Hybride (events + cron périodique) → probablement le bon compromis mais les détails
  restent flous

## 7. Actions rapides/interactives = outil spécialisé

**Le principe** : Si un cas d'usage nécessite de la réactivité ou de l'interactivité
(conversations temps réel, réservations en live, appels téléphoniques), ça ne doit
PAS être géré par le système principal. C'est un outil ou un Claude Code spécialisé
et optimisé pour ça, que l'assistant appelle quand il en a besoin.

**Raisonnement** : Le système principal travaille méthodiquement en fond. Si on essaie
de le rendre aussi rapide et réactif, on complexifie tout. Mieux vaut avoir le système
principal qui décide "je dois réserver un restaurant" puis délègue à un outil spécialisé
conçu pour l'interactivité.

**Exemples futurs (hors scope V2)** : appels téléphoniques, réservations, conversations
temps réel, shopping en ligne. Chacun = un skill que Claude appelle.

## 8. Amélioration continue

**Le principe** : L'assistant n'a pas besoin d'être parfait au jour 1. Il doit être
capable de détecter ses lacunes et permettre à l'utilisateur de l'améliorer au fil du temps.

**Idée d'auto-analyse** : Quand Claude n'arrive pas à faire quelque chose, il devrait
reporter le gap : "Pour faire X, j'aurais besoin de pouvoir Y mais je n'en suis pas
capable." Ça permet à l'utilisateur d'ajouter des skills, modifier des comportements, etc.

**Crainte** : ne pas tomber dans le piège de sur-engineer l'auto-analyse. Rester
simple, un fichier de "gaps détectés" que Claude alimente et que l'utilisateur consulte
quand il veut améliorer l'assistant.
