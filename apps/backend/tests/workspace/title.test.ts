import { describe, it, expect } from 'vitest';
import { cleanTitle } from '../../src/workspace/title.js';

describe('cleanTitle', () => {
  it('trims whitespace', () => {
    expect(cleanTitle('  Veille fiscale  ')).toBe('Veille fiscale');
  });

  it('strips surrounding double quotes', () => {
    expect(cleanTitle('"Veille fiscale Chypre"')).toBe('Veille fiscale Chypre');
  });

  it('strips surrounding single quotes', () => {
    expect(cleanTitle("'Veille fiscale Chypre'")).toBe('Veille fiscale Chypre');
  });

  it('strips surrounding backticks', () => {
    expect(cleanTitle('`Veille fiscale Chypre`')).toBe('Veille fiscale Chypre');
  });

  it('strips trailing period', () => {
    expect(cleanTitle('Veille fiscale Chypre.')).toBe('Veille fiscale Chypre');
  });

  it('strips trailing ellipsis', () => {
    expect(cleanTitle('Veille fiscale Chypre…')).toBe('Veille fiscale Chypre');
  });

  it('takes first non-empty line from multi-line output', () => {
    expect(cleanTitle('\n  Veille fiscale\nExtra line\n')).toBe('Veille fiscale');
  });

  it('truncates to 50 chars with ellipsis', () => {
    const long = 'A'.repeat(60);
    const result = cleanTitle(long);
    expect(result.length).toBe(50);
    expect(result).toBe('A'.repeat(47) + '...');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(cleanTitle('   ')).toBe('');
  });

  it('handles combined formatting issues', () => {
    expect(cleanTitle('  "Récap météo quotidien."  \n')).toBe('Récap météo quotidien');
  });
});
