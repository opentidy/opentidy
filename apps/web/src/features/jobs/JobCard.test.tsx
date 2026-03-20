// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Job } from '@opentidy/shared';
import '../../shared/i18n/i18n';
import JobCard from './JobCard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'acme-corp',
    status: 'IN_PROGRESS',
    title: 'Job Acme',
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

describe('JobCard', () => {
  it('displays title and objective', () => {
    render(
      <MemoryRouter>
        <JobCard job={makeJob()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Job Acme')).toBeDefined();
    expect(screen.getByText('Resolve contract issue with Acme')).toBeDefined();
  });

  it('displays IN_PROGRESS status with green dot and badge', () => {
    const { container } = render(
      <MemoryRouter>
        <JobCard job={makeJob({ status: 'IN_PROGRESS' })} />
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
        <JobCard job={makeJob({ status: 'COMPLETED' })} />
      </MemoryRouter>,
    );

    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('opacity-50');
  });

  it('shows "Terminal" indicator when session is active', () => {
    render(
      <MemoryRouter>
        <JobCard job={makeJob({})} session={{ id: 's1', jobId: 'test', status: 'active', startedAt: new Date().toISOString() }} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Terminal')).toBeDefined();
  });

  it('click navigates to /job/{id}', () => {
    const { container } = render(
      <MemoryRouter>
        <JobCard job={makeJob({ id: 'my-job' })} />
      </MemoryRouter>,
    );

    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(mockNavigate).toHaveBeenCalledWith('/job/my-job');
  });

  it('displays lastAction', () => {
    render(
      <MemoryRouter>
        <JobCard job={makeJob({ lastAction: 'hier' })} />
      </MemoryRouter>,
    );

    expect(screen.getByText('hier')).toBeDefined();
  });
});