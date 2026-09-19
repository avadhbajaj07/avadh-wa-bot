import { describe, expect, it } from 'vitest';
import { parsePastedNumbers, formatPhoneNumber } from './parse-pasted-numbers';

describe('formatPhoneNumber', () => {
  it('formats 10-digit Indian numbers starting with 6-9 to +91', () => {
    expect(formatPhoneNumber('9406633778')).toBe('+919406633778');
    expect(formatPhoneNumber('7282316090')).toBe('+917282316090');
    expect(formatPhoneNumber('8888888888')).toBe('+918888888888');
    expect(formatPhoneNumber('6262626262')).toBe('+916262626262');
  });

  it('formats 11-digit numbers with leading 0 to +91', () => {
    expect(formatPhoneNumber('09406633778')).toBe('+919406633778');
  });

  it('formats 12-digit numbers with 91 prefix to +91', () => {
    expect(formatPhoneNumber('919406633778')).toBe('+919406633778');
  });

  it('preserves existing + prefix', () => {
    expect(formatPhoneNumber('+919406633778')).toBe('+919406633778');
    expect(formatPhoneNumber('+15551234567')).toBe('+15551234567');
  });

  it('cleans spaces, dashes, and parens', () => {
    expect(formatPhoneNumber('+91 94066-33778')).toBe('+919406633778');
    expect(formatPhoneNumber('(940) 663-3778')).toBe('+919406633778');
  });

  it('returns null for empty or too short input', () => {
    expect(formatPhoneNumber('')).toBeNull();
    expect(formatPhoneNumber('1234')).toBeNull();
  });
});

describe('parsePastedNumbers', () => {
  it('parses newline-separated phone numbers', () => {
    const text = `9406633778
7282316090
9823456789`;
    const res = parsePastedNumbers(text);
    expect(res.validCount).toBe(3);
    expect(res.duplicatesCount).toBe(0);
    expect(res.contacts).toEqual([
      { phone: '+919406633778' },
      { phone: '+917282316090' },
      { phone: '+919823456789' },
    ]);
  });

  it('parses comma-separated numbers', () => {
    const text = '9406633778, 7282316090, +919823456789';
    const res = parsePastedNumbers(text);
    expect(res.validCount).toBe(3);
  });

  it('parses numbers with names', () => {
    const text = `9406633778, Shikha
7282316090 - Maruti Digital
Ramesh - 9823456789`;
    const res = parsePastedNumbers(text);
    expect(res.validCount).toBe(3);
    expect(res.contacts).toEqual([
      { phone: '+919406633778', name: 'Shikha' },
      { phone: '+917282316090', name: 'Maruti Digital' },
      { phone: '+919823456789', name: 'Ramesh' },
    ]);
  });

  it('de-duplicates numbers across formats', () => {
    const text = `9406633778
+91 94066 33778
09406633778
7282316090`;
    const res = parsePastedNumbers(text);
    expect(res.validCount).toBe(2);
    expect(res.duplicatesCount).toBe(2);
  });
});
