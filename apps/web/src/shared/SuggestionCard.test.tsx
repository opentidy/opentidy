// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Suggestion } from '@opentidy/shared';
import './i18n/i18n';
import SuggestionCard from './SuggestionCard';

const mockApproveSuggestion = vi.fn();
const mockIgnoreSuggestion = vi.fn();

vi.mock('./store', () => ({
  useStore: () => ({
    approveSuggestion: mockApproveSuggestion,
    ignoreSuggestion: mockIgnoreSuggestion,
  }),
}));

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    slug: 'tax-filing-2025',
    title: 'Tax filing 2025',
    urgency: 'normal',
    source: 'gmail',
    date: '2026-03-14',
    summary: 'Deadline approaching for tax filing',
    why: 'Tax deadline is next week',
    whatIWouldDo: 'File the taxes',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SuggestionCard', () => {
  it('displays title, why, and urgency badge', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} />);

    expect(screen.getByText('Tax filing 2025')).toBeDefined();
    expect(screen.getByText('Tax deadline is next week')).toBeDefined();
    expect(screen.getByText('normal')).toBeDefined();
  });

  it('displays source label and date', () => {
    render(<SuggestionCard suggestion={makeSuggestion()} />);

    expect(screen.getByText('Email')).toBeDefined();
    expect(screen.getByText('2026-03-14')).toBeDefined();
  });

  it('renders urgent urgency with red classes', () => {
    render(<SuggestionCard suggestion={makeSuggestion({ urgency: 'urgent' })} />);

    const badge = screen.getByText('urgent');
    expect(badge.className).toContain('text-red');
    expect(badge.className).toContain('bg-red/20');
  });

  it('renders normal urgency with accent classes', () => {
    render(<SuggestionCard suggestion={makeSuggestion({ urgency: 'normal' })} />);

    const badge = screen.getByText('normal');
    expect(badge.className).toContain('text-accent');
    expect(badge.className).toContain('bg-accent/20');
  });

  it('renders low urgency with tertiary classes', () => {
    render(<SuggestionCard suggestion={makeSuggestion({ urgency: 'low' })} />);

    const badge = screen.getByText('low');
    expect(badge.className).toContain('text-text-tertiary');
    expect(badge.className).toContain('bg-text-tertiary/20');
  });

  it('"Create task" button calls approveSuggestion with slug', () => {
    render(<SuggestionCard suggestion={makeSuggestion({ slug: 'my-slug' })} />);

    fireEvent.click(screen.getByText('Create task'));

    expect(mockApproveSuggestion).toHaveBeenCalledWith('my-slug');
  });

  it('"Ignore" button calls ignoreSuggestion with slug', () => {
    render(<SuggestionCard suggestion={makeSuggestion({ slug: 'my-slug' })} />);

    fireEvent.click(screen.getByText('Ignore'));

    expect(mockIgnoreSuggestion).toHaveBeenCalledWith('my-slug');
  });
});