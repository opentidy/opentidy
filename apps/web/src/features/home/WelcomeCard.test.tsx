// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../shared/i18n/i18n';
import WelcomeCard from './WelcomeCard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('WelcomeCard', () => {
  it('renders welcome title and CTA', () => {
    render(<MemoryRouter><WelcomeCard /></MemoryRouter>);
    expect(screen.getByText(/Welcome to OpenTidy|Bienvenue sur OpenTidy/)).toBeDefined();
    expect(screen.getByText(/Create my first task|Créer ma première tâche/)).toBeDefined();
  });

  it('renders the 3 pillars', () => {
    render(<MemoryRouter><WelcomeCard /></MemoryRouter>);
    expect(screen.getByText(/Your tasks|Tes tâches/)).toBeDefined();
    expect(screen.getByText(/Autonomous|Autonome/)).toBeDefined();
    expect(screen.getByText(/Your control|Ton contrôle/)).toBeDefined();
  });

  it('navigates to /nouveau on CTA click', () => {
    render(<MemoryRouter><WelcomeCard /></MemoryRouter>);
    fireEvent.click(screen.getByText(/Create my first task|Créer ma première tâche/));
    expect(mockNavigate).toHaveBeenCalledWith('/nouveau');
  });

  it('calls onDismiss on explore click', () => {
    const onDismiss = vi.fn();
    render(<MemoryRouter><WelcomeCard onDismiss={onDismiss} /></MemoryRouter>);
    fireEvent.click(screen.getByText(/Explore|Explorer/));
    expect(onDismiss).toHaveBeenCalled();
  });
});
