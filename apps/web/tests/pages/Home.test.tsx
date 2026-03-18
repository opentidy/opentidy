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
  };
});

describe('Home page', () => {
  it('renders zen mode when nothing to do', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Tout roule')).toBeDefined();
    });
    expect(screen.getByText(/aucune action requise/)).toBeDefined();
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

  it('renders "En fond" section with active sessions', async () => {
    storeState.sessions = [makeSession({ status: 'active' })];
    // Need something to prevent zen mode
    storeState.suggestions = [makeSuggestion()];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/En fond/)).toBeDefined();
    });
  });

  it('renders session count in header when sessions exist', async () => {
    storeState.sessions = [makeSession(), makeSession({ id: 'alfred-impots', dossierId: 'impots' })];
    storeState.suggestions = [makeSuggestion()];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('2 sessions')).toBeDefined();
    });
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

  it('zen mode shows correct session count text', async () => {
    storeState.sessions = [makeSession({ status: 'finished' })];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    // finished sessions are not active, so zen mode with 0 active sessions
    await waitFor(() => {
      expect(screen.getByText('Tout roule')).toBeDefined();
    });
    expect(screen.getByText(/0 sessions actives/)).toBeDefined();
  });
});
