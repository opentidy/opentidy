import { describe, it, expect } from 'vitest';
import { isNewerVersion, parseInterval } from '../../src/infra/updater.js';

describe('updater', () => {
  it('detects newer version', () => {
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(true);
    expect(isNewerVersion('1.1.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.2.3', '2.0.0')).toBe(true);
    expect(isNewerVersion('0.0.1', '0.0.2')).toBe(true);
    expect(isNewerVersion('1.9.9', '2.0.0')).toBe(true);
  });

  it('parseInterval converts to ms', () => {
    expect(parseInterval('6h')).toBe(6 * 60 * 60 * 1000);
    expect(parseInterval('30m')).toBe(30 * 60 * 1000);
    expect(parseInterval('1d')).toBe(24 * 60 * 60 * 1000);
    expect(parseInterval('12h')).toBe(12 * 60 * 60 * 1000);
  });

  it('parseInterval defaults to 6h for invalid input', () => {
    expect(parseInterval('invalid')).toBe(6 * 60 * 60 * 1000);
    expect(parseInterval('')).toBe(6 * 60 * 60 * 1000);
  });
});
