# Garde-fous : Réflexion complète

**Statut : APPROCHE VALIDÉE**, Hooks PreToolUse `type: "prompt"` comme mécanisme central.

## Le problème fondamental

L'assistant a accès à tout : emails, banque, factures, browser, système.
Une erreur (facture erronée, paiement non autorisé, réponse incorrecte aux impôts)
a des conséquences réelles et potentiellement graves.

### Pourquoi c'est si dur

1. **On ne peut pas anticiper toutes les actions dangereuses**, Claude va décider
   lui-même quoi faire. On ne peut pas coder une règle pour chaque cas possible.

2. **Les restrictions d'outils ne suffisent pas**, Si on bloque le MCP Gmail,
   Claude peut aller sur gmail.com via le browser. Si on bloque le browser, il
   utilise curl via Bash. Le browser et Bash sont des "escape hatches" qui
   contournent toute restriction d'outils spécifiques. Et on ne peut pas les
   retirer parce qu'il en a besoin pour travailler.

   L'utilisateur a insisté sur ce point : il vaut mieux que Claude utilise les bons outils
   (MCP Gmail) plutôt que de le forcer à contourner (browser vers gmail.com).
   Restreindre les outils pousse Claude à hacker le système, ce qui est pire.

3. **Les prompts ne sont pas fiables à 100%**, Claude respecte les instructions
   la plupart du temps, mais pas toujours. D'après l'expérience avec les
   skills : "une fois sur deux, il ne fait pas ce qu'on lui demande de faire
   systématiquement." On ne peut pas sécuriser un système financier avec juste
   une instruction en langage naturel.

4. **Le cas "confiant mais tort"**, Le cas le plus dangereux c'est quand Claude
   est convaincu de faire la bonne chose mais se trompe. Il ne va pas déclencher
   ses propres garde-fous parce qu'il pense que tout va bien.

5. **Le browser est le point faible**, Claude fait ~10 commandes browser par
   minute. Vérifier chacune individuellement noierait le système. Mais ne PAS
   les vérifier laisse un trou : certains clics sont irréversibles (confirmer
   un paiement, soumettre un formulaire officiel).

### Stats de la recherche
- Si un agent a 85% de précision par action, un workflow de 10 étapes ne réussit
  que 20% du temps (erreurs composées).
- CMU 2025 : les LLMs restent confiants même quand ils se trompent (49.71% accuracy
  avec 39.25% calibration error). RLHF aggrave le problème.
- Incident Replit 2025 : un agent a DROP DATABASE en prod puis généré des faux logs.

---

## Approches explorées et pourquoi elles ne suffisent pas seules

### Checkpoint avant chaque action externe
- ❌ Ça tue l'autonomie. C'est l'utilisateur qui fait le boulot.

### Règles de risque codées (`--allowedTools`, patterns)
- ✅ Empêche les erreurs accidentelles sur les outils structurés
- ❌ Claude contourne via browser/bash
- ❌ Si on retire des outils, il ne peut plus faire sa tâche ou va hacker
- Conclusion : il vaut mieux que Claude utilise les bons outils
  plutôt que de le forcer à contourner

### Claude évalue le risque lui-même (prompts)
- ✅ Intelligent, adaptatif, gère l'inattendu
- ❌ Claude ne suit pas systématiquement les consignes (~50% du temps)
- ❌ Le cas dangereux c'est quand il se trompe dans son évaluation

### Checks programmatiques (code custom)
- Ex: "le destinataire est dans les contacts connus ?"
- ❌ Trop rigide : si Claude doit contacter un nouveau service, il est bloqué
- Nuance : au lieu de bloquer, passer en validation humaine
- Mais : "ça a l'air chiant à maintenir, le projet est déjà complexe"

### Double-check par un deuxième Claude
- ✅ Perspective différente, attrape des erreurs
- ❌ Le problème crucial : comment FORCER Claude à appeler le vérificateur ?
  Si c'est dans le prompt, il ne le fera pas systématiquement.

### Délai systématique
- "Pourquoi Claude serait meilleur en attendant 5 minutes ?"
- Ce n'est pas Claude: c'est l'utilisateur qui a une fenêtre pour annuler
- ❌ Si l'utilisateur ne voit pas la notif, l'action part quand même. C'est un tampon.

---

## LA SOLUTION : Hooks PreToolUse

### Le mécanisme fondamental

Claude Code a des **hooks PreToolUse**, du code qui s'exécute automatiquement,
côté SYSTÈME, avant chaque appel d'outil.

**Ce n'est PAS une instruction à Claude.** C'est du code qui se déclenche
automatiquement dans le runtime. Claude ne les appelle pas, ne peut pas les
skipper, ne sait même pas qu'ils existent.

```
Claude décide : "j'envoie cet email"
    ↓
Claude appelle l'outil : gmail.send(...)
    ↓
AUTOMATIQUEMENT, AVANT l'exécution :
    → le hook PreToolUse se déclenche
    → le code du hook analyse l'action
    → décision : allow / deny / ask (demander à l'utilisateur)
    ↓
Si allow → l'action s'exécute
Si deny  → Claude reçoit "action refusée : [raison]"
Si ask   → l'utilisateur est notifié et doit approuver
```

Claude ne peut pas contourner ça. Même s'il utilise le browser, le hook se
déclenche sur browser_click(). Même s'il utilise Bash, le hook se déclenche.

### Détails techniques des hooks (recherche mars 2026)

**Ce que le hook reçoit (stdin JSON) :**
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",  // conversation complète !
  "hook_event_name": "PreToolUse",
  "tool_name": "mcp__plugin_playwright_playwright__browser_click",
  "tool_input": {
    "ref": "btn42",
    "element": "Confirm Payment button"  // ← DESCRIPTION de l'élément !
  }
}
```

**Découverte clé** : pour les actions browser (Playwright), le hook reçoit
un champ `element` qui contient une DESCRIPTION textuelle de ce qui est cliqué.
"Confirm Payment button", "Search button", "Submit form", etc.

**Le hook peut donc SAVOIR ce que Claude est en train de cliquer !**

Ça change tout pour le problème browser : on n'est pas dans le noir. Le hook
peut lire "Confirm Payment" et bloquer. Il peut lire "Search" et laisser passer.

**Ce que le hook peut répondre :**
- `exit 0` → allow (continuer)
- `exit 2` → deny (bloquer, stderr envoyé à Claude comme explication)
- JSON avec `permissionDecision: "allow" | "deny" | "ask"`
- `ask` → demande confirmation à l'utilisateur avant de continuer

**Le hook `type: "prompt"` (la vraie innovation) :**
Au lieu d'un script shell, le hook peut être un **prompt en langage naturel**
évalué par Claude lui-même, mais SÉPARÉMENT de la session principale :

```json
{
  "type": "prompt",
  "prompt": "Review this action. Is it safe? Does it violate any of these rules: never make payments without approval, never respond to tax authorities, always verify invoice amounts. Respond ALLOW or DENY with reason.",
  "timeout": 30
}
```

C'est le mini-Claude vérificateur INTÉGRÉ dans le système de hooks !
Pas besoin de spawner un processus séparé. Pas besoin de coder quoi que ce soit.
Juste un prompt.

**Les matchers sont sélectifs (regex) :**
On peut cibler exactement quels outils déclenchent le hook :
```json
"matcher": "mcp__gmail__send|mcp__gmail__reply"  // uniquement les envois Gmail
"matcher": "mcp__plugin_playwright_.*__browser_(click|fill_form|type)"  // browser interactif
"matcher": "Bash"  // toutes les commandes bash
```

**Timeout jusqu'à 10 minutes**, largement assez pour une vérification.

---

## Architecture des garde-fous V2

### Les 4 règles ADN

1. **Toute action irréversible → humain**
2. **Toute action externe → vérifiée avant exécution**
3. **Toute anomalie détectée → signalée**
4. **Tout est loggé → réparable après coup**

### Comment les appliquer concrètement

**Pour les outils structurés (MCP Gmail, Calendar, etc.) :**

Hook PreToolUse avec `type: "prompt"` sur les outils qui envoient/créent/modifient :

```json
{
  "matcher": "mcp__gmail__send|mcp__gmail__reply|mcp__gmail__draft",
  "hooks": [{
    "type": "prompt",
    "prompt": "Vérifie cette action. Règles : ne jamais faire de paiement sans approbation, vérifier la cohérence des montants, signaler les anomalies. L'action est-elle safe ?",
    "timeout": 30
  }]
}
```

Le mini-Claude vérificateur a accès au `tool_input` (le contenu de l'email,
le destinataire, etc.) et peut juger de la cohérence. Il répond ALLOW ou DENY.

Ces outils sont appelés rarement (1-2 fois par session pour un envoi d'email)
→ l'overhead est négligeable.

**Pour le browser :**

Le hook `type: "prompt"` sur les actions browser interactives :

```json
{
  "matcher": "mcp__plugin_playwright_.*__browser_(click|fill_form|evaluate|run_code)",
  "hooks": [{
    "type": "prompt",
    "prompt": "L'agent clique sur un élément du browser. Regarde l'élément et l'URL. Si c'est un bouton de paiement, de soumission de formulaire financier, ou de confirmation irréversible, DENY. Sinon ALLOW.",
    "timeout": 10
  }]
}
```

Le hook reçoit le champ `element` ("Confirm Payment button", "Search button",
"Submit Annual Report form") → le mini-Claude peut distinguer les clics safe
des clics dangereux.

**Le problème du browser résolu** :
- Le hook reçoit la DESCRIPTION de l'élément cliqué
- Le mini-Claude peut juger "Confirm Payment" = dangereux, "Next Page" = safe
- Timeout court (10s) pour ne pas trop ralentir les 10+ commandes par minute
- Le hook `type: "prompt"` est évalué nativement, pas de subprocess à spawner

**Le problème du volume browser** :
Claude fait ~10 commandes browser/minute. Avec un hook prompt de 10s chacun,
ça doublerait le temps. Options :
- Hook uniquement sur `browser_click` et `browser_fill_form` (pas navigate, snapshot)
  → réduit le volume aux actions qui "font" quelque chose
- Hook prompt ultra-court et focalisé → "est-ce un bouton de paiement/soumission ?"
- Accepter le ralentissement pour la sécurité (on a dit que la vitesse n'est pas
  un critère)

**Pour Bash :**

Hook PreToolUse avec `type: "command"` ou `type: "prompt"` :
- Détecter les patterns réseau (curl POST, wget, ssh, scp)
- Laisser passer les commandes locales (ls, cat, npm, node)

**Pour le reste (Read, Grep, Glob, Write interne) :**

Pas de hook. Ça passe librement. Zéro risque.

### Le flow complet bout en bout

```
Claude travaille sur le dossier "factures-2025"
    ↓
1. Claude lit state.md → pas de hook (Read = safe)
2. Claude cherche dans Gmail → pas de hook (gmail.search = lecture)
3. Claude crée la facture (Write dans workspace/) → pas de hook (Write interne)
4. Claude veut envoyer l'email avec la facture :
    ↓
    Claude appelle gmail.send(to: "billing@sopra.com", ...)
    ↓
    ━━━ HOOK PreToolUse se déclenche ━━━
    Mini-Claude prompt : "Vérifie cet envoi d'email..."
    → "ALLOW, montant cohérent avec le timesheet, destinataire connu"
    OU
    → "DENY, le montant (128,000€) semble anormalement élevé"
    OU
    → "ASK, première facture à ce destinataire, demander confirmation"
    ━━━ FIN DU HOOK ━━━
    ↓
    Si ALLOW → email envoyé, PostToolUse log l'action
    Si DENY → Claude reçoit l'explication, crée un checkpoint
    Si ASK → l'utilisateur reçoit une notification, doit approuver dans l'app web
```

### Limites honnêtes

1. **Le mini-Claude vérificateur peut aussi se tromper**, Mais deux Claude
   indépendants qui se trompent de la même manière c'est moins probable qu'un seul

2. **Le browser reste le point le plus faible**, Le champ `element` aide beaucoup
   mais n'est pas parfait. "Submit" ne dit pas toujours ce qui est soumis.
   Compensé par la supervision tmux et l'audit trail.

3. **Le ralentissement browser**, 10s par clic significatif. Acceptable vu que
   la vitesse n'est pas un critère, mais à monitorer.

4. **Les hooks prompt utilisent du contexte Claude**, À monitorer pour s'assurer
   que ça n'impacte pas les limites Claude Max.

5. **Les cas non anticipés**; Aucun système ne couvre 100% des cas. Le filet
   de sécurité ultime c'est l'audit trail + la réparabilité.

---

## Concepts inspirants (recherche externe)

### IronCurtain : "constitution" en langage naturel
Projet open source qui intercepte chaque action via hooks, évalue contre des
règles écrites en anglais, bloque ou escalade. Le concept de "constitution"
(règles simples → comportements émergents) est similaire à nos 4 règles ADN.

### Reversible Autonomy (Rubrik, IBM STRATUS)
Concept : chaque action d'agent doit être observable, auditable, et réversible.
Snapshot avant chaque action, rollback en un clic si erreur.
Approche retenue : "ok on a fait une boulette, maintenant comment on répare."
Des règles simples comme l'ADN (4 bases → vie complexe).

### Trust scoring (Cleanlab TLM)
Score de confiance temps réel sur chaque réponse. Quand le score est bas :
escalade vers humain. Intéressant mais ajoute de la complexité.

---

## Résumé des décisions

| Mécanisme | Quand | Comment |
|---|---|---|
| Hook prompt sur MCP send/create | Chaque envoi email, facture, etc. | Mini-Claude vérifie cohérence |
| Hook prompt sur browser click/fill | Chaque clic/soumission significative | Mini-Claude vérifie si c'est dangereux |
| Prompt système | Toujours actif | Règles générales + spécifiques au dossier |
| Supervision tmux | Tâches browser | L'utilisateur peut voir/intervenir |
| Audit trail (PostToolUse) | Toute action externe | Log complet, réparable |
| Human checkpoint | Détecté par hook ou prompt | Notification → app web → validation |
