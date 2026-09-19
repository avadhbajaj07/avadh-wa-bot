import { normalizeKey } from './dedupe';

export interface PastedContact {
  phone: string;
  name?: string;
}

export interface ParsePastedNumbersResult {
  contacts: PastedContact[];
  totalParsed: number;
  validCount: number;
  duplicatesCount: number;
  invalidCount: number;
  invalidLines: string[];
}

/**
 * Format a phone number into international standard.
 * If 10 digits starting with 6, 7, 8, 9 (standard Indian mobile): prepends +91.
 * If 11 digits starting with 0: strips 0 and prepends +91.
 * If 12 digits starting with 91: prepends +.
 * If already starts with +: keeps +.
 */
export function formatPhoneNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Indian mobile: 10 digits starting with 6, 7, 8, 9
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`;
  }

  // Indian mobile with leading 0: 09406633778
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    return `+91${digits.slice(1)}`;
  }

  // Indian mobile with 91 prefix without +: 919406633778
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return `+${digits}`;
  }

  // General E.164-like number (7-15 digits)
  if (digits.length >= 7 && digits.length <= 15) {
    if (raw.trim().startsWith('+')) {
      return `+${digits}`;
    }
    return digits.length === 10 && /^[6-9]/.test(digits) ? `+91${digits}` : `+${digits}`;
  }

  return null;
}

/**
 * Parse directly pasted text containing up to 500+ numbers.
 * Supports:
 * - One number per line: "9406633778\n7282316090"
 * - Comma / semicolon / tab separated: "9406633778, 7282316090"
 * - Number with name: "9406633778, Ramesh" or "9406633778 - Ramesh" or "Ramesh - 9406633778"
 */
export function parsePastedNumbers(text: string): ParsePastedNumbersResult {
  if (!text || !text.trim()) {
    return {
      contacts: [],
      totalParsed: 0,
      validCount: 0,
      duplicatesCount: 0,
      invalidCount: 0,
      invalidLines: [],
    };
  }

  // Split by newlines first; if only 1 line, also check comma/semicolon/tab
  const entries: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // If a line contains multiple comma-separated items without letters, treat as list
    if (trimmed.includes(',') && !trimmed.match(/[a-zA-Z]/)) {
      entries.push(...trimmed.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (trimmed.includes(';') && !trimmed.match(/[a-zA-Z]/)) {
      entries.push(...trimmed.split(';').map((s) => s.trim()).filter(Boolean));
    } else {
      entries.push(trimmed);
    }
  }

  const seenKeys = new Set<string>();
  const contacts: PastedContact[] = [];
  let duplicatesCount = 0;
  let invalidCount = 0;
  const invalidLines: string[] = [];

  for (const entry of entries) {
    // Try to extract phone and optional name
    let phonePart = '';
    let namePart: string | undefined;

    // Check for "number, name" or "number - name" or "number | name"
    const splitMatch = entry.match(/^([+0-9\s().-]+)(?:,|\t|-|\|)(.*)$/);
    const reverseMatch = entry.match(/^(.*?)(?:,|\t|-|\|)\s*([+0-9\s().-]{7,})$/);

    if (splitMatch && splitMatch[1].replace(/\D/g, '').length >= 7) {
      phonePart = splitMatch[1].trim();
      const rawName = splitMatch[2]?.trim();
      if (rawName && !/^[0-9\s().-]+$/.test(rawName)) {
        namePart = rawName.replace(/^["']|["']$/g, '').trim();
      }
    } else if (reverseMatch && reverseMatch[2].replace(/\D/g, '').length >= 7) {
      phonePart = reverseMatch[2].trim();
      const rawName = reverseMatch[1]?.trim();
      if (rawName && !/^[0-9\s().-]+$/.test(rawName)) {
        namePart = rawName.replace(/^["']|["']$/g, '').trim();
      }
    } else {
      phonePart = entry;
    }

    const formatted = formatPhoneNumber(phonePart);
    if (!formatted) {
      invalidCount++;
      invalidLines.push(entry);
      continue;
    }

    const key = normalizeKey(formatted);
    if (seenKeys.has(key)) {
      duplicatesCount++;
      continue;
    }

    seenKeys.add(key);
    contacts.push(namePart ? { phone: formatted, name: namePart } : { phone: formatted });
  }

  return {
    contacts,
    totalParsed: entries.length,
    validCount: contacts.length,
    duplicatesCount,
    invalidCount,
    invalidLines,
  };
}
