# Analyse des 8 tâches de test — 15 mars 2026

## Contexte

8 tâches lancées en parallèle via le bouton "Test tasks" pour valider le flow complet d'Alfred. Chaque tâche cible des features spécifiques (Camoufox, Gmail, Bitwarden, récurrence, confirm mode, etc.).

---

## Résultats par tâche

### T1 — Browse Cyprus tax (Camoufox, artifacts)

**Résultat : OK avec obstacles**

- Camoufox utilisé correctement (pas de fallback Playwright/Chrome)
- `tax.gov.cy` ne résout pas (DNS), `mof.gov.cy` SSL invalide → Claude a pivoté sur 4 sources alternatives (cyexpats, cyprustaxleader, cmarkou, cyprusaccountants)
- Google bloqué par CAPTCHA → fallback DuckDuckGo en navigation directe
- `web_search` macro DuckDuckGo cassée (`url or macro required`) → workaround URL directe
- Profil Camoufox corrompu ("newer version") → Claude l'a renommé et recréé, mais ça a supprimé les cookies sauvegardés pour tous les agents
- Artifact produit : `deadlines-chypre-2026.md` (128 lignes, bon contenu)
- state.md : TERMINÉ avec journal détaillé
- `/exit` : **NON**

**Bugs :** Camoufox profile corruption (systémique), `/exit` pas fait, accents mangés dans state.md

---

### T2 — GitHub login (Bitwarden, 2FA checkpoint)

**Résultat : Shortcut — test invalidé**

- Claude a découvert que `gh` CLI était déjà authentifié → a utilisé `gh api` au lieu du browser
- Bitwarden chargé, credentials récupérés... mais jamais utilisés (pas de login browser)
- 2FA jamais rencontré → pas de checkpoint créé
- Artifact : `github-repos.md` produit via API (5 repos listés)
- state.md : TERMINÉ
- `/exit` : **NON**

**Bugs :** Contourne le flow browser+login qu'on voulait tester, `/exit` pas fait

---

### T3 — Email envoi + attente réponse (Gmail, event-driven)

**Résultat : KO**

- Gmail MCP : draft créé, **pas envoyé** (seul `gmail_create_draft` disponible)
- Fallback osascript Mail.app : retourne `true` mais probablement pas fonctionnel
- state.md : EN COURS, dit "en attente de réponse" mais aucun mécanisme de détection
- Pas de checkpoint.md malgré le blocage
- Session idle au prompt au lieu de /exit
- `/exit` : **NON**

**Bugs :** Gmail MCP sans send (bloquant), pas de checkpoint, pas de /exit, aucune des 3 features testées ne fonctionne

---

### T4 — Bitcoin récurrent (patrol/checkup)

**Résultat : Partiel — mauvaise stratégie de récurrence**

- Camoufox utilisé correctement, prix Bitcoin récupéré ($71,431)
- Vérification #1 faite, state.md mis à jour
- Claude reste idle dans la session et utilise `CronCreate` interne au lieu de /exit + patrol
- Dit explicitement : "Les 3 vérifications doivent se faire dans cette même session"
- Si la session crashe ou idle-timeout → checks 2-3 perdus
- `/exit` : **NON**

**Bugs :** Ne comprend pas l'architecture patrol, session idle pendant des heures, fragile, `/exit` pas fait

---

### T5 — Mode confirm (checkpoint, approbation)

**Résultat : OK — seule tâche fonctionnelle à 100%**

- Dossier créé en mode confirm
- Pas de session lancée (correct)
- state.md : EN COURS, MODE CONFIRM
- Pas de checkpoint (normal, pas encore de session)
- Pas d'artifacts (normal)

**Bugs :** Aucun bug technique. Mais problème UX : le dossier n'apparaît pas sur la Home et la page détail n'a pas de bouton "Lancer" visible.

---

### T6 — Recherche comparative facturation (workflow long)

**Résultat : Excellent travail, mauvaise discipline**

- 5 sub-agents lancés en parallèle (un par outil) — impressionnant
- Rapport de 348 lignes (17.5KB) avec pricing exact, avis sourcés, comparatif par profil
- 8 updates ciblés après retour des agents pour affiner les données
- state.md : TERMINÉ mais journal en une seule entrée (pas progressif)
- Artifact : `comparatif-facturation.md` — qualité excellente
- `/exit` : **NON**

**Bugs :** `/exit` pas fait, journal pas incrémental

---

### T7 — Monitoring email conditionnel (Gmail watch)

**Résultat : Fonctionnel mais fragile**

- Gmail MCP lecture fonctionne : `search_emails` avec query `subject:URGENT newer_than:1d`
- 3 vérifications faites toutes les 10 minutes, loguées dans state.md
- Utilise `/loop` + `CronCreate` interne → même problème que T4 (session reste ouverte)
- Pas de logique d'expiration après 2h
- Si un email URGENT arrive → devrait envoyer un résumé mais Gmail MCP ne peut pas envoyer
- `/exit` : **NON** (intentionnel ici, mais mauvaise stratégie)

**Bugs :** Récurrence par session idle (fragile), pas d'expiration, Gmail send manquant

---

### T8 — LinkedIn cross-outils (browser + email + fichier)

**Résultat : Le plus impressionnant techniquement**

- Camoufox sur LinkedIn : succès (anti-détection fonctionne)
- Login via Bitwarden, MFA code récupéré via Gmail MCP, saisi automatiquement
- Session sauvegardée sous `linkedin-lolo` (78 cookies)
- URL profil corrigé (`laurentdenblyden` → `loan-denblyden`)
- Google CAPTCHA → fallback WebSearch
- 3 conférences trouvées : React Paris, CityJS London, JSNation Amsterdam
- Artifact : `conferences-2026.md` (48 lignes)
- Email : **draft seulement** (Gmail MCP send manquant)
- `/exit` : **NON**

**Bugs :** Email draft pas envoyé, `/exit` pas fait, mot de passe LinkedIn visible en clair dans l'historique tmux

---

## Problèmes systémiques

### 1. `/exit` jamais exécuté (7/7 sessions)

Aucune session n'a fait `/exit` après avoir terminé. Elles marquent toutes TERMINÉ dans state.md puis restent idle au prompt. Le workspace CLAUDE.md est explicite ("Quitter avec `/exit`") mais n'est pas suivi.

**Impact :** Sessions zombie, UI incohérente (Terminé + Session active), pas de cleanup automatique, pas de notifications.

### 2. Hooks Stop ne firent jamais

Les hooks définis dans `settings.json` et `settings.local.json` au niveau projet ne sont pas chargés par les sessions Claude Code lancées depuis `workspace/<dossier>/`. Seuls les hooks de plugins sont actifs.

Testé : `settings.json`, `settings.local.json`, global `~/.claude/settings.local.json`, avec et sans `matcher`, avec et sans `--dangerously-skip-permissions`. Résultat : **aucun hook command ne fire**.

**Impact :** Aucun safety net — pas de détection DONE/BLOCKED automatique, pas de cleanup, pas de notifications.

### 3. Gmail MCP ne peut pas envoyer (3/7 tâches bloquées)

Le package `@gongrzhe/server-gmail-autoauth-mcp` n'expose que `gmail_create_draft`. Les tâches T3, T7, T8 ont toutes créé des brouillons sans pouvoir les envoyer. T3 a tenté un fallback osascript/Mail.app (fragile).

**Impact :** Toute tâche nécessitant l'envoi d'email échoue.

### 4. Claude ne comprend pas l'architecture patrol

Pour les tâches récurrentes (T4, T7), Claude garde la session ouverte avec `CronCreate` interne au lieu de faire /exit et laisser le patrol relancer. Il dit : "Les vérifications doivent se faire dans cette même session." Le workspace CLAUDE.md ne mentionne pas le patrol.

**Impact :** Sessions idle pendant des heures, fragiles (crash = perte), gaspillage de ressources.

### 5. Camoufox profile corruption

Le profil par défaut Camoufox était incompatible ("newer version"). Claude l'a corrigé en le renommant, mais ça a supprimé les cookies sauvegardés de tous les agents. Le restart du serveur n'avait pas résolu le problème de fond.

---

## Problèmes UI

### 1. Dossier confirm invisible sur la Home

Le dossier `prpare-un-email-pour-mon-comp-2bbl` en mode confirm n'apparaît nulle part sur la Home. Pas de section "En attente d'approbation". L'utilisateur ne sait pas qu'il a un dossier à approuver.

### 2. Dossiers terminés + session active (contradiction)

3 dossiers affichent "Terminé" en badge + "Session active" dans la sidebar. Incohérence directe visible — conséquence du bug `/exit`.

### 3. Titres = slugs illisibles

Les titres affichés sont des slugs : `va-sur-le-site-du-department-o-0u2u`, `prpare-un-email-pour-mon-comp-2bbl`. Les accents sont mangés (`prpare`, `vrifie`). Le `generateTitle` ne produit pas de résultats lisibles.

### 4. Activité récente toujours vide

"Rien à signaler" malgré 7 sessions actives depuis 20+ minutes. Aucune notification — ni completion, ni checkpoint, ni erreur. Lié aux hooks qui ne firent pas (pas de SessionEnd → pas de notification).

### 5. Améliorations vide (0 détectées)

Les sessions n'écrivent pas dans `_gaps/gaps.md` malgré les obstacles rencontrés (Gmail sans send, CAPTCHA, profile corruption). Le workspace CLAUDE.md ne mentionne pas les gaps.

### 6. Pas de bouton "Lancer" pour confirm mode

La page détail du dossier confirm n'a pas de bouton clair pour approuver/lancer. Seul le champ instruction en bas est disponible. L'UX du flow confirm est inutilisable.

---

## Matrice de résultats

| Tâche | Camoufox | Gmail | Bitwarden | Artifacts | state.md | /exit | Checkpoint | Récurrence |
|-------|----------|-------|-----------|-----------|----------|-------|------------|------------|
| T1 Cyprus tax | OK | — | — | OK | OK | NON | — | — |
| T2 GitHub | Skip (gh CLI) | — | OK (unused) | OK | OK | NON | NON (skip) | — |
| T3 Email | — | KO (draft) | — | — | Partiel | NON | NON | NON |
| T4 Bitcoin | OK | — | — | Partiel | OK | NON | — | KO (idle) |
| T5 Confirm | — | — | — | — | OK | — | — | — |
| T6 Facturation | — (WebSearch) | — | — | OK | OK | NON | — | — |
| T7 Email watch | — | Lecture OK | — | — | OK | NON | — | KO (idle) |
| T8 LinkedIn | OK | KO (draft) | OK | OK | OK | NON | — | — |

---

## Priorités de fix

1. **Hooks Stop** — Blocker. Sans ça, aucun cleanup automatique, aucune notification, aucun safety net.
2. **`/exit` enforcement** — Critique. Renforcer le CLAUDE.md, ou implémenter un watchdog externe.
3. **Gmail MCP send** — Bloquant pour 40% des tâches. Remplacer le MCP ou ajouter un tool send.
4. **Architecture patrol dans CLAUDE.md** — Expliquer aux sessions comment la récurrence fonctionne.
5. **UI : confirm mode** — Rendre le dossier visible sur la Home + bouton Lancer.
6. **UI : titres lisibles** — Fixer generateTitle ou utiliser un fallback propre.
7. **UI : cohérence Terminé/Session active** — Conséquence auto-résolue si /exit et hooks marchent.
8. **Gaps/améliorations** — Ajouter l'instruction dans workspace/CLAUDE.md.
