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

describe('normalizeRelayUrl relative paths', () => {
  it('resolves a leading slash against the page origin', () => {
    (globalThis as unknown as { location: { origin: string; hostname: string } }).location = { origin: 'http://localhost:5173', hostname: 'localhost' };
    expect(normalizeRelayUrl('/relay')).toBe('http://localhost:5173/relay/');
    expect(normalizeRelayUrl('/relay/')).toBe('http://localhost:5173/relay/');
    delete (globalThis as { location?: unknown }).location;
  });
});
