// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../shared/i18n/i18n';
import ExampleChips from './ExampleChips';

describe('ExampleChips', () => {
  it('renders 4 example chips', () => {
    render(<ExampleChips onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(4);
  });

  it('calls onSelect with full text when chip is clicked', () => {
    const onSelect = vi.fn();
    render(<ExampleChips onSelect={onSelect} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].length).toBeGreaterThan(20);
  });
});
