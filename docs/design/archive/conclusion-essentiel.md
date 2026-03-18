# Conclusion : L'essentiel du problème

## Le constat fondamental

Claude Code est déjà capable de faire quasi tout ce qu'on veut :
- Facturation → /comptable
- Emails → Gmail MCP
- Navigation web → /navigate, Playwright
- Messages → /sms, /whatsapp
- Calendrier, Notion, etc. → MCP servers

Lolo a constaté ça en utilisant /comptable : Claude Code est quasi 100% autonome
pour créer des factures, récupérer des dépenses, naviguer sur des sites. Le seul
moment où il coince, c'est quand il y a de l'authentification qu'il ne peut pas
gérer seul (captcha, MFA, etc.).

**Le problème n'est pas la capacité. C'est l'orchestration.**

Comment faire pour que Claude Code tourne en autonomie, suive des dossiers sur
plusieurs jours/semaines, et ne sollicite Lolo que quand c'est vraiment nécessaire ?

## Les problèmes à résoudre

### 1. TRIGGER — "Quelque chose se passe, lance Claude"
Claude ne se lance pas tout seul. Il faut un backend qui :
- Reçoit les events externes (webhook Gmail, nouveau SMS, etc.)
- Reçoit les instructions directes de Lolo (app web, Claude Code interactif)
- Réagit aux événements schedulés (crons, deadlines)
- Lance Claude avec le bon contexte

Ne pas se limiter aux emails — penser à tout ce à quoi un assistant réagit :
events entrants, instructions de Lolo, deadlines qui approchent, relances à faire,
réponses attendues qui n'arrivent pas, triggers externes.

### 2. ÉTAT — "Voici où tu en étais sur ce dossier"
Claude n'a pas de mémoire entre sessions. Il faut :
- Persister l'état de chaque dossier/workflow en cours
- Le rendre lisible par Claude au démarrage d'une session
- Permettre à Claude de le mettre à jour
- Garder l'état concis (ne pas accumuler du bruit au fil du temps)

### 3. CHECKPOINT — "Claude a besoin de Lolo, pause et notifie"
Certaines actions sont sensibles. Il faut :
- Que Claude puisse se mettre en pause à des moments précis
- Notifier Lolo (Telegram push → lien vers app web pour le contexte complet)
- Persister l'état pour pouvoir reprendre plus tard

Cas d'usage concret (soulevé par Lolo) : Claude va sur facture.net, il n'a pas
le mot de passe ou pire, il a besoin d'une validation MFA par téléphone. Il doit
pouvoir dire "je suis bloqué ici" et que Lolo puisse intervenir. Et si Claude
doit y retourner plus tard, il sera peut-être ENCORE bloqué par la MFA. Certaines
tâches nécessitent des interactions multiples et imprévisibles.

Question ouverte : est-ce que le mode `claude -p` (print, non-interactif) gère
bien ça ? Probablement pas — quand Claude est bloqué en mode print, il ne peut
pas demander d'aide mid-session. Options :
- Print + fallback (Claude s'arrête, notifie, reprend dans une nouvelle session)
  → mais on perd l'état browser (cookies, page ouverte, formulaire rempli)
- Tmux (session interactive détachée, Lolo peut attacher quand Claude a besoin)
  → c'est ce que V1 fait, ça marche pour les interactions
- Hybride (print pour les tâches simples, tmux pour les tâches browser)
  → plus complexe à orchestrer

### 4. REPRISE — "Lolo a répondu, Claude reprend"
Quand Lolo valide ou donne une instruction, il faut :
- Recevoir la réponse
- Relancer Claude avec l'état du dossier + la réponse de Lolo
- Continuer le workflow là où il s'était arrêté

Si on utilise tmux, la reprise est "native" (Lolo intervient dans le terminal,
Claude continue). Si on utilise des sessions print séparées, il faut reconstruire
le contexte dans la nouvelle session.

### 5. ISOLATION — "Chaque Claude a son espace"
Pas d'interruption — si Claude crée une facture, il finit.
Un event urgent → nouvelle session parallèle, pas interruption de l'existante.

La solution : plusieurs sessions Claude en parallèle, chacune isolée avec son
propre contexte (= son dossier). Elles ne se marchent pas sur les pieds.
Les conflits de ressources (Chrome, etc.) sont gérés par des locks.

### 6. GARDE-FOUS — "Sécuriser sans limiter"
L'assistant a accès à tout : emails, banque, factures, browser.
Une erreur (facture erronée, mauvais paiement, réponse incorrecte à l'admin
fiscale) a des conséquences réelles et potentiellement graves.

Le challenge : protéger contre les erreurs de Claude sans brider son autonomie.
Le cas le plus dangereux : Claude est CONFIANT mais a TORT. Les checkpoints
ne couvrent que les cas où Claude SAIT qu'il doit s'arrêter.

**C'est le problème le plus dur et il n'est pas résolu.**

### 7. AUTO-ANALYSE — "Claude détecte ses propres lacunes"
Quand Claude n'arrive pas à faire quelque chose, il devrait :
- Détecter qu'il est bloqué ou incapable
- Reporter le gap : "Pour faire X, j'aurais besoin de pouvoir Y"
- Trigger Lolo uniquement quand il ne peut pas avancer
- Permettre d'améliorer ses compétences (ajout de skills) au fil du temps

L'avantage de Claude Code c'est qu'on peut l'améliorer incrémentalement :
si on voit qu'il ne gère pas bien un truc, on ajoute un skill ou on modifie
un comportement. Pas besoin de tout prévoir au jour 1.

### 8. INFRASTRUCTURE — "La plomberie nécessaire"
Pas de l'intelligence, mais indispensable pour la fiabilité :
- Dédup des events (webhooks dupliqués — ça arrive avec Gmail)
- Resource locks entre sessions parallèles (Chrome, etc.)
- Retry/backoff (rate limits Claude, APIs tierces)
- Audit trail (quoi, quand, pourquoi — crucial pour les actions financières)
- Crash recovery (détecter qu'un workflow est cassé, relancer)

Ce n'est pas du "cerveau autour du cerveau" — c'est de la plomberie que tout
système robuste a besoin. La V1 avait raison de l'inclure, c'est juste mélangé
avec de la logique métier superflue.

## Ce qui existe déjà et qu'on garde
- Skills Claude Code (/comptable, /navigate, /sms, /whatsapp, etc.)
- MCP servers (Gmail, Calendar, Notion, Coolify, etc.)
- Browser automation (Playwright)
- Telegram pour les notifications push
- Locks pour ressources partagées

## Ce qui est superflu dans V1
Le code qui réimplémente ce que Claude fait nativement :
- Triage IA custom → Claude peut décider lui-même
- Queue avec logique de priorité → Claude peut prioriser lui-même
- Conversation manager + style mimicry → pas un besoin réel
- Knowledge base structurée → Claude peut lire/écrire des fichiers
- Event processor/router → Claude peut décider quoi faire d'un event

## Les questions encore ouvertes
1. Comment Claude est lancé concrètement ? (print vs tmux vs hybride)
   → Nécessite des tests
2. Boucle continue vs event-driven vs hybride ?
   → Pas tranché
3. Qui fait le triage/routing des events ? (code simple vs Claude)
   → Pas tranché
4. Comment résoudre les garde-fous sans brider l'autonomie ?
   → Le problème le plus dur, pas de solution proposée
5. Quel scope pour le jour 1 ?
   → Pas discuté en détail
