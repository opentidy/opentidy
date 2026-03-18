import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Dossier } from '@alfred/shared';
import DossierCard from '../../src/components/DossierCard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeDossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 'sopra-steria',
    status: 'EN COURS',
    title: 'Dossier Sopra',
    objective: 'Resolve contract issue with Sopra',
    lastAction: 'il y a 2h',
    hasActiveSession: false,
    artifacts: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DossierCard', () => {
  it('displays title and objective', () => {
    render(
      <MemoryRouter>
        <DossierCard dossier={makeDossier()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dossier Sopra')).toBeDefined();
    expect(screen.getByText('Resolve contract issue with Sopra')).toBeDefined();
  });

  it('displays EN COURS status with green dot and badge', () => {
    const { container } = render(
      <MemoryRouter>
        <DossierCard dossier={makeDossier({ status: 'EN COURS' })} />
      </MemoryRouter>,
    );

    expect(screen.getByText('En cours')).toBeDefined();
    // Green dot
    const dots = container.querySelectorAll('.bg-green');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('displays TERMINE status with tertiary dot and opacity', () => {
    const { container } = render(
      <MemoryRouter>
        <DossierCard dossier={makeDossier({ status: 'TERMIN\u00c9' })} />
      </MemoryRouter>,
    );

    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('opacity-50');
  });

  it('shows "Terminal" indicator when session is active', () => {
    render(
      <MemoryRouter>
        <DossierCard dossier={makeDossier({})} session={{ id: 's1', dossierId: 'test', status: 'active' } as any} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Terminal')).toBeDefined();
  });

  it('click navigates to /dossier/{id}', () => {
    const { container } = render(
      <MemoryRouter>
        <DossierCard dossier={makeDossier({ id: 'my-dossier' })} />
      </MemoryRouter>,
    );

    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(mockNavigate).toHaveBeenCalledWith('/dossier/my-dossier');
  });

  it('displays lastAction', () => {
    render(
      <MemoryRouter>
        <DossierCard dossier={makeDossier({ lastAction: 'hier' })} />
      </MemoryRouter>,
    );

    expect(screen.getByText('hier')).toBeDefined();
  });
});
