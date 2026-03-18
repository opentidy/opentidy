import { describe, it, expect } from 'vitest';
import { route, getVersion } from '../src/cli.js';

describe('cli', () => {
  it('returns "start" for alfred start', () => {
    expect(route(['start'])).toBe('start');
  });

  it('returns "start" when no args (default)', () => {
    expect(route([])).toBe('start');
  });

  it('returns "version" for --version', () => {
    expect(route(['--version'])).toBe('version');
  });

  it('returns "version" for -v', () => {
    expect(route(['-v'])).toBe('version');
  });

  it('returns "help" for --help', () => {
    expect(route(['--help'])).toBe('help');
  });

  it('returns "help" for unknown command', () => {
    expect(route(['nonsense'])).toBe('help');
  });

  it('routes all known commands', () => {
    for (const cmd of ['setup', 'doctor', 'status', 'update', 'logs', 'uninstall']) {
      expect(route([cmd])).toBe(cmd);
    }
  });

  it('getVersion returns a string', () => {
    const v = getVersion();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });
});
