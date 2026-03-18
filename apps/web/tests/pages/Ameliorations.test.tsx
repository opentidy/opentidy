import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Amelioration } from '@opentidy/shared';
import Ameliorations from '../../src/pages/Ameliorations';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockResolveAmelioration = vi.fn();
const mockIgnoreAmelioration = vi.fn();
let storeState: Record<string, unknown>;

vi.mock('../../src/store', () => ({
  useStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    if (typeof selector === 'function') return selector(storeState);
    return storeState;
  },
}));

function makeAmelioration(overrides: Partial<Amelioration> = {}): Amelioration {
  return {
    id: 'amel-1',
    date: '2026-03-14',
    title: 'Improve error handling',
    problem: 'Errors are not logged properly',
    impact: 'Hard to debug issues in production',
    suggestion: 'Add structured logging',
    actions: [],
    resolved: false,
    status: 'open',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveAmelioration.mockReset();
  mockIgnoreAmelioration.mockReset();
  storeState = {
    ameliorations: [
      makeAmelioration({ id: 'amel-1', title: 'Error handling', resolved: false, status: 'open' }),
      makeAmelioration({ id: 'amel-2', title: 'Add retry logic', resolved: false, status: 'open' }),
      makeAmelioration({ id: 'amel-3', title: 'Old fix', resolved: true, status: 'resolved' }),
    ],
    fetchAmeliorations: vi.fn().mockResolvedValue(undefined),
    resolveAmelioration: mockResolveAmelioration,
    ignoreAmelioration: mockIgnoreAmelioration,
  };
});

describe('Ameliorations page', () => {
  it('renders amelioration cards for open items by default', () => {
    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    expect(screen.getByText('Error handling')).toBeDefined();
    expect(screen.getByText('Add retry logic')).toBeDefined();
    expect(screen.queryByText('Old fix')).toBeNull();
  });

  it('renders the page heading with open count', async () => {
    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    expect(screen.getByText('Auto-analyses')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('2 ouvertes')).toBeDefined();
    });
  });

  it('shows filter buttons for ouverts and resolus', () => {
    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    expect(screen.getByText('Ouverts')).toBeDefined();
    expect(screen.getByText('Résolus')).toBeDefined();
  });

  it('clicking "Résolus" filter shows only resolved ameliorations', () => {
    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Résolus'));

    expect(screen.getByText('Old fix')).toBeDefined();
    expect(screen.queryByText('Error handling')).toBeNull();
    expect(screen.queryByText('Add retry logic')).toBeNull();
  });

  it('"Résolu" button calls resolveAmelioration', () => {
    storeState.ameliorations = [
      makeAmelioration({ id: 'amel-42', title: 'Specific fix', resolved: false, status: 'open' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Résolu'));

    expect(mockResolveAmelioration).toHaveBeenCalledWith('amel-42');
  });

  it('"Résolu" button not shown for resolved items', () => {
    storeState.ameliorations = [
      makeAmelioration({ id: 'amel-3', title: 'Old fix', resolved: true, status: 'resolved' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Résolus'));

    expect(screen.queryByText('Résolu')).toBeNull();
  });

  it('dossier link navigates to /dossier/{dossierId}', () => {
    storeState.ameliorations = [
      makeAmelioration({ id: 'amel-1', dossierId: 'sopra', resolved: false, status: 'open' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    // The button text includes the dossierId
    const dossierButton = screen.getByText(/Dossier: sopra/);
    fireEvent.click(dossierButton);

    expect(mockNavigate).toHaveBeenCalledWith('/dossier/sopra');
  });

  it('does not show dossier link when dossierId is missing', () => {
    storeState.ameliorations = [
      makeAmelioration({ id: 'amel-1', dossierId: undefined, resolved: false, status: 'open' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Dossier:/)).toBeNull();
  });

  it('shows empty state for open filter with no open items', async () => {
    storeState.ameliorations = [
      makeAmelioration({ resolved: true, status: 'resolved' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Aucune analyse ouverte')).toBeDefined();
    });
  });

  it('shows empty state for resolved filter with no resolved items', async () => {
    storeState.ameliorations = [
      makeAmelioration({ resolved: false, status: 'open' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Résolus'));

    await waitFor(() => {
      expect(screen.getByText('Aucune analyse résolue')).toBeDefined();
    });
  });

  it('calls fetchAmeliorations on mount', () => {
    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    expect(storeState.fetchAmeliorations).toHaveBeenCalled();
  });

  it('displays impact section when present', () => {
    storeState.ameliorations = [
      makeAmelioration({ impact: 'Production downtime risk', resolved: false, status: 'open' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    expect(screen.getByText('Impact')).toBeDefined();
    expect(screen.getByText('Production downtime risk')).toBeDefined();
  });

  it('displays suggestion section when present', () => {
    storeState.ameliorations = [
      makeAmelioration({ suggestion: 'Use structured logging', resolved: false, status: 'open' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    expect(screen.getByText('Suggestion')).toBeDefined();
    expect(screen.getByText('Use structured logging')).toBeDefined();
  });
});
