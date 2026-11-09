import { normalizeSerial } from './serial';

describe('normalizeSerial', () => {
  it('stores a GPON serial as printed on the label (16 hex), whichever form was scanned', () => {
    expect(normalizeSerial('48575443686aec86')).toBe('48575443686AEC86');
    expect(normalizeSerial('HWTC686AEC86')).toBe('48575443686AEC86');
    expect(normalizeSerial(' hwtc 686aec86 ')).toBe('48575443686AEC86');
    expect(normalizeSerial('HWTC-686AEC86')).toBe('48575443686AEC86');
    expect(normalizeSerial('ZTEGC1234567')).toBe('5A544547C1234567');
  });

  it('leaves other serials as typed', () => {
    expect(normalizeSerial('2224123000123')).toBe('2224123000123');
    expect(normalizeSerial('21530369847NG3000123')).toBe('21530369847NG3000123');
    expect(normalizeSerial('HWTC0001')).toBe('HWTC0001');
    expect(normalizeSerial('')).toBeNull();
  });
});
