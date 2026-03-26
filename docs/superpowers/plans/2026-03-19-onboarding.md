# Onboarding Contextuel Progressif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contextual progressive onboarding to the web app so beginners understand what OpenTidy does, create their first task confidently, and discover features as they become relevant.

**Architecture:** No new routes or API changes. All changes are frontend-only: new components (WelcomeCard, ExampleChips, HelpTooltip), modified pages (Home, Nouveau, DossierDetail), updated navigation (DesktopNav, MobileNav), and enriched i18n files. Onboarding state is tracked via `localStorage`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, react-i18next, Zustand (read-only for counts), Vitest + @testing-library/react

---

### Task 1: i18n — Add all onboarding translation keys

**Files:**
- Modify: `apps/web/src/shared/i18n/locales/fr.json`
- Modify: `apps/web/src/shared/i18n/locales/en.json`

- [ ] **Step 1: Add onboarding keys to `fr.json`**

Add these keys to the existing JSON structure:

```json
{
  "nav": {
    "home": "Accueil",
    "terminal": "Processus",
    "analyses": "Améliorations",
    "memory": "Mémoire",
    "new": "Nouveau"
  },
  "status": {
    "active": "En cours",
    "idle": "En pause"
  },
  "onboarding": {
    "welcomeTitle": "Bienvenue sur OpenTidy",
    "welcomeDescription": "Ton assistant administratif personnel. Il gère tes tâches en arrière-plan et te prévient uniquement quand il a besoin de toi.",
    "pillarTasksTitle": "Tes tâches",
    "pillarTasksDescription": "Décris ce qu'il faut faire, l'assistant s'en occupe.",
    "pillarAutoTitle": "Autonome",
    "pillarAutoDescription": "Claude travaille tout seul en arrière-plan.",
    "pillarControlTitle": "Ton contrôle",
    "pillarControlDescription": "Tu gardes la main. Valide, modifie ou reprends à tout moment.",
    "createFirstTask": "Créer ma première tâche",
    "explore": "Explorer",
    "emptyWaitingUser": "Quand l'assistant a besoin de ton avis, les tâches apparaissent ici.",
    "emptyWaitingTiers": "Les tâches en attente d'un tiers (réponse email, rappel...) s'affichent ici.",
    "emptySuggestions": "L'assistant surveille tes emails et messages. Les nouvelles tâches détectées apparaîtront ici.",
    "emptyDossiers": "Tes tâches en cours apparaîtront ici.",
    "emptyCreateCta": "Crée ta première tâche",
    "postCreationBanner": "L'assistant travaille sur ta tâche. Tu peux suivre sa progression ici. Il t'enverra une notification Telegram quand il aura besoin de toi.",
    "navLockedProcesses": "Visible quand des tâches sont en cours",
    "navLockedAmeliorations": "S'affiche après quelques jours d'utilisation",
    "navLockedMemory": "L'assistant apprend au fil du temps"
  },
  "nouveau": {
    "confirmMode": "Me demander avant d'agir",
    "confirmModeHelp": "Activé : l'assistant te demande avant d'envoyer un email, passer un appel, ou agir auprès d'un tiers. Recommandé pour commencer.",
    "exampleSell": "Mettre en vente un meuble sur Marketplace",
    "exampleInvoice": "Relancer une facture impayée",
    "exampleInsurance": "Comparer des assurances habitation",
    "exampleDoctor": "Prendre rendez-vous chez le médecin",
    "exampleSellFull": "Mets mon bureau en vente sur Facebook Marketplace. Prix demandé : 300€. Décris l'objet comme un bureau en bois massif, bon état, dimensions 120x60cm. Utilise les photos du dossier.",
    "exampleInvoiceFull": "Relance la facture n°2025-042 envoyée à Acme Corp le 15 février. Montant : 1 200€. Envoie un email de rappel poli avec la facture en pièce jointe.",
    "exampleInsuranceFull": "Compare les offres d'assurance habitation pour un appartement 3 pièces à Paris, 65m². Je veux un tableau comparatif avec prix, franchises et garanties principales.",
    "exampleDoctorFull": "Trouve un créneau chez un médecin généraliste cette semaine, de préférence le matin. Quartier centre-ville. Prends le rendez-vous si possible.",
    "tryExample": "Essaie par exemple :"
  },
  "helpTooltip": {
    "dossier": "Une tâche administrative que l'assistant gère pour toi, de A à Z.",
    "waitingUser": "L'assistant est bloqué et a besoin de ta réponse pour continuer.",
    "suggestion": "Une tâche détectée automatiquement dans tes emails ou messages.",
    "amelioration": "Un point que l'assistant a identifié pour mieux te servir à l'avenir."
  }
}
```

Note: update the existing `nav`, `status`, and `nouveau.confirmMode` keys in place (don't duplicate). Add the new `onboarding`, `helpTooltip` sections, and the new `nouveau` keys.

Also update these existing keys for terminology consistency:
- `instruction.confirmMode`: FR → `"Me demander avant d'agir"`, EN → `"Ask me before acting"` (match `nouveau.confirmMode`)
- `ameliorations.title`: FR → `"Améliorations"`, EN → `"Improvements"` (match `nav.analyses`)
- `status.active`: FR → `"En travail"` (distinct from `status.inProgress` = `"En cours"`), EN → `"Working"`

- [ ] **Step 2: Add onboarding keys to `en.json`**

Same structure, English translations:

```json
{
  "nav": {
    "home": "Home",
    "terminal": "Processes",
    "analyses": "Improvements",
    "memory": "Memory",
    "new": "New"
  },
  "status": {
    "active": "Working",
    "idle": "Paused"
  },
  "onboarding": {
    "welcomeTitle": "Welcome to OpenTidy",
    "welcomeDescription": "Your personal admin assistant. It handles your tasks in the background and only notifies you when it needs you.",
    "pillarTasksTitle": "Your tasks",
    "pillarTasksDescription": "Describe what needs to be done, the assistant handles it.",
    "pillarAutoTitle": "Autonomous",
    "pillarAutoDescription": "Claude works on its own in the background.",
    "pillarControlTitle": "Your control",
    "pillarControlDescription": "You stay in charge. Review, modify, or take over anytime.",
    "createFirstTask": "Create my first task",
    "explore": "Explore",
    "emptyWaitingUser": "When the assistant needs your input, tasks will appear here.",
    "emptyWaitingTiers": "Tasks waiting for a third party (email reply, callback...) will show up here.",
    "emptySuggestions": "The assistant monitors your emails and messages. New tasks it detects will appear here.",
    "emptyDossiers": "Your active tasks will appear here.",
    "emptyCreateCta": "Create your first task",
    "postCreationBanner": "The assistant is working on your task. You can follow its progress here. It will notify you via Telegram when it needs you.",
    "navLockedProcesses": "Visible when tasks are running",
    "navLockedAmeliorations": "Appears after a few days of use",
    "navLockedMemory": "The assistant learns over time"
  },
  "nouveau": {
    "confirmMode": "Ask me before acting",
    "confirmModeHelp": "When enabled, the assistant asks you before sending emails, making calls, or taking actions that affect others. Recommended for getting started.",
    "exampleSell": "List furniture for sale on Marketplace",
    "exampleInvoice": "Follow up on an unpaid invoice",
    "exampleInsurance": "Compare home insurance options",
    "exampleDoctor": "Book a doctor's appointment",
    "exampleSellFull": "List my desk for sale on Facebook Marketplace. Asking price: €300. Describe it as a solid wood desk, good condition, 120x60cm. Use the photos from the folder.",
    "exampleInvoiceFull": "Follow up on invoice #2025-042 sent to Acme Corp on February 15. Amount: €1,200. Send a polite reminder email with the invoice attached.",
    "exampleInsuranceFull": "Compare home insurance quotes for a 3-room apartment in Paris, 65m². I want a comparison table with prices, deductibles, and key coverage.",
    "exampleDoctorFull": "Find a slot with a general practitioner this week, preferably in the morning. Downtown area. Book the appointment if possible.",
    "tryExample": "Try an example:"
  },
  "helpTooltip": {
    "dossier": "An administrative task that the assistant manages for you, from start to finish.",
    "waitingUser": "The assistant is stuck and needs your response to continue.",
    "suggestion": "A task automatically detected in your emails or messages.",
    "amelioration": "Something the assistant identified to serve you better in the future."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/shared/i18n/locales/fr.json apps/web/src/shared/i18n/locales/en.json
git commit -m "feat(web): add onboarding i18n keys for fr and en"
```

---

### Task 2: HelpTooltip — Reusable tooltip component

**Files:**
- Create: `apps/web/src/shared/HelpTooltip.tsx`
- Create: `apps/web/src/shared/HelpTooltip.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpTooltip from './HelpTooltip';

describe('HelpTooltip', () => {
  it('renders a (?) button', () => {
    render(<HelpTooltip text="Help text" />);
    expect(screen.getByRole('button')).toBeDefined();
    expect(screen.getByText('?')).toBeDefined();
  });

  it('shows tooltip text on click', () => {
    render(<HelpTooltip text="Explanation here" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Explanation here')).toBeDefined();
  });

  it('hides tooltip on second click', () => {
    render(<HelpTooltip text="Explanation here" />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByText('Explanation here')).toBeDefined();
    fireEvent.click(btn);
    expect(screen.queryByText('Explanation here')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/shared/HelpTooltip.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';

interface HelpTooltipProps {
  text: string;
}

export default function HelpTooltip({ text }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className="w-4 h-4 rounded-full border border-text-tertiary/40 text-text-tertiary text-[10px] leading-none flex items-center justify-center hover:border-accent hover:text-accent transition-colors"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-6 top-1/2 -translate-y-1/2 bg-card border border-border rounded-lg px-3 py-2 text-xs text-text-secondary shadow-lg whitespace-nowrap z-50">
          {text}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/shared/HelpTooltip.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/HelpTooltip.tsx apps/web/src/shared/HelpTooltip.test.tsx
git commit -m "feat(web): add reusable HelpTooltip component"
```

---

### Task 3: WelcomeCard — First-run welcome on Home

**Files:**
- Create: `apps/web/src/features/home/WelcomeCard.tsx`
- Create: `apps/web/src/features/home/WelcomeCard.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../shared/i18n/i18n';
import WelcomeCard from './WelcomeCard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('WelcomeCard', () => {
  it('renders welcome title and CTA', () => {
    render(<MemoryRouter><WelcomeCard /></MemoryRouter>);
    expect(screen.getByText(/Welcome to OpenTidy|Bienvenue sur OpenTidy/)).toBeDefined();
    expect(screen.getByText(/Create my first task|Créer ma première tâche/)).toBeDefined();
  });

  it('renders the 3 pillars', () => {
    render(<MemoryRouter><WelcomeCard /></MemoryRouter>);
    expect(screen.getByText(/Your tasks|Tes tâches/)).toBeDefined();
    expect(screen.getByText(/Autonomous|Autonome/)).toBeDefined();
    expect(screen.getByText(/Your control|Ton contrôle/)).toBeDefined();
  });

  it('navigates to /nouveau on CTA click', () => {
    render(<MemoryRouter><WelcomeCard /></MemoryRouter>);
    fireEvent.click(screen.getByText(/Create my first task|Créer ma première tâche/));
    expect(mockNavigate).toHaveBeenCalledWith('/nouveau');
  });

  it('calls onDismiss on explore click', () => {
    const onDismiss = vi.fn();
    render(<MemoryRouter><WelcomeCard onDismiss={onDismiss} /></MemoryRouter>);
    fireEvent.click(screen.getByText(/Explore|Explorer/));
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/features/home/WelcomeCard.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface WelcomeCardProps {
  onDismiss?: () => void;
}

const pillars = [
  { icon: '📋', titleKey: 'onboarding.pillarTasksTitle', descKey: 'onboarding.pillarTasksDescription' },
  { icon: '🤖', titleKey: 'onboarding.pillarAutoTitle', descKey: 'onboarding.pillarAutoDescription' },
  { icon: '✋', titleKey: 'onboarding.pillarControlTitle', descKey: 'onboarding.pillarControlDescription' },
] as const;

export default function WelcomeCard({ onDismiss }: WelcomeCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-8">
      <h2 className="text-lg font-bold text-text mb-2">{t('onboarding.welcomeTitle')}</h2>
      <p className="text-text-secondary text-sm mb-6">{t('onboarding.welcomeDescription')}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {pillars.map(({ icon, titleKey, descKey }) => (
          <div key={titleKey} className="bg-bg rounded-xl p-4 text-center">
            <span className="text-2xl mb-2 block">{icon}</span>
            <p className="font-semibold text-text text-sm mb-1">{t(titleKey)}</p>
            <p className="text-text-tertiary text-xs">{t(descKey)}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/nouveau')}
          className="px-5 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
        >
          {t('onboarding.createFirstTask')}
        </button>
        <button
          onClick={onDismiss}
          className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          {t('onboarding.explore')}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/features/home/WelcomeCard.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/home/WelcomeCard.tsx apps/web/src/features/home/WelcomeCard.test.tsx
git commit -m "feat(web): add WelcomeCard component for first-run onboarding"
```

---

### Task 4: ExampleChips — Clickable templates for Nouveau page

**Files:**
- Create: `apps/web/src/features/nouveau/ExampleChips.tsx`
- Create: `apps/web/src/features/nouveau/ExampleChips.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../shared/i18n/i18n';
import ExampleChips from './ExampleChips';

describe('ExampleChips', () => {
  it('renders 4 example chips', () => {
    render(<ExampleChips onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(4);
  });

  it('calls onSelect with full text when chip is clicked', () => {
    const onSelect = vi.fn();
    render(<ExampleChips onSelect={onSelect} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    // The argument should be a non-empty string (the full example text)
    expect(onSelect.mock.calls[0][0].length).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/features/nouveau/ExampleChips.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';

interface ExampleChipsProps {
  onSelect: (text: string) => void;
}

const examples = [
  { labelKey: 'nouveau.exampleSell', fullKey: 'nouveau.exampleSellFull' },
  { labelKey: 'nouveau.exampleInvoice', fullKey: 'nouveau.exampleInvoiceFull' },
  { labelKey: 'nouveau.exampleInsurance', fullKey: 'nouveau.exampleInsuranceFull' },
  { labelKey: 'nouveau.exampleDoctor', fullKey: 'nouveau.exampleDoctorFull' },
] as const;

export default function ExampleChips({ onSelect }: ExampleChipsProps) {
  const { t } = useTranslation();

  return (
    <div className="mb-4">
      <p className="text-xs text-text-tertiary mb-2">{t('nouveau.tryExample')}</p>
      <div className="flex flex-wrap gap-2">
        {examples.map(({ labelKey, fullKey }) => (
          <button
            key={labelKey}
            onClick={() => onSelect(t(fullKey))}
            className="px-3 py-1.5 rounded-full border border-border text-xs text-text-secondary hover:border-accent hover:text-accent transition-colors"
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/features/nouveau/ExampleChips.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/nouveau/ExampleChips.tsx apps/web/src/features/nouveau/ExampleChips.test.tsx
git commit -m "feat(web): add ExampleChips for Nouveau page templates"
```

---

### Task 5: Integrate WelcomeCard + rich empty states into Home

**Files:**
- Modify: `apps/web/src/features/home/Home.tsx`
- Modify: `apps/web/src/features/home/Home.test.tsx`

- [ ] **Step 1: Update existing tests + add new test cases**

First, update the existing test `'renders empty state when nothing to do'` — it currently expects `/No .* dossiers/` which won't appear anymore (WelcomeCard shows instead). Replace it:

```tsx
// REPLACE the existing test:
it('renders empty state when nothing to do', async () => {
  localStorage.clear();
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
  // WelcomeCard shows instead of generic "No dossiers" message
  await waitFor(() => {
    expect(screen.getByText(/Welcome to OpenTidy|Bienvenue sur OpenTidy/)).toBeDefined();
  });
});
```

Also update `'shows empty dossier message with finished sessions only'` to expect WelcomeCard or onboarding empty state.

Then add these new test cases to the `describe('Home page')` block:

```tsx
it('shows WelcomeCard when no dossiers and onboarding not dismissed', async () => {
  localStorage.clear();
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.getByText(/Welcome to OpenTidy|Bienvenue sur OpenTidy/)).toBeDefined();
  });
});

it('hides WelcomeCard after dismissal', async () => {
  localStorage.clear();
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.getByText(/Welcome to OpenTidy|Bienvenue sur OpenTidy/)).toBeDefined();
  });
  fireEvent.click(screen.getByText(/Explore|Explorer/));
  expect(screen.queryByText(/Welcome to OpenTidy|Bienvenue sur OpenTidy/)).toBeNull();
});

it('does not show WelcomeCard when dossiers exist', async () => {
  storeState.dossiers = [makeDossier()];
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.getByText('Dossier Acme')).toBeDefined();
  });
  expect(screen.queryByText(/Welcome to OpenTidy|Bienvenue sur OpenTidy/)).toBeNull();
});

it('shows contextual empty state text instead of generic "No dossiers"', async () => {
  localStorage.setItem('opentidy-onboarding-seen', 'true');
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.getByText(/Your active tasks|Tes tâches en cours/)).toBeDefined();
  });
});
```

Also add `import { fireEvent } from '@testing-library/react';` to the import line if not already present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run src/features/home/Home.test.tsx`
Expected: FAIL — WelcomeCard not rendered, empty state text doesn't match

- [ ] **Step 3: Modify Home.tsx**

**3a.** Add imports at the top:

```tsx
import WelcomeCard from './WelcomeCard';
import HelpTooltip from '../../shared/HelpTooltip';
```

**3b.** Add state for onboarding visibility inside `Home()`, after the existing `useState` calls:

```tsx
const [onboardingSeen, setOnboardingSeen] = useState(
  () => localStorage.getItem('opentidy-onboarding-seen') === 'true'
);

const showWelcome = !onboardingSeen && dossiers.length === 0 && !loading;

function dismissOnboarding() {
  localStorage.setItem('opentidy-onboarding-seen', 'true');
  setOnboardingSeen(true);
}
```

**3c.** In the JSX return, right after `<Header />`, add:

```tsx
{showWelcome && <WelcomeCard onDismiss={dismissOnboarding} />}
```

**3d.** Replace the empty state for "waiting for you" section. After the `{waitingUser.length > 0 && (` block, add an else branch for when the section is empty AND onboarding is not seen:

```tsx
{waitingUser.length === 0 && !showWelcome && (
  <section className="mb-6">
    <div className="flex items-center gap-2 mb-2">
      <span className="w-2.5 h-2.5 rounded-full bg-orange/30" />
      <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
        {t('home.waitingForYou')}
      </span>
      <HelpTooltip text={t('helpTooltip.waitingUser')} />
    </div>
    <p className="text-text-tertiary text-xs pl-5">{t('onboarding.emptyWaitingUser')}</p>
  </section>
)}
```

**3e.** Same pattern for "waiting for response" — add after the `{waitingTiers.length > 0 && (` block:

```tsx
{waitingTiers.length === 0 && !showWelcome && (
  <section className="mb-6">
    <div className="flex items-center gap-2 mb-2">
      <span className="w-2.5 h-2.5 rounded-full bg-accent/30" />
      <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
        {t('home.waitingForResponse')}
      </span>
    </div>
    <p className="text-text-tertiary text-xs pl-5">{t('onboarding.emptyWaitingTiers')}</p>
  </section>
)}
```

**3f.** Same for suggestions — add after `{suggestions.length > 0 && (` block:

```tsx
{suggestions.length === 0 && !showWelcome && (
  <section className="mb-6">
    <div className="flex items-center gap-2 mb-2">
      <span className="w-2 h-2 rotate-45 bg-accent/30" />
      <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
        {t('home.suggestions')}
      </span>
      <HelpTooltip text={t('helpTooltip.suggestion')} />
    </div>
    <p className="text-text-tertiary text-xs pl-5">{t('onboarding.emptySuggestions')}</p>
  </section>
)}
```

**3g.** Replace the empty dossier list message (the `{!loading && filtered.length === 0 && (` block) with a richer empty state:

```tsx
{!loading && filtered.length === 0 && (
  <div className="text-center py-8">
    <p className="text-text-tertiary text-sm mb-3">{t('onboarding.emptyDossiers')}</p>
    <button
      onClick={() => navigate('/nouveau')}
      className="px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
    >
      {t('onboarding.emptyCreateCta')}
    </button>
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/features/home/Home.test.tsx`
Expected: PASS (all existing + new tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/home/Home.tsx apps/web/src/features/home/Home.test.tsx
git commit -m "feat(web): integrate WelcomeCard and rich empty states on Home"
```

---

### Task 6: Integrate ExampleChips + confirm mode improvements into Nouveau

**Files:**
- Modify: `apps/web/src/features/nouveau/Nouveau.tsx`

- [ ] **Step 1: Write a test for the example chips integration**

Create `apps/web/src/features/nouveau/Nouveau.test.tsx`:

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../shared/i18n/i18n';
import Nouveau from './Nouveau';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

let storeState: Record<string, unknown>;
vi.mock('../../shared/store', () => ({
  useStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    if (typeof selector === 'function') return selector(storeState);
    return storeState;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  storeState = {
    suggestions: [],
    fetchSuggestions: vi.fn().mockResolvedValue(undefined),
    createDossier: vi.fn().mockResolvedValue(undefined),
  };
});

describe('Nouveau page', () => {
  it('renders example chips', () => {
    render(<MemoryRouter><Nouveau /></MemoryRouter>);
    expect(screen.getByText(/Try an example|Essaie par exemple/)).toBeDefined();
  });

  it('fills textarea when chip is clicked', () => {
    render(<MemoryRouter><Nouveau /></MemoryRouter>);
    const chips = screen.getAllByRole('button').filter(b => !b.textContent?.includes('Launch') && !b.textContent?.includes('Lancer') && !b.textContent?.includes('Files') && !b.textContent?.includes('Fichiers'));
    fireEvent.click(chips[0]);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value.length).toBeGreaterThan(20);
  });

  it('has confirm mode checked by default', () => {
    render(<MemoryRouter><Nouveau /></MemoryRouter>);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('shows confirm mode help text', () => {
    render(<MemoryRouter><Nouveau /></MemoryRouter>);
    expect(screen.getByText(/assistant asks you before|assistant te demande avant/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/features/nouveau/Nouveau.test.tsx`
Expected: FAIL — no example chips rendered, confirm not checked by default

- [ ] **Step 3: Modify Nouveau.tsx**

**3a.** Add import at the top:

```tsx
import ExampleChips from './ExampleChips';
```

**3b.** Change the default confirm state from `false` to `true`:

```tsx
const [confirm, setConfirm] = useState(true);
```

**3c.** Add `<ExampleChips>` before the textarea:

```tsx
<ExampleChips onSelect={setInstruction} />
```

**3d.** Replace the confirm mode label with an enriched version — replace the `<label>` block:

```tsx
<div className="flex flex-col gap-1">
  <label className="flex items-center gap-2 text-xs text-text-tertiary cursor-pointer">
    <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="rounded border-border" />
    {t('nouveau.confirmMode')}
  </label>
  <p className="text-[11px] text-text-tertiary/70 pl-5">{t('nouveau.confirmModeHelp')}</p>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/features/nouveau/Nouveau.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/nouveau/Nouveau.tsx apps/web/src/features/nouveau/Nouveau.test.tsx
git commit -m "feat(web): add example chips and confirm-mode improvements to Nouveau"
```

---

### Task 7: Post-creation banner on DossierDetail

**Files:**
- Modify: `apps/web/src/features/dossiers/DossierDetail.tsx`

- [ ] **Step 1: Write the test**

Add to a new file `apps/web/src/features/dossiers/DossierDetail.test.tsx`. Note: DossierDetail is complex (resizable panels, terminal iframe), so we test only the banner logic:

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '../../shared/i18n/i18n';
import DossierDetail from './DossierDetail';
import type { Dossier, Session } from '@opentidy/shared';

// Mock react-resizable-panels to avoid layout issues in tests
vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: { children: unknown }) => <div>{children}</div>,
  Group: ({ children }: { children: unknown }) => <div>{children}</div>,
  Separator: () => <div />,
}));

let storeState: Record<string, unknown>;
vi.mock('../../shared/store', () => ({
  useStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    if (typeof selector === 'function') return selector(storeState);
    return storeState;
  },
}));

vi.mock('../../shared/api', () => ({
  getArtifactUrl: () => '#',
  getTerminalPort: () => Promise.resolve(null),
  resumeSession: () => Promise.resolve(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  storeState = {
    dossiers: [{
      id: 'test-1',
      status: 'IN_PROGRESS',
      title: 'Test Task',
      objective: 'Do something',
      lastAction: null,
      hasActiveSession: true,
      artifacts: [],
      journal: [],
    } satisfies Dossier],
    sessions: [{
      id: 'session-1',
      dossierId: 'test-1',
      status: 'active',
      startedAt: new Date().toISOString(),
    } satisfies Session],
    fetchDossiers: vi.fn().mockResolvedValue(undefined),
    fetchSessions: vi.fn().mockResolvedValue(undefined),
    completeDossier: vi.fn().mockResolvedValue(undefined),
    stopSession: vi.fn().mockResolvedValue(undefined),
  };
});

function renderWithRoute() {
  return render(
    <MemoryRouter initialEntries={['/dossier/test-1']}>
      <Routes>
        <Route path="/dossier/:id" element={<DossierDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DossierDetail post-creation banner', () => {
  it('shows banner when first-task flag is set', async () => {
    localStorage.setItem('opentidy-first-task', 'true');
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText(/assistant is working|assistant travaille/i)).toBeDefined();
    });
  });

  it('hides banner on dismiss click', async () => {
    localStorage.setItem('opentidy-first-task', 'true');
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText(/assistant is working|assistant travaille/i)).toBeDefined();
    });
    fireEvent.click(screen.getByLabelText('dismiss'));
    expect(screen.queryByText(/assistant is working|assistant travaille/i)).toBeNull();
  });

  it('does not show banner when flag is absent', async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeDefined();
    });
    expect(screen.queryByText(/assistant is working|assistant travaille/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/features/dossiers/DossierDetail.test.tsx`
Expected: FAIL — no banner rendered

- [ ] **Step 3: Modify DossierDetail.tsx**

**3a.** Add state after existing `useState` calls inside `DossierDetail()`:

```tsx
const [showBanner, setShowBanner] = useState(
  () => localStorage.getItem('opentidy-first-task') === 'true'
);
```

**3b.** Add banner JSX right after the header `</div>` (the `border-b border-border` div), before the content section:

```tsx
{showBanner && (
  <div className="mx-4 md:mx-6 mt-2 bg-green/10 border border-green/20 rounded-lg px-4 py-3 flex items-start gap-3">
    <span className="text-green text-lg leading-none mt-0.5">✨</span>
    <p className="text-sm text-text-secondary flex-1">{t('onboarding.postCreationBanner')}</p>
    <button
      aria-label="dismiss"
      onClick={() => {
        localStorage.removeItem('opentidy-first-task');
        setShowBanner(false);
      }}
      className="text-text-tertiary hover:text-text transition-colors text-lg leading-none"
    >
      ×
    </button>
  </div>
)}
```

- [ ] **Step 4: Also set the flag when creating the first dossier**

In `apps/web/src/features/nouveau/Nouveau.tsx`, in the `handleLaunch` function, add before `navigate('/')`:

```tsx
// Show post-creation banner only for the very first dossier ever created
const { dossiers } = useStore.getState();
if (dossiers.length === 0) {
  localStorage.setItem('opentidy-first-task', 'true');
  localStorage.setItem('opentidy-onboarding-seen', 'true');
}
```

This uses the dossier count (0 = first time) rather than the onboarding-seen flag, so it works regardless of how the user arrived at the page. Also add `import { useStore } from '../../shared/store';` — it's already imported via the destructuring at the top of the component, so instead use `useStore.getState()` directly (Zustand static access).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/features/dossiers/DossierDetail.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/dossiers/DossierDetail.tsx apps/web/src/features/dossiers/DossierDetail.test.tsx apps/web/src/features/nouveau/Nouveau.tsx
git commit -m "feat(web): add post-creation guidance banner on DossierDetail"
```

---

### Task 8: Progressive navigation — grey out empty sections

**Files:**
- Modify: `apps/web/src/shared/DesktopNav.tsx`
- Modify: `apps/web/src/shared/MobileNav.tsx`

- [ ] **Step 1: Write the test**

Create `apps/web/src/shared/DesktopNav.test.tsx`:

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import './i18n/i18n';
import DesktopNav from './DesktopNav';

let storeState: Record<string, unknown>;
vi.mock('./store', () => ({
  useStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    if (typeof selector === 'function') return selector(storeState);
    return storeState;
  },
}));

beforeEach(() => {
  storeState = {
    claudeProcesses: [],
    ameliorations: [],
    memoryIndex: [],
  };
});

describe('DesktopNav progressive unlock', () => {
  it('renders all nav links', () => {
    render(<MemoryRouter><DesktopNav /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(4);
  });

  it('dims nav items when their content is empty', () => {
    render(<MemoryRouter><DesktopNav /></MemoryRouter>);
    // Terminal, Ameliorations, Memory links should have opacity class
    const links = screen.getAllByRole('link');
    const terminalLink = links.find(l => l.getAttribute('href') === '/terminal');
    expect(terminalLink?.className).toContain('opacity');
  });

  it('un-dims nav items when content exists', () => {
    storeState.claudeProcesses = [{ id: 1 }];
    render(<MemoryRouter><DesktopNav /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    const terminalLink = links.find(l => l.getAttribute('href') === '/terminal');
    expect(terminalLink?.className).not.toContain('opacity-40');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/shared/DesktopNav.test.tsx`
Expected: FAIL — no opacity classes, no store import

- [ ] **Step 3: Modify DesktopNav.tsx**

**3a.** Add imports:

```tsx
import { useStore } from './store';
```

**3b.** Replace the `links` array with a version that includes an `unlockedKey`:

```tsx
const links = [
  { to: '/', icon: 'home', labelKey: 'nav.home', unlockedKey: null },
  { to: '/terminal', icon: 'terminal', labelKey: 'nav.terminal', unlockedKey: 'claudeProcesses' as const },
  { to: '/ameliorations', icon: 'ameliorations', labelKey: 'nav.analyses', unlockedKey: 'ameliorations' as const },
  { to: '/memory', icon: 'memory', labelKey: 'nav.memory', unlockedKey: 'memoryIndex' as const },
];
```

**3c.** Inside `DesktopNav()`, add store reads:

```tsx
const { claudeProcesses, ameliorations, memoryIndex } = useStore();
const hasContent: Record<string, boolean> = {
  claudeProcesses: claudeProcesses.length > 0,
  ameliorations: ameliorations.length > 0,
  memoryIndex: memoryIndex.length > 0,
};
```

**3d.** In the `NavLink` rendering, add conditional opacity:

```tsx
{links.map(({ to, icon, labelKey, unlockedKey }) => {
  const locked = unlockedKey !== null && !hasContent[unlockedKey];
  return (
    <NavLink
      key={to}
      to={to}
      title={t(labelKey)}
      className={({ isActive }) =>
        `flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
          isActive ? 'bg-accent/10' : 'hover:bg-card-hover'
        } ${locked ? 'opacity-40' : ''}`
      }
    >
      {({ isActive }) => <NavIcon icon={icon} active={isActive} />}
    </NavLink>
  );
})}
```

- [ ] **Step 4: Modify MobileNav.tsx similarly**

Add the same store import and `hasContent` logic. Apply `opacity-40` class to locked tabs.

```tsx
import { useStore } from './store';
```

Add inside `MobileNav()`:

```tsx
const { claudeProcesses, ameliorations, memoryIndex } = useStore();
const hasContent: Record<string, boolean> = {
  claudeProcesses: claudeProcesses.length > 0,
  ameliorations: ameliorations.length > 0,
  memoryIndex: memoryIndex.length > 0,
};
```

Update the `tabs` array to include `unlockedKey`:

```tsx
const tabs = [
  { to: '/', icon: 'home', labelKey: 'nav.home', unlockedKey: null },
  { to: '/nouveau', icon: 'nouveau', labelKey: 'nav.new', unlockedKey: null },
  { to: '/terminal', icon: 'terminal', labelKey: 'nav.terminal', unlockedKey: 'claudeProcesses' as const },
  { to: '/ameliorations', icon: 'plus', labelKey: 'nav.analyses', unlockedKey: 'ameliorations' as const },
  { to: '/memory', icon: 'memory', labelKey: 'nav.memory', unlockedKey: 'memoryIndex' as const },
];
```

Apply opacity in the className:

```tsx
{tabs.map(({ to, icon, labelKey, unlockedKey }) => {
  const locked = unlockedKey !== null && !hasContent[unlockedKey];
  return (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 text-[10px] ${
          isActive ? 'text-accent' : 'text-text-tertiary'
        } ${locked ? 'opacity-40' : ''}`
      }
    >
      ...
    </NavLink>
  );
})}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/shared/DesktopNav.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shared/DesktopNav.tsx apps/web/src/shared/MobileNav.tsx apps/web/src/shared/DesktopNav.test.tsx
git commit -m "feat(web): progressive nav — dim empty sections until content exists"
```

---

### Task 9: Update Sidebar status labels

**Files:**
- Modify: `apps/web/src/features/dossiers/Sidebar.tsx`

- [ ] **Step 1: Replace hardcoded status labels with i18n keys**

In `Sidebar.tsx`, replace the `sidebarSessionLabels` object:

```tsx
// Before:
const sidebarSessionLabels: Record<string, string> = {
  active: 'Active',
  idle: 'Idle',
};

// After: remove this object entirely, use t() with status keys
```

In the component, replace `sessionLabel` usage:

```tsx
const sessionLabel = session ? t(`status.${session.status}`) : null;
```

This will use the updated i18n keys: `status.active` = "Working"/"En cours", `status.idle` = "Paused"/"En pause".

- [ ] **Step 2: Run all web tests**

Run: `cd apps/web && pnpm vitest run`
Expected: PASS (all tests)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/dossiers/Sidebar.tsx
git commit -m "feat(web): use i18n for sidebar session status labels"
```

---

### Task 10: Final integration test — full run

- [ ] **Step 1: Run all web unit tests**

Run: `cd apps/web && pnpm vitest run`
Expected: All PASS

- [ ] **Step 2: Run lint**

Run: `pnpm --filter @opentidy/web exec tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Build check**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Visual smoke test**

Run: `pnpm --filter @opentidy/web dev`
Manual check:
- Open http://localhost:5173
- Verify WelcomeCard shows on empty Home
- Click "Create my first task" → navigates to /nouveau
- Verify example chips appear, clicking one fills textarea
- Verify confirm mode is checked by default with help text
- Verify nav items (Processes, Improvements, Memory) are dimmed
- Click "Explore" on WelcomeCard → card disappears, empty state sections show contextual text
- Verify labels updated: "Processus" (not "Terminal"), "Améliorations" (not "Auto-analyses")

- [ ] **Step 5: Commit any fixes from smoke test**

Stage only the files modified during the smoke test fix, then commit:

```bash
git add <specific-files-changed>
git commit -m "fix(web): polish onboarding after smoke test"
```
