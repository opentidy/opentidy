// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect } from 'vitest';
import { loadModuleManifest, loadCuratedModules, loadCustomModules } from './loader.js';

const VALID_MANIFEST = {
  name: 'email',
  label: 'Email',
  description: 'Email integration',
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

    expect(manifest.name).toBe('email');
    expect(manifest.label).toBe('Email');
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

    const mod1 = join(baseDir, 'email');
    mkdirSync(mod1);
    writeManifest(mod1, { ...VALID_MANIFEST, name: 'email', label: 'Email' });

    const mod2 = join(baseDir, 'telegram');
    mkdirSync(mod2);
    writeManifest(mod2, { ...VALID_MANIFEST, name: 'telegram', label: 'Telegram' });

    const result = loadCuratedModules(baseDir);

    expect(result.size).toBe(2);
    expect(result.has('email')).toBe(true);
    expect(result.has('telegram')).toBe(true);
  });

  it('skips directories without module.json', () => {
    const baseDir = makeTmpDir();

    // Directory with manifest
    const mod1 = join(baseDir, 'email');
    mkdirSync(mod1);
    writeManifest(mod1, { ...VALID_MANIFEST, name: 'email' });

    // Directory without manifest
    const noManifest = join(baseDir, 'empty-module');
    mkdirSync(noManifest);

    const result = loadCuratedModules(baseDir);

    expect(result.size).toBe(1);
    expect(result.has('email')).toBe(true);
  });

  it('returns empty Map for non-existent directory', () => {
    const result = loadCuratedModules('/tmp/opentidy-nonexistent-dir-xyz');

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});

describe('loadCustomModules', () => {
  it('loads custom modules from directory', () => {
    const baseDir = makeTmpDir();
    const mod = join(baseDir, 'my-plugin');
    mkdirSync(mod);
    writeManifest(mod, { ...VALID_MANIFEST, name: 'my-plugin', label: 'My Plugin' });

    const result = loadCustomModules(baseDir);

    expect(result.size).toBe(1);
    expect(result.get('my-plugin')).toBeDefined();
    expect(result.get('my-plugin')!.label).toBe('My Plugin');
  });

  it('skips modules that collide with curated names', () => {
    const baseDir = makeTmpDir();
    const mod = join(baseDir, 'email');
    mkdirSync(mod);
    writeManifest(mod, { ...VALID_MANIFEST, name: 'email' });

    const curatedNames = new Set(['email']);
    const result = loadCustomModules(baseDir, curatedNames);

    expect(result.size).toBe(0);
  });

  it('returns empty map if directory does not exist', () => {
    const result = loadCustomModules('/tmp/opentidy-nonexistent-custom-xyz');

    expect(result.size).toBe(0);
  });

  it('skips directories without module.json', () => {
    const baseDir = makeTmpDir();
    mkdirSync(join(baseDir, 'empty-dir'));

    const result = loadCustomModules(baseDir);

    expect(result.size).toBe(0);
  });
});
