import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Dossier, Suggestion, Session } from '@alfred/shared';
import Home from '../../src/pages/Home';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Store mock state
let storeState: Record<string, unknown>;

vi.mock('../../src/store', () => ({
  useStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    if (typeof selector === 'function') return selector(storeState);
    return storeState;
  },
}));

function makeDossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 'sopra',
    status: 'EN COURS',
    title: 'Dossier Sopra',
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
    slug: 'impots',
    title: 'Impots chypriotes',
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
    id: 'alfred-sopra',
    dossierId: 'sopra',
    status: 'active',
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  it('renders empty state when nothing to do', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Aucun dossier/)).toBeDefined();
    });
    // No zen mode — component shows dossiers section with empty message
    expect(screen.queryByText('Tout roule')).toBeNull();
    expect(screen.queryByText(/aucune action requise/)).toBeNull();
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
    expect(screen.getByText('Impots chypriotes')).toBeDefined();
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

  it('header shows Alfred title, not session count', async () => {
    storeState.sessions = [makeSession(), makeSession({ id: 'alfred-impots', dossierId: 'impots' })];
    storeState.suggestions = [makeSuggestion()];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alfred')).toBeDefined();
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

  it('shows empty dossier message with finished sessions only', async () => {
    storeState.sessions = [makeSession({ status: 'finished' })];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    // No zen mode — shows empty dossier list
    await waitFor(() => {
      expect(screen.getByText(/Aucun dossier/)).toBeDefined();
    });
    expect(screen.queryByText('Tout roule')).toBeNull();
    expect(screen.queryByText(/0 sessions actives/)).toBeNull();
  });
});
