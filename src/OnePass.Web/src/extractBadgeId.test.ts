import { describe, it, expect } from 'vitest';
import { extractBadgeId } from './pages/ScanPage';

describe('extractBadgeId', () => {
  it('extracts badgeId from a Microsoft TechConnect URL', () => {
    const url = 'https://events.techconnect.microsoft.com/badgeScan?badgeId=1764970920345001Tamq&data=Ym5sZWptZXBrYWVqaGBgYsOIw4TCn8Knwo99wq7Cj3zCn8KiwpXClw%3D%3D';
    expect(extractBadgeId(url)).toBe('1764970920345001Tamq');
  });

  it('returns the raw value when no badgeId is present', () => {
    expect(extractBadgeId('alice-123')).toBe('alice-123');
  });

  it('handles badgeId in any URL position via fallback regex', () => {
    expect(extractBadgeId('weird://x?foo=1&badgeId=ABC123')).toBe('ABC123');
  });

  it('trims whitespace', () => {
    expect(extractBadgeId('   alice-123   ')).toBe('alice-123');
  });

  it('returns empty string for empty input', () => {
    expect(extractBadgeId('')).toBe('');
  });
});
