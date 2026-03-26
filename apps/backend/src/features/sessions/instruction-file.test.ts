// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { generateTaskInstructions } from './instruction-file.js';

vi.mock('fs');

describe('generateTaskInstructions', () => {
  beforeEach(() => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.unlinkSync).mockImplementation(() => {});
  });

  it('writes INSTRUCTIONS.md and native agent file', () => {
    generateTaskInstructions({
      workspaceDir: '/workspace',
      taskId: 'test-task',
      taskInfo: { title: 'Test', objective: 'Do stuff' },
      instructionFile: 'CLAUDE.md',
    });

    // INSTRUCTIONS.md (source of truth)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/workspace/test-task/INSTRUCTIONS.md',
      expect.stringContaining('# Task: Test'),
    );
    // Native copy
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/workspace/test-task/CLAUDE.md',
      expect.stringContaining('# Task: Test'),
    );
  });

  it('writes GEMINI.md when instructionFile is GEMINI.md', () => {
    generateTaskInstructions({
      workspaceDir: '/workspace',
      taskId: 'test-task',
      taskInfo: { title: 'Test', objective: 'Do stuff' },
      instructionFile: 'GEMINI.md',
    });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/workspace/test-task/GEMINI.md',
      expect.any(String),
    );
  });

  it('cleans up stale instruction files from other agents', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('CLAUDE.md'));

    generateTaskInstructions({
      workspaceDir: '/workspace',
      taskId: 'test-task',
      taskInfo: { title: 'Test', objective: 'Do stuff' },
      instructionFile: 'GEMINI.md',
    });

    expect(fs.unlinkSync).toHaveBeenCalledWith('/workspace/test-task/CLAUDE.md');
  });

  it('includes trigger event', () => {
    generateTaskInstructions({
      workspaceDir: '/workspace',
      taskId: 'test-task',
      taskInfo: { title: 'Test', objective: 'Do stuff' },
      instructionFile: 'CLAUDE.md',
      event: { source: 'email', content: 'New email received' },
    });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/workspace/test-task/INSTRUCTIONS.md',
      expect.stringContaining('Source: email'),
    );
  });
});
