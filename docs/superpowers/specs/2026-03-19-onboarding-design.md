# Onboarding Contextuel Progressif: Design Spec

**Date:** 2026-03-19
**Goal:** Drastically improve the first-run experience for beginners while keeping the zen flow.

## Problem

The current web app drops users into an empty Home page with no guidance. Terminology is opaque ("Dossier", "Self-analyses", "Confirm mode"), the Nouveau page has a blank textarea with no examples, and there's no feedback after creating a task. Navigation exposes advanced features (Terminal, Memory, Améliorations) that are useless on day 1.

## Approach: Contextual Progressive Onboarding

No modals, no multi-step tutorials. The app itself guides users through contextual help that appears when and where it's needed, and disappears once content exists.

## Components

### 1. Welcome Card (Home, first-run)

Integrated card at the top of Home when `localStorage` has no `onboarding-seen` AND 0 dossiers exist. Shows:
- One-line value prop ("Ton assistant administratif personnel")
- 3 pillars: Tâches / Autonome / Contrôle
- Single CTA: "Créer ma première tâche" → /nouveau
- Dismiss link: "Explorer"
- Disappears when user clicks "Explorer" or creates a dossier

### 2. Rich Empty States (Home sections)

Replace "No dossiers" with contextual explanations:
- "En attente de toi" → "Quand l'assistant a besoin de ton avis, les tâches apparaissent ici."
- "En attente de réponse" → "Les tâches en attente d'un tiers s'affichent ici."
- "Suggestions" → "L'assistant surveille tes emails et messages. Les nouvelles tâches détectées apparaîtront ici."
- Active/Completed tabs → "Tes tâches en cours apparaîtront ici." + CTA button

### 3. Nouveau Page: Examples + Explanations

- Clickable template chips above textarea (4 examples)
- Clicking a chip pre-fills the textarea with editable example text
- Inline explanation under confirm mode checkbox
- Confirm mode checked by default
- Post-submit: brief explanation of what happens next

### 4. Post-Creation Banner (DossierDetail)

Dismissable banner on first dossier creation:
"L'assistant travaille sur ta tâche. Tu peux suivre sa progression ici. Il t'enverra une notification Telegram quand il aura besoin de toi."

### 5. Humanized Terminology

| Current (EN) | New (EN) | Current (FR) | New (FR) |
|---|---|---|---|
| Dossier | Task | Dossier | Dossier |
| Self-analyses | Improvements | Auto-analyses | Améliorations |
| Terminal | Processes | Terminal | Processus |
| Confirm before external actions | Ask me before acting | Confirmer avant actions externes | Me demander avant d'agir |
| Active (sidebar) | Working | Actif | En cours |
| Idle (sidebar) | Paused | Inactif | En pause |

### 6. Progressive Navigation

Nav items for Processes, Améliorations, Memory are greyed out with tooltip when empty. They unlock naturally when content exists (first process launched, first amélioration detected, first memory created).

### 7. Help Tooltips

Reusable `HelpTooltip` component with (?) icon + popover for key terms: Dossier, En attente de toi, Suggestion, Amélioration.

## Files Impacted

**New files:**
- `apps/web/src/features/home/WelcomeCard.tsx`
- `apps/web/src/features/nouveau/ExampleChips.tsx`
- `apps/web/src/shared/HelpTooltip.tsx`

**Modified files:**
- `apps/web/src/features/home/Home.tsx`
- `apps/web/src/features/nouveau/Nouveau.tsx`
- `apps/web/src/features/dossiers/DossierDetail.tsx`
- `apps/web/src/features/dossiers/Sidebar.tsx`
- `apps/web/src/shared/Layout.tsx`
- `apps/web/src/shared/DesktopNav.tsx`
- `apps/web/src/shared/MobileNav.tsx`
- `apps/web/src/shared/i18n/locales/fr.json`
- `apps/web/src/shared/i18n/locales/en.json`

## Not In Scope

- CLI setup changes
- Backend API changes
- Business logic changes
- Existing pages once populated
