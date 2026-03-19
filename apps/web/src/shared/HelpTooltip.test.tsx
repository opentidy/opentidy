// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpTooltip from './HelpTooltip';

describe('HelpTooltip', () => {
  it('renders a (?) button', () => {
    render(<HelpTooltip text="Help text" />);
    expect(screen.getByRole('button')).toBeDefined();
    expect(screen.getByText('?')).toBeDefined();
  });

  it('shows tooltip text on click', () => {
    render(<HelpTooltip text="Explanation here" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Explanation here')).toBeDefined();
  });

  it('hides tooltip on second click', () => {
    render(<HelpTooltip text="Explanation here" />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByText('Explanation here')).toBeDefined();
    fireEvent.click(btn);
    expect(screen.queryByText('Explanation here')).toBeNull();
  });
});
