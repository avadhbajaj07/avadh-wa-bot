import { formatPhoneNumber } from './parse-pasted-numbers';

/**
 * CSV parsing for the contacts import modal and broadcast wizard.
 * Shared + unit-tested so tag-column handling stays aligned with
 * phone/name/email/company.
 */

export interface ParsedContactRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  /** Tag names from the optional `tags` column (comma/semicolon separated). */
  tagNames: string[];
}

/** Split a CSV cell into unique tag names (case-insensitive de-dupe). */
export function parseTagCell(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of value.split(/[,;]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export interface ParseContactCsvResult {
  rows: ParsedContactRow[];
  /**
   * True when the CSV header includes the required `phone` column.
   * `rows` is empty both when the column is missing and when the file
   * simply has no usable data rows; callers that need to tell those
   * apart (to pick the right error message) read this flag.
   */
  hasPhoneColumn: boolean;
  /** True when the CSV header includes a `tags` column. */
  hasTagsColumn: boolean;
  /** True when the CSV header includes a `company` column. */
  hasCompanyColumn: boolean;
}

/** Detect delimiter (, or ; or \t or |) from the first line. */
function detectDelimiter(firstLine: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQuotes = false;
  for (const c of firstLine) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c in counts) counts[c]++;
  }
  let best = ',';
  let max = 0;
  for (const [delim, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      best = delim;
    }
  }
  return best;
}

export function parseContactCsv(text: string): ParseContactCsvResult {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/);
  if (lines.length === 0 || (lines.length === 1 && !lines[0].trim())) {
    return {
      rows: [],
      hasPhoneColumn: false,
      hasTagsColumn: false,
      hasCompanyColumn: false,
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((h) =>
    h.trim().toLowerCase().replace(/["']/g, '')
  );

  // Flexible header matching
  const phoneIdx = headers.findIndex((h) =>
    /^(phone|mobile|contact|cell|tel|whatsapp|number|phone_?number|mobile_?number|contact_?number|phone_?no|mobile_?no|phonenumber|mobilenumber)(\s|_|-)?/i.test(
      h
    ) ||
    h.includes('phone') ||
    h.includes('mobile') ||
    h.includes('whatsapp') ||
    h === 'contact' ||
    h === 'number'
  );

  const nameIdx = headers.findIndex((h) =>
    /^(name|full_?name|first_?name|fullname|firstname|contact_?name|customer_?name|client_?name|user_?name)/i.test(
      h
    )
  );
  const emailIdx = headers.findIndex((h) =>
    /^(email|email_?address|e-mail)/i.test(h)
  );
  const companyIdx = headers.findIndex((h) =>
    /^(company|organization|organisation|business)/i.test(h)
  );
  const tagsIdx = headers.findIndex((h) =>
    /^(tag|tags|tag_?names|tagnames|labels|category|categories|group|groups)/i.test(
      h
    )
  );

  // Check for headerless file (e.g., first line is already a phone number)
  let isHeaderless = false;
  let resolvedPhoneIdx = phoneIdx;
  let resolvedNameIdx = nameIdx;

  if (phoneIdx === -1) {
    const firstLineValues = parseCsvLine(lines[0], delimiter);
    const candidateIdx = firstLineValues.findIndex((val) => {
      const digits = val.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    });
    if (candidateIdx !== -1) {
      isHeaderless = true;
      resolvedPhoneIdx = candidateIdx;
      // If there's another column with letters, assume it's name
      if (firstLineValues.length > 1) {
        resolvedNameIdx = firstLineValues.findIndex(
          (val, idx) => idx !== candidateIdx && /[a-zA-Z]/.test(val)
        );
      }
    }
  }

  if (resolvedPhoneIdx === -1) {
    return {
      rows: [],
      hasPhoneColumn: false,
      hasTagsColumn: false,
      hasCompanyColumn: false,
    };
  }

  const rows: ParsedContactRow[] = [];
  const startIdx = isHeaderless ? 0 : 1;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line, delimiter);
    const rawPhone = values[resolvedPhoneIdx]?.replace(/["']/g, '').trim() ?? '';

    rows.push({
      phone: rawPhone,
      name:
        resolvedNameIdx >= 0
          ? values[resolvedNameIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      email:
        emailIdx >= 0
          ? values[emailIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      company:
        companyIdx >= 0
          ? values[companyIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      tagNames:
        tagsIdx >= 0
          ? parseTagCell(values[tagsIdx]?.replace(/["']/g, ''))
          : [],
    });
  }

  return {
    rows,
    hasPhoneColumn: true,
    hasTagsColumn: tagsIdx >= 0,
    hasCompanyColumn: companyIdx >= 0,
  };
}

/** CSV line parse (handles quoted fields and custom delimiter). */
function parseCsvLine(line: string, delimiter = ','): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

