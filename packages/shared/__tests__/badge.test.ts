jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('expo-notifications', () => ({ setBadgeCountAsync: jest.fn() }));

import { computeBadgeCount } from '../lib/badge';

describe('computeBadgeCount', () => {
  it('sums notifications and messages', () => {
    expect(computeBadgeCount(3, 2)).toBe(5);
  });
  it('treats negatives as zero', () => {
    expect(computeBadgeCount(-1, -2)).toBe(0);
  });
});
