// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Amelioration } from '@opentidy/shared';
import '../../shared/i18n/i18n';
import Ameliorations from './Ameliorations';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockResolveAmelioration = vi.fn();
const mockIgnoreAmelioration = vi.fn();
let storeState: Record<string, unknown>;

vi.mock('../../shared/store', () => ({
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

    expect(screen.getByText(/Improvements|Améliorations/)).toBeDefined();
    // The count badge should show the translated plural form (e.g. "2 open")
    await waitFor(() => {
      expect(screen.getByText('2 open')).toBeDefined();
    });
  });

  it('shows filter buttons for Open and Resolved', () => {
    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    expect(screen.getByText('Open')).toBeDefined();
    // "Resolved" appears in both filter tab and card action buttons
    expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0);
  });

  it('clicking "Resolved" filter shows only resolved ameliorations', () => {
    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    // "Resolved" appears in both filter tab and card action buttons — use getAllByText
    const resolvedButtons = screen.getAllByText('Resolved');
    // Click the filter tab (first occurrence, in the filter bar)
    fireEvent.click(resolvedButtons[0]);

    expect(screen.getByText('Old fix')).toBeDefined();
    expect(screen.queryByText('Error handling')).toBeNull();
    expect(screen.queryByText('Add retry logic')).toBeNull();
  });

  it('"Resolved" action button calls resolveAmelioration', () => {
    storeState.ameliorations = [
      makeAmelioration({ id: 'amel-42', title: 'Specific fix', resolved: false, status: 'open' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    // The card's "Resolved" button is the last one (filter tab is first)
    const resolvedButtons = screen.getAllByText('Resolved');
    fireEvent.click(resolvedButtons[resolvedButtons.length - 1]);

    expect(mockResolveAmelioration).toHaveBeenCalledWith('amel-42');
  });

  it('"Resolved" action button not shown for resolved items', () => {
    storeState.ameliorations = [
      makeAmelioration({ id: 'amel-3', title: 'Old fix', resolved: true, status: 'resolved' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    // Click the "Resolved" filter tab
    const resolvedButtons = screen.getAllByText('Resolved');
    fireEvent.click(resolvedButtons[0]);

    // After filtering to resolved items, the card action button should not appear
    // Only the filter tab "Resolved" should remain (no card-level "Resolved" action)
    const afterFilterButtons = screen.getAllByText('Resolved');
    expect(afterFilterButtons.length).toBe(1); // Only the filter tab
  });

  it('job link navigates to /job/{jobId}', () => {
    storeState.ameliorations = [
      makeAmelioration({ id: 'amel-1', jobId: 'acme', resolved: false, status: 'open' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    // The button text includes the jobId
    const jobButton = screen.getByText(/Job: acme/);
    fireEvent.click(jobButton);

    expect(mockNavigate).toHaveBeenCalledWith('/job/acme');
  });

  it('does not show job link when jobId is missing', () => {
    storeState.ameliorations = [
      makeAmelioration({ id: 'amel-1', jobId: undefined, resolved: false, status: 'open' }),
    ];

    render(
      <MemoryRouter>
        <Ameliorations />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Job:/)).toBeNull();
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
      expect(screen.getByText('No open analyses')).toBeDefined();
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

    // "Resolved" appears in filter tab and card action — click the filter tab
    const resolvedButtons = screen.getAllByText('Resolved');
    fireEvent.click(resolvedButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('No resolved analyses')).toBeDefined();
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