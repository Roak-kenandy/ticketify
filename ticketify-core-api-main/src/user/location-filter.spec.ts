import {
  evaluateFix,
  LocationFix,
  normalizeAccuracy,
  PendingMove,
  StoredPoint,
} from './location-filter';

const MALE = { latitude: 4.178081, longitude: 73.515235 };
const SEA = { latitude: 4.127165, longitude: 73.513588 };
const t0 = new Date('2026-10-12T07:37:10Z');
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
const last: StoredPoint = { ...MALE, created_at: t0 };

/** Feeds fixes through the filter like the service does and returns each decision. */
function replay(fixes: LocationFix[], from: StoredPoint = last) {
  let current = from;
  let pending: PendingMove | null = null;
  return fixes.map((fix) => {
    const decision = evaluateFix(fix, current, pending);
    if (decision.action === 'store') {
      current = { ...fix, created_at: fix.at };
      pending = null;
    } else if (decision.action === 'hold') {
      pending = decision.pending;
    }
    return decision.action;
  });
}

const jitter = (base: typeof SEA, i: number) => ({
  latitude: base.latitude + i * 0.00002,
  longitude: base.longitude - i * 0.00001,
});

describe('evaluateFix', () => {
  it('stores normal movement', () => {
    const fix = {
      latitude: 4.1785,
      longitude: 73.5155,
      accuracy: 12,
      at: at(15),
    };
    expect(evaluateFix(fix, last, null)).toEqual({ action: 'store' });
  });

  it('holds back a 5.7 km jump in 16 s even when it claims to be accurate', () => {
    const decision = evaluateFix(
      { ...SEA, accuracy: 20, at: at(16) },
      last,
      null,
    );
    expect(decision.action).toBe('hold');
  });

  it('never accepts a stuck fix that repeats the exact same coordinates', () => {
    const fixes = [16, 31, 46, 61, 76, 91, 300, 600].map((s) => ({
      ...SEA,
      accuracy: null,
      at: at(s),
    }));
    expect(replay(fixes).every((action) => action === 'hold')).toBe(true);
  });

  it('accepts a real move once distinct fixes agree over time', () => {
    const fixes = [16, 31, 46, 61].map((s, i) => ({
      ...jitter(SEA, i),
      accuracy: 15,
      at: at(s),
    }));
    expect(replay(fixes)).toEqual(['hold', 'hold', 'hold', 'store']);
  });

  it('requires confirmation for a big jump even after a long gap', () => {
    const fixes = [30 * 60, 30 * 60 + 15].map((s, i) => ({
      ...jitter(SEA, i),
      accuracy: 10,
      at: at(s),
    }));
    expect(replay(fixes)).toEqual(['hold', 'hold']);
  });

  it('allows ordinary moves after a gap without confirmation', () => {
    const fix = {
      latitude: 4.175,
      longitude: 73.509,
      accuracy: 10,
      at: at(600),
    };
    expect(evaluateFix(fix, last, null)).toEqual({ action: 'store' });
  });

  it('restarts confirmation when the held-back fixes disagree', () => {
    const first = evaluateFix({ ...SEA, accuracy: 15, at: at(16) }, last, null);
    const pending = first.action === 'hold' ? first.pending : null;
    const other = {
      latitude: 4.22,
      longitude: 73.54,
      accuracy: 15,
      at: at(31),
    };
    expect(evaluateFix(other, last, pending)).toMatchObject({
      action: 'hold',
      pending: { count: 1 },
    });
  });

  it('treats a missing accuracy as unknown, not perfect', () => {
    expect(normalizeAccuracy(0)).toBeNull();
    expect(normalizeAccuracy(undefined)).toBeNull();
    expect(normalizeAccuracy(14.5)).toBe(14.5);
  });

  it('drops coarse fixes while a recent good point exists', () => {
    expect(
      evaluateFix({ ...MALE, accuracy: 250, at: at(60) }, last, null),
    ).toEqual({ action: 'skip', reason: 'coarse' });
  });

  it('never stores very inaccurate fixes', () => {
    expect(
      evaluateFix({ ...MALE, accuracy: 900, at: at(60) }, null, null),
    ).toEqual({ action: 'skip', reason: 'inaccurate' });
  });

  it('stores accurate offline-synced fixes older than the current point', () => {
    const fix = { ...MALE, accuracy: 10, at: at(-120) };
    expect(evaluateFix(fix, last, null)).toEqual({ action: 'store' });
  });
});
