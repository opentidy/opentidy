// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Dossier } from '@opentidy/shared';
import '../../shared/i18n/i18n';
import DossierCard from './DossierCard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeDossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 'acme-corp',
    status: 'IN_PROGRESS',
    title: 'Dossier Acme',
    objective: 'Resolve contract issue with Acme',
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

    expect(screen.getByText('Dossier Acme')).toBeDefined();
    expect(screen.getByText('Resolve contract issue with Acme')).toBeDefined();
  });

  it('displays IN_PROGRESS status with green dot and badge', () => {
    const { container } = render(
      <MemoryRouter>
        <DossierCard dossier={makeDossier({ status: 'IN_PROGRESS' })} />
      </MemoryRouter>,
    );

    expect(screen.getByText('In progress')).toBeDefined();
    // Green dot
    const dots = container.querySelectorAll('.bg-green');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('displays COMPLETED status with tertiary dot and opacity', () => {
    const { container } = render(
      <MemoryRouter>
        <DossierCard dossier={makeDossier({ status: 'COMPLETED' })} />
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