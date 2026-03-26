// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Task, Session, Suggestion } from '@opentidy/shared';
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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'acme',
    status: 'IN_PROGRESS',
    title: 'Task Acme',
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
    source: 'email',
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
    taskId: 'acme',
    status: 'active',
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeState = {
    tasks: [],
    suggestions: [],
    sessions: [],
    fetchTasks: vi.fn().mockResolvedValue(undefined),
    fetchSuggestions: vi.fn().mockResolvedValue(undefined),
    fetchSessions: vi.fn().mockResolvedValue(undefined),
    fetchCheckupStatus: vi.fn().mockResolvedValue(undefined),
    triggerCheckup: vi.fn().mockResolvedValue(undefined),
    approveSuggestion: vi.fn().mockResolvedValue(undefined),
    ignoreSuggestion: vi.fn().mockResolvedValue(undefined),
    checkupStatus: null,
    resetEverything: vi.fn(),
    launchTestTasks: vi.fn(),
    setWaitingType: vi.fn(),
  };
});

describe('Home page', () => {
  it('shows empty state when no tasks, sessions, or suggestions', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/All clear|Tout est en ordre/)).toBeDefined();
    });
  });

  it('renders tasks in running section when in progress with active session', async () => {
    storeState.tasks = [makeTask({ hasActiveSession: true })];
    storeState.sessions = [makeSession({ status: 'active' })];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Task Acme')).toBeDefined();
    });
  });

  it('header shows Home title', async () => {
    storeState.suggestions = [makeSuggestion()];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Home')).toBeDefined();
    });
  });

  it('shows new task button in empty state', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/\+ New task|\+ Nouvelle tâche/)).toBeDefined();
    });
  });

  it('calls all fetch functions on mount', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(storeState.fetchTasks).toHaveBeenCalled();
    expect(storeState.fetchSuggestions).toHaveBeenCalled();
    expect(storeState.fetchSessions).toHaveBeenCalled();
  });

  it('renders suggestions section when suggestions exist', async () => {
    storeState.suggestions = [makeSuggestion()];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Tax filing 2025')).toBeDefined();
    });
  });

  it('shows loading state initially', () => {
    // Make fetches never resolve to keep loading state
    storeState.fetchTasks = vi.fn(() => new Promise(() => {}));
    storeState.fetchSuggestions = vi.fn(() => new Promise(() => {}));
    storeState.fetchSessions = vi.fn(() => new Promise(() => {}));

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Loading|Chargement/)).toBeDefined();
  });

  it('does not show "En fond" section — no legacy background sessions area', async () => {
    storeState.sessions = [makeSession({ status: 'active' })];
    storeState.suggestions = [makeSuggestion()];

    const { container } = render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Home')).toBeDefined();
    });
    expect(container.textContent).not.toContain('En fond');
  });

  it('shows empty state with completed count when only completed tasks', async () => {
    storeState.tasks = [makeTask({ status: 'COMPLETED', hasActiveSession: false })];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/All clear|Tout est en ordre/)).toBeDefined();
    });
  });

  it('idle sessions appear in needs-you section, not running', async () => {
    storeState.tasks = [makeTask({ status: 'IN_PROGRESS' })];
    storeState.sessions = [makeSession({ status: 'idle', taskId: 'acme' })];

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      // Task should appear (in needs-you section since idle defaults to user-waiting)
      expect(screen.getByText('Task Acme')).toBeDefined();
    });
    // Should not show "Running" section label since the session is idle
    expect(screen.queryByText(/Running|En cours/)).toBeNull();
  });
});
