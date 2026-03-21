// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Task } from '@opentidy/shared';
import '../../shared/i18n/i18n';
import TaskCard from './TaskCard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'acme-corp',
    status: 'IN_PROGRESS',
    title: 'Task Acme',
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

describe('TaskCard', () => {
  it('displays title and objective', () => {
    render(
      <MemoryRouter>
        <TaskCard task={makeTask()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Task Acme')).toBeDefined();
    expect(screen.getByText('Resolve contract issue with Acme')).toBeDefined();
  });

  it('displays IN_PROGRESS status with green dot and badge', () => {
    const { container } = render(
      <MemoryRouter>
        <TaskCard task={makeTask({ status: 'IN_PROGRESS' })} />
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
        <TaskCard task={makeTask({ status: 'COMPLETED' })} />
      </MemoryRouter>,
    );

    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('opacity-50');
  });

  it('shows "Terminal" indicator when session is active', () => {
    render(
      <MemoryRouter>
        <TaskCard task={makeTask({})} session={{ id: 's1', taskId: 'test', status: 'active', startedAt: new Date().toISOString() }} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Terminal')).toBeDefined();
  });

  it('click navigates to /task/{id}', () => {
    const { container } = render(
      <MemoryRouter>
        <TaskCard task={makeTask({ id: 'my-task' })} />
      </MemoryRouter>,
    );

    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(mockNavigate).toHaveBeenCalledWith('/task/my-task');
  });

  it('displays lastAction', () => {
    render(
      <MemoryRouter>
        <TaskCard task={makeTask({ lastAction: 'hier' })} />
      </MemoryRouter>,
    );

    expect(screen.getByText('hier')).toBeDefined();
  });
});