import { describe, expect, it } from 'vitest';
import { normalizeRelayUrl } from './client';
describe('normalizeRelayUrl', () => {
  it('adds scheme and single trailing slash', () => {
    expect(normalizeRelayUrl('localhost:8787')).toBe('http://localhost:8787/');
    expect(normalizeRelayUrl('http://localhost:8787/')).toBe('http://localhost:8787/');
    expect(normalizeRelayUrl(' https://relay.example.com// ')).toBe('https://relay.example.com/');
    expect(normalizeRelayUrl('')).toBe('');
  });
});
