// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Dossier, Suggestion, Session } from '@opentidy/shared';
import '../../shared/i18n/i18n';
import Home from './Home';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Store mock state
let storeState: Record<string, unknown>;

vi.mock('../../shared/store', () => ({
  useStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    if (typeof selector === 'function') return selector(storeState);
    return storeState;
  },
}));

function makeDossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 'acme',
    status: 'IN_PROGRESS',
    title: 'Dossier Acme',
    objective: 'Contract issue',
    lastAction: 'il y a 2h',
    hasActiveSession: false,
    artifacts: [],
    journal: [],
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    slug: 'tax-filing',
    title: 'Tax filing 2025',
    urgency: 'normal',
    source: 'gmail',
    date: '2026-03-14',
    summary: 'Tax deadline approaching',
    why: 'Due next week',
    whatIWouldDo: 'File them',
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'opentidy-acme',
    dossierId: 'acme',
    status: 'active',
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  storeState = {
    dossiers: [],
    suggestions: [],
    sessions: [],
    fetchDossiers: vi.fn().mockResolvedValue(undefined),
    fetchSuggestions: vi.fn().mockResolvedValue(undefined),
    fetchSessions: vi.fn().mockResolvedValue(undefined),
    fetchCheckupStatus: vi.fn().mockResolvedValue(undefined),
    triggerCheckup: vi.fn().mockResolvedValue(undefined),
    checkupStatus: null,
    resetEverything: vi.fn(),
    launchTestTasks: vi.fn(),
    setWaitingType: vi.fn(),
  };
});

describe('Home page', () => {
  it('shows WelcomeCard when no dossiers and onboarding not dismissed', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Welcome to OpenTidy|Bienvenue sur OpenTidy/)).toBeDefined();
    });
  });

  it('renders "Suggestions" section when suggestions exist', async () => {
    storeState.suggestions = [makeSuggestion()];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Suggestions/)).toBeDefined();
    });
    expect(screen.getByText('Tax filing 2025')).toBeDefined();
  });

  it('does not render "En fond" section — active sessions show via dossier cards', async () => {
    storeState.sessions = [makeSession({ status: 'active' })];
    storeState.suggestions = [makeSuggestion()];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Suggestions/)).toBeDefined();
    });
    // Current component has no "En fond" section for active sessions
    expect(screen.queryByText(/En fond/)).toBeNull();
  });

  it('header shows OpenTidy title, not session count', async () => {
    storeState.sessions = [makeSession(), makeSession({ id: 'opentidy-tax-filing', dossierId: 'tax-filing' })];
    storeState.suggestions = [makeSuggestion()];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('OpenTidy')).toBeDefined();
    });
    // Current header does not display session count
    expect(screen.queryByText('2 sessions')).toBeNull();
  });

  it('does not render "En fond" when no active sessions', async () => {
    storeState.suggestions = [makeSuggestion()];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Suggestions/)).toBeDefined();
    });
    expect(screen.queryByText(/En fond/)).toBeNull();
  });

  it('calls all fetch functions on mount', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(storeState.fetchDossiers).toHaveBeenCalled();
    expect(storeState.fetchSuggestions).toHaveBeenCalled();
    expect(storeState.fetchSessions).toHaveBeenCalled();
  });

  it('shows WelcomeCard with finished sessions only and no dossiers', async () => {
    storeState.sessions = [makeSession({ status: 'finished' as Session['status'] })];

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

  it('shows contextual empty state text when onboarding dismissed', async () => {
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
});
