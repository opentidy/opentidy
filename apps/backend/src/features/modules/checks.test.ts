// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { runCheckCommand, isModuleConfigured } from './checks.js';
import type { ModuleManifest } from '@opentidy/shared';

describe('runCheckCommand', () => {
  it('returns true when command succeeds', () => {
    expect(runCheckCommand('true')).toBe(true);
  });

  it('returns false when command fails', () => {
    expect(runCheckCommand('false')).toBe(false);
  });

  it('returns false when command does not exist', () => {
    expect(runCheckCommand('nonexistent-binary-xyz')).toBe(false);
  });
});

describe('isModuleConfigured', () => {
  it('returns true when no config fields', () => {
    const manifest: ModuleManifest = { name: 'test', label: 'Test', description: '', version: '1.0.0' };
    expect(isModuleConfigured(manifest, {})).toBe(true);
  });

  it('returns true when no required config fields', () => {
    const manifest: ModuleManifest = {
      name: 'test', label: 'Test', description: '', version: '1.0.0',
      setup: { configFields: [{ key: 'opt', label: 'Optional', type: 'text' }] },
    };
    expect(isModuleConfigured(manifest, {})).toBe(true);
  });

  it('returns false when required fields are missing', () => {
    const manifest: ModuleManifest = {
      name: 'test', label: 'Test', description: '', version: '1.0.0',
      setup: {
        configFields: [
          { key: 'token', label: 'Token', type: 'password', required: true },
          { key: 'chatId', label: 'Chat ID', type: 'text', required: true },
        ],
      },
    };
    expect(isModuleConfigured(manifest, {})).toBe(false);
  });

  it('returns false when required fields are empty strings', () => {
    const manifest: ModuleManifest = {
      name: 'test', label: 'Test', description: '', version: '1.0.0',
      setup: {
        configFields: [{ key: 'token', label: 'Token', type: 'password', required: true }],
      },
    };
    expect(isModuleConfigured(manifest, { token: '' })).toBe(false);
  });

  it('returns true when all required fields are filled', () => {
    const manifest: ModuleManifest = {
      name: 'test', label: 'Test', description: '', version: '1.0.0',
      setup: {
        configFields: [
          { key: 'token', label: 'Token', type: 'password', required: true },
          { key: 'opt', label: 'Optional', type: 'text' },
        ],
      },
    };
    expect(isModuleConfigured(manifest, { token: 'abc' })).toBe(true);
  });
});

describe('isModuleConfigured with keychain fields', () => {
  it('returns true when required keychain field has a value in keychain', () => {
    const manifest: ModuleManifest = {
      name: 'test', label: 'Test', description: 'Test', version: '1.0.0',
      setup: {
        configFields: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true, storage: 'keychain' },
        ],
      },
    };
    const getPassword = vi.fn().mockReturnValue('stored-key');
    expect(isModuleConfigured(manifest, {}, { getPassword })).toBe(true);
    expect(getPassword).toHaveBeenCalledWith('test', 'apiKey');
  });

  it('returns false when required keychain field is missing from keychain', () => {
    const manifest: ModuleManifest = {
      name: 'test', label: 'Test', description: 'Test', version: '1.0.0',
      setup: {
        configFields: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true, storage: 'keychain' },
        ],
      },
    };
    const getPassword = vi.fn().mockReturnValue(null);
    expect(isModuleConfigured(manifest, {}, { getPassword })).toBe(false);
  });

  it('returns true for optional keychain fields regardless of keychain state', () => {
    const manifest: ModuleManifest = {
      name: 'test', label: 'Test', description: 'Test', version: '1.0.0',
      setup: {
        configFields: [
          { key: 'apiKey', label: 'API Key', type: 'password', storage: 'keychain' },
        ],
      },
    };
    expect(isModuleConfigured(manifest, {})).toBe(true);
  });
});
