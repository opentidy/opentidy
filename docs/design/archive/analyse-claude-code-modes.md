# Analyse : Comment utiliser Claude Code comme moteur d'exécution

## Pourquoi Claude Code et pas autre chose

### Contrainte financière
- Claude API = payant au token → trop cher pour un usage intensif 24/7
- Claude Agent SDK = utilise aussi l'API payante → même problème
- Claude Code avec Claude Max = abonnement fixe, usage illimité → le seul viable

### Contrainte technique
Claude Code a déjà tout l'écosystème :
- Skills (/comptable, /navigate, /sms, /whatsapp, /bitwarden, etc.)
- MCP servers (Gmail, Calendar, Notion, Coolify, Atlassian, etc.)
- Browser automation (Playwright, Chrome DevTools)
- Accès système macOS (fichiers, bash, AppleScript)
- Subagents parallèles
- Session resume (--resume)

Reconstruire tout ça avec l'Agent SDK ou l'API directe = des semaines de travail
pour un résultat équivalent. Et ça coûterait cher en tokens.

## Mode print (`claude -p`)

### Ce que c'est
Claude Code en mode non-interactif. On lui donne un prompt, il exécute en autonomie
(fait ses tool calls en interne), et retourne le résultat final.

```bash
claude -p "Vérifie mes emails Gmail pour des messages de la comptable"
```

En interne, Claude fait : prompt → tool call Gmail MCP → résultat → réflexion →
tool call suivant → ... → réponse finale. Tout ça se passe sans interaction humaine.

### Avantages
- Peut être lancé programmatiquement par le backend
- Utilise Claude Max (pas l'API)
- A accès à tous les outils (skills, MCP, browser, bash)
- Session résumable via `--resume`
- Clean : démarre, fait le travail, se termine

### Le gros problème : les interactions mid-session

Cas concret : Claude va sur facture.net pour créer une facture.
1. Il va sur le site
2. Il doit se connecter → récupère le mot de passe via Bitwarden → OK
3. Le site demande une vérification MFA par SMS → **Claude ne peut pas faire ça**
4. Il a besoin de l'utilisateur pour entrer le code MFA
5. Claude continue, crée la facture
6. Plus tard, il doit revenir sur le site → la session a expiré → re-MFA → **encore besoin de l'utilisateur**

En mode print, Claude ne peut PAS demander de l'aide mid-session. Il est fire-and-forget.
Le résultat sera : "Je n'ai pas pu me connecter à facture.net, MFA requise."
Et il faudra relancer une nouvelle session, mais l'état browser est perdu (cookies,
page ouverte, formulaire à moitié rempli).

Ce n'est pas un cas rare — beaucoup de sites financiers/admin ont du MFA, des captchas,
des sessions courtes. Pour les tâches admin de l'utilisateur, c'est le quotidien.

### Options pour gérer les interactions

**Option 1 : Print + fallback**
Claude tourne en mode print. Quand il est bloqué, il s'arrête, écrit l'état dans
un fichier, notifie Telegram. L'utilisateur répond, nouvelle session print reprend.

- ✅ Simple conceptuellement
- ❌ Perte de l'état browser (cookies, page ouverte, formulaire rempli)
- ❌ Chaque reprise = cold start complet (reconnexion au site, re-navigation)
- ❌ Certaines actions ne sont pas reproductibles (le formulaire a changé, la session a expiré)

**Option 2 : Sessions tmux (ce que V1 fait)**
Claude tourne dans un tmux détaché. Quand il a besoin d'aide, il notifie l'utilisateur
qui peut "attacher" le terminal et intervenir directement.

- ✅ L'état browser est préservé (Claude attend, le browser est ouvert)
- ✅ L'utilisateur intervient en live (entre le code MFA, résout le captcha)
- ✅ Claude reprend immédiatement après l'intervention
- ✅ Déjà implémenté en V1, le dashboard peut montrer les terminaux
- ❌ Plus complexe à orchestrer (il faut gérer les sessions tmux)
- ❌ L'intervention de l'utilisateur nécessite d'attacher un terminal (pas super mobile-friendly)

**Option 3 : Hybride**
Mode print pour les tâches simples (lecture, analyse, notification, email).
Tmux pour les tâches qui impliquent du browser/interaction.

- ✅ Meilleur des deux mondes
- ❌ Faut décider à l'avance quel mode utiliser (ou laisser Claude choisir ?)
- ❌ Plus de complexité dans l'orchestrateur

### Question non résolue
Comment rendre l'intervention de l'utilisateur sur captcha/MFA mobile-friendly ?
Attacher un tmux depuis un téléphone c'est pas pratique. Peut-être :
- Screenshot du captcha envoyé via Telegram, l'utilisateur répond avec le texte ?
- Le dashboard web montre le browser en temps réel (VNC, noVNC) ?
- L'app web montre un screenshot et un champ de saisie ?

Ça nécessite des tests concrets pour déterminer ce qui est réaliste.

## Modèle d'exécution : comment l'assistant "tourne"

### L'analogie du système nerveux
L'agent ne "commence pas sa journée" comme un humain — il tourne 24/7.
Mais il ne faut pas non plus calquer le modèle humain :
un humain arrive le matin et part le soir. L'agent, lui, est toujours là.

Il est en permanence vigilant, surveille les stimuli (emails, messages, events),
réagit quand il y a quelque chose, progresse sur le travail de fond quand c'est calme,
et peut travailler la nuit (préparer les trucs pour le matin de l'utilisateur).

### Boucle continue vs event-driven vs hybride

**Boucle continue (polling)**
- ✅ Peut faire du travail de fond proactif (avancer sur les dossiers quand c'est calme)
- ✅ Gère les relances et deadlines naturellement
- ✅ Simple conceptuellement : une boucle infinie qui check et agit
- ❌ Gaspille des ressources quand il ne se passe rien
- ❌ Doit décider de la fréquence de polling (trop fréquent = gaspillage, trop rare = latence)

**Event-driven pur (webhooks + réactions)**
- ✅ Zéro ressource quand rien ne se passe
- ✅ Réactif aux events externes
- ❌ Ne gère pas le travail de fond proactif ("avancer sur les factures")
- ❌ Ne gère pas les relances ("ça fait 3 jours que Sopra n'a pas répondu")
- ❌ Ne gère pas les deadlines qui approchent

**Hybride (events + crons périodiques)**
- Event-driven pour les stimuli externes (webhook Gmail, message Telegram)
- Cron périodique pour le travail de fond (toutes les 15min ? 1h ?)
  → "Vérifie les dossiers, avance ce qui peut avancer, relance ce qui doit l'être"
- ✅ Probablement le bon compromis
- ❌ Les détails restent flous (quelle fréquence ? quel prompt pour le cron ?)

### La question du "manager Claude"
Qui décide quel dossier est prioritaire quand il y a un event ? Qui route ?

**Option A : Code simple (pas de routing intelligent)**
Chaque event est donné à un Claude avec tout le contexte nécessaire.
Pas de routing — Claude décide lui-même ce qu'il en fait.
- ✅ Ultra simple, pas de logique métier dans le code
- ❌ Si l'event concerne plusieurs dossiers, comment le découper ?

**Option B : Claude "manager" (triage rapide)**
Un Claude léger reçoit l'event, décide : quel dossier ? urgent ? lancer un worker ?
- ✅ Intelligent, gère l'inattendu, pas de règles à maintenir
- ❌ Chaque décision de routing = une session Claude (10-30s, mais on a dit que c'est pas grave)
- ❌ Ajoute une couche

**Pas tranché.** La vitesse n'est pas un critère (principe #1), donc le coût en temps
d'un triage Claude n'est pas un problème. Mais est-ce que la complexité ajoutée
d'un "manager" en vaut la peine ? Peut-être que pour commencer, "chaque event =
un Claude qui le gère" suffit, et on ajoute un manager si on voit que ça marche pas.
