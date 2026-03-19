// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect } from 'vitest';
import { loadModuleManifest, loadCuratedModules } from './loader.js';

const VALID_MANIFEST = {
  name: 'gmail',
  label: 'Gmail',
  description: 'Gmail integration',
  version: '1.0.0',
  platform: 'all',
};

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'opentidy-modules-test-'));
}

function writeManifest(dir: string, data: unknown): void {
  writeFileSync(join(dir, 'module.json'), JSON.stringify(data), 'utf-8');
}

describe('loadModuleManifest', () => {
  it('loads and validates a valid manifest', () => {
    const moduleDir = makeTmpDir();
    writeManifest(moduleDir, VALID_MANIFEST);

    const manifest = loadModuleManifest(moduleDir);

    expect(manifest.name).toBe('gmail');
    expect(manifest.label).toBe('Gmail');
    expect(manifest.version).toBe('1.0.0');
  });

  it('throws for invalid manifest (missing name)', () => {
    const moduleDir = makeTmpDir();
    writeManifest(moduleDir, { label: 'No Name', description: 'missing name', version: '1.0.0' });

    expect(() => loadModuleManifest(moduleDir)).toThrow();
  });

  it('throws for missing file', () => {
    const moduleDir = makeTmpDir();

    expect(() => loadModuleManifest(moduleDir)).toThrow();
  });
});

describe('loadCuratedModules', () => {
  it('discovers all valid modules in a directory', () => {
    const baseDir = makeTmpDir();

    const mod1 = join(baseDir, 'gmail');
    mkdirSync(mod1);
    writeManifest(mod1, { ...VALID_MANIFEST, name: 'gmail', label: 'Gmail' });

    const mod2 = join(baseDir, 'telegram');
    mkdirSync(mod2);
    writeManifest(mod2, { ...VALID_MANIFEST, name: 'telegram', label: 'Telegram' });

    const result = loadCuratedModules(baseDir);

    expect(result.size).toBe(2);
    expect(result.has('gmail')).toBe(true);
    expect(result.has('telegram')).toBe(true);
  });

  it('skips directories without module.json', () => {
    const baseDir = makeTmpDir();

    // Directory with manifest
    const mod1 = join(baseDir, 'gmail');
    mkdirSync(mod1);
    writeManifest(mod1, { ...VALID_MANIFEST, name: 'gmail' });

    // Directory without manifest
    const noManifest = join(baseDir, 'empty-module');
    mkdirSync(noManifest);

    const result = loadCuratedModules(baseDir);

    expect(result.size).toBe(1);
    expect(result.has('gmail')).toBe(true);
  });

  it('returns empty Map for non-existent directory', () => {
    const result = loadCuratedModules('/tmp/opentidy-nonexistent-dir-xyz');

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});
