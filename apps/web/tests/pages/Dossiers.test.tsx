import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Dossier } from '@alfred/shared';
import Dossiers from '../../src/pages/Dossiers';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

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

beforeEach(() => {
  vi.clearAllMocks();
  storeState = {
    dossiers: [
      makeDossier({ id: 'sopra', status: 'EN COURS', title: 'Sopra' }),
      makeDossier({ id: 'impots', status: 'EN COURS', title: 'Impots' }),
      makeDossier({ id: 'done1', status: 'TERMINÉ', title: 'Fini un' }),
    ],
    fetchDossiers: vi.fn().mockResolvedValue(undefined),
  };
});

describe('Dossiers page', () => {
  it('renders filter buttons with correct counts', () => {
    render(
      <MemoryRouter>
        <Dossiers />
      </MemoryRouter>,
    );

    expect(screen.getByText('Tous (3)')).toBeDefined();
    expect(screen.getByText('Actifs (2)')).toBeDefined();
    expect(screen.getByText('Terminés (1)')).toBeDefined();
  });

  it('shows all dossiers by default (tous filter)', () => {
    render(
      <MemoryRouter>
        <Dossiers />
      </MemoryRouter>,
    );

    expect(screen.getByText('Sopra')).toBeDefined();
    expect(screen.getByText('Impots')).toBeDefined();
    expect(screen.getByText('Fini un')).toBeDefined();
  });

  it('clicking "Actifs" filter shows only EN COURS dossiers', () => {
    render(
      <MemoryRouter>
        <Dossiers />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Actifs (2)'));

    expect(screen.getByText('Sopra')).toBeDefined();
    expect(screen.getByText('Impots')).toBeDefined();
    expect(screen.queryByText('Fini un')).toBeNull();
  });

  it('clicking "Terminés" filter shows only terminated dossiers', () => {
    render(
      <MemoryRouter>
        <Dossiers />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Terminés (1)'));

    expect(screen.getByText('Fini un')).toBeDefined();
    expect(screen.queryByText('Sopra')).toBeNull();
  });

  it('search filters dossiers by title', () => {
    render(
      <MemoryRouter>
        <Dossiers />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Rechercher...');
    fireEvent.change(searchInput, { target: { value: 'sopra' } });

    expect(screen.getByText('Sopra')).toBeDefined();
    expect(screen.queryByText('Impots')).toBeNull();
  });

  it('search filters dossiers by objective (case-insensitive)', () => {
    storeState.dossiers = [
      makeDossier({ id: 'a', status: 'EN COURS', title: 'Alpha', objective: 'Fix billing' }),
      makeDossier({ id: 'b', status: 'EN COURS', title: 'Beta', objective: 'Update contract' }),
    ];

    render(
      <MemoryRouter>
        <Dossiers />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Rechercher...');
    fireEvent.change(searchInput, { target: { value: 'billing' } });

    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.queryByText('Beta')).toBeNull();
  });

  it('shows empty state message when no dossiers match filter', async () => {
    storeState.dossiers = [];

    render(
      <MemoryRouter>
        <Dossiers />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Aucun dossier/)).toBeDefined();
    });
  });

  it('shows empty state for terminated filter', async () => {
    storeState.dossiers = [
      makeDossier({ id: 'a', status: 'EN COURS', title: 'Active' }),
    ];

    render(
      <MemoryRouter>
        <Dossiers />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Terminés (0)'));

    await waitFor(() => {
      expect(screen.getByText(/Aucun dossier/)).toBeDefined();
    });
  });

  it('calls fetchDossiers on mount', () => {
    render(
      <MemoryRouter>
        <Dossiers />
      </MemoryRouter>,
    );

    expect(storeState.fetchDossiers).toHaveBeenCalled();
  });

  it('renders the page heading', () => {
    render(
      <MemoryRouter>
        <Dossiers />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dossiers')).toBeDefined();
  });
});
