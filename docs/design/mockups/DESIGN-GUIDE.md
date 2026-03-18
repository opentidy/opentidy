# Alfred — Guide de Design UI

Reference visuelle pour l'implementation frontend. Les mockups dans ce dossier sont la source de verite pour le design.

**Fichier HTML interactif** : `final-v2.html` (ouvrir dans un browser pour naviguer entre les vues)
**Screenshots** : captures PNG de chaque vue (desktop + mobile)

## Theme global

- **Dark mode** uniquement — fond `#0f1117` (quasi-noir bleu), cartes `#1a1d27` (gris fonce)
- **Accent primaire** : bleu `#3b82f6` (logo, icon rail actif, liens)
- **Accent secondaire** : vert `#22c55e` (boutons "Creer le dossier", "Lancer", statut actif)
- **Danger/urgent** : rouge `#ef4444` (badges "Urgent", "Intervention", points d'etat rouge)
- **Warning** : orange `#f59e0b` (badges "Checkpoint", "Bloque MFA", "Attente")
- **Normal** : bleu `#3b82f6` (badges "Normal", "En cours")
- **Termine** : gris `#6b7280` (texte et badges des dossiers termines, opacite reduite)
- **Texte** : blanc `#f9fafb` (titres), gris `#9ca3af` (secondaire), gris `#6b7280` (tertiaire)
- **Font** : system-ui / -apple-system (pas de font custom)
- **Border radius** : `12px` pour les cartes, `8px` pour les badges, `full` pour les boutons ronds

## Navigation

### Desktop — Icon rail a gauche
- Rail vertical etroit (~60px), icones SVG, fond meme que la barre de titre
- Icones : Home, Dossiers, Terminal, Ameliorations (+ avatar utilisateur en bas)
- Page active = icone en bleu avec fond subtil
- Barre de titre macOS en haut (traffic lights)

### Mobile — Tab bar en bas
- 5 onglets : Home, Dossiers, Nouveau (+), Terminal, Plus (...)
- Icones + labels en dessous
- Onglet actif = texte et icone en bleu

### Header desktop
- Titre de la page a gauche + badge compteur ("3 sessions")
- Statut sweep a droite ("Sweep 5 min - OK" en texte gris)
- Bouton "+ Nouveau dossier" vert a droite

## Page 1 : Home — Actions en attente

**Screenshot** : `alfred-mockup-home-actions.png`

**Structure (3 sections empilees)** :

### Section "Pour toi" (point rouge)
- Separateur avec point rouge + "Pour toi — N actions"
- **Cartes checkpoint** : bordure gauche orange, titre + badge "Checkpoint" (orange), timestamp a droite, description en gris, bouton "Ouvrir le terminal" (outline gris)
- **Cartes intervention** : bordure gauche rouge, badge "Intervention" (rouge), bouton "Ouvrir le terminal"

### Section "Suggestions" (losange bleu)
- Separateur avec losange bleu + "Suggestions — N nouvelles"
- **Cartes suggestion** : bordure gauche coloree selon urgence (rouge=urgent, bleu=normal)
- Badge urgence a cote du titre
- Source + timestamp a droite ("Sweep - il y a 1h")
- Description en gris
- 2 boutons : "Creer le dossier" (vert, large) + "Ignorer" (gris, outline)

### Section "En fond"
- Separateur texte gris "En fond — l'assistant travaille"
- **Cartes session** : plus compactes, juste titre + statut a droite ("Verification documents - 4 min")
- Point vert (actif) ou bleu (idle) ou gris (termine)

### Section "Activite recente"
- Titre + lien "Voir les logs complets" (bleu, fleche)
- Lignes simples : heure a gauche (gris), point colore, description

## Page 2 : Home — Tout roule (etat zen)

Quand il n'y a aucune action requise :
- Grand losange bleu centre
- "Tout roule" en gros texte
- "N sessions actives - aucune action requise"
- Statut sweep en dessous
- Cartes session compactes (juste nom + duree)
- 2 boutons : "Voir tous les dossiers" (outline) + "+ Nouveau dossier" (vert)

## Page 3 : Dossiers

**Screenshot** : `alfred-mockup-dossiers.png`

- **Filtres en haut** : 3 boutons pill ("Actifs (4)", "Termines (8)", "Bloques (1)")
- **Barre de recherche** + bouton "+ Nouveau"
- **Liste de cartes** — meme style que partout :
  - Point de statut colore (vert=actif, orange=bloque, gris=termine)
  - Titre + badge statut
  - Info session/temps a droite
  - Description en gris
  - Les termines ont une opacite reduite

### Mobile
- Filtres en pills horizontaux scrollables
- Cartes plus compactes (titre + badge + temps)

## Page 4 : Dossier detail

**Screenshot** : `alfred-mockup-dossier-detail.png`

### Layout desktop (2 colonnes)
**Colonne principale (gauche)** :
- **Breadcrumb** : "Dossiers / Factures Sopra 2025" + badge "En cours" + indicateur "Session active"
- **Banniere checkpoint** (si present) : fond sombre, bordure rouge, titre "Checkpoint — ...", bouton "Ouvrir le terminal"
- **Rendu du state.md** : sections "Objectif", "Fait" (items verts avec check), "Reste a faire" (items orange/rouges avec cercle)

**Colonne laterale (droite, ~250px)** :
- **Session** : indicateur vert "Active - 12 min", description courte
- **Fichiers** : liste avec icones (doc pour .md, paperclip pour .pdf). checkpoint.md en jaune.
- **Historique** : timeline verticale (heure + description)

**Barre d'instruction en bas** (sticky) :
- Input texte "Donner une instruction a ce dossier..."
- Bouton paperclip (fichiers)
- Bouton "Envoyer" (rouge/rose)

### Mobile
- Tabs : "Etat", "Fichiers (4)", "Historique"
- Banniere checkpoint en haut
- Contenu du tab actif en dessous

## Page 5 : Terminal

**Screenshot** : `alfred-mockup-terminal.png`

- **Onglets sessions** en haut : nom court + point de statut. Session avec MFA a un warning.
- **Terminal plein ecran** : fond noir, font monospace
  - Prefixe `claude>` en bleu pour les messages de Claude
  - `✓` en vert pour les succes
  - `⚠` en jaune/orange pour les warnings
  - Bloc "Intervention manuelle requise" encadre (fond plus clair, bordure)
  - Curseur clignotant `❯ █`
- **Barre de statut en bas** : nom de session + "tmux #N" a gauche, statut a droite ("Idle 20 min - Attente MFA" en orange)

### Mobile
- Meme layout, onglets plus compacts
- Terminal prend toute la largeur

## Page 6 : Nouveau dossier

**Screenshot** : `alfred-mockup-nouveau.png`

- **Titre** : "Nouveau dossier"
- **Sous-titre** : "Decris ce que tu veux. L'assistant cree le dossier et commence."
- **Textarea** grand : placeholder "Ex: Mets le bureau en vente sur 2ememain, prix 300€..."
- **Ligne d'options** : bouton "Fichiers" (paperclip) + checkbox "Valider avant actions externes" + bouton "Lancer" (vert)
- **Section "Recommandations de l'assistant"** : memes cartes suggestions que sur la Home (bordure gauche coloree, boutons Creer/Ignorer)

## Page 7 : Ameliorations

**Screenshot** : `alfred-mockup-ameliorations.png`

- **Header** : "Ameliorations" + badge compteur "3 detectees" + filtres "Ouverts" / "Resolus"
- **Cartes amelioration** : bordure gauche orange
  - Titre + date a droite
  - Description
  - Section "Impact" (texte sur fond subtil)
  - Section "Suggestion" (texte sur fond subtil)
  - Boutons : "Dossier: X →" (lien vers le dossier lie) + "Marquer resolu" (outline)

### Mobile
- Cartes plus compactes : titre, sous-titre court, date

## Principes de design

1. **Memes cartes partout** — checkpoint, suggestion, session, dossier, amelioration utilisent toutes le meme pattern de carte avec bordure gauche coloree
2. **Couleur = statut** — vert=actif/succes, orange=attente/warning, rouge=urgent/intervention, bleu=normal/info, gris=termine
3. **Desktop = information riche**, Mobile = essentiel uniquement
4. **Pas de table** — tout est en cartes empilees
5. **Actions toujours visibles** — les boutons d'action sont dans la carte, pas dans un menu
6. **Hierarchy par separateurs** — sections delimitees par une ligne avec icone + texte
