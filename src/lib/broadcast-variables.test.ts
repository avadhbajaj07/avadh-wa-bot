import { describe, expect, it } from 'vitest';
import { resolveVariables } from '@/hooks/use-broadcast-sending';
import type { Contact } from '@/types';

const contact: Contact = {
  id: 'c-1',
  user_id: 'u-1',
  account_id: 'a-1',
  name: 'Animo Coaching',
  phone: '+41 77 474 73 73',
  email: 'info@animo.ch',
  company: 'Animo Coaching - ADHS- & Life Coaching',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('resolveVariables with CSV columns and named placeholders', () => {
  it('resolves csv_column values from the contact CSV row', () => {
    const csvRow = {
      'Business/Coach Name': 'Animo Coaching',
      City: 'Basel',
      Profession: 'Life Coach',
    };

    const variables = {
      business_name: { type: 'csv_column' as const, value: 'Business/Coach Name' },
      city: { type: 'csv_column' as const, value: 'City' },
      profession: { type: 'csv_column' as const, value: 'Profession' },
    };

    const result = resolveVariables(
      variables,
      contact,
      undefined,
      csvRow,
      ['business_name', 'city', 'profession']
    );

    expect(result).toEqual(['Animo Coaching', 'Basel', 'Life Coach']);
  });

  it('respects orderedKeys regardless of alphabetical order', () => {
    const csvRow = {
      City: 'Basel',
      'Business/Coach Name': 'Animo Coaching',
    };

    const variables = {
      city: { type: 'csv_column' as const, value: 'City' },
      business_name: { type: 'csv_column' as const, value: 'Business/Coach Name' },
    };

    // Template has {{city}} before {{business_name}}
    const result = resolveVariables(
      variables,
      contact,
      undefined,
      csvRow,
      ['city', 'business_name']
    );

    expect(result).toEqual(['Basel', 'Animo Coaching']);
  });

  it('mixes static, field, and csv_column mappings seamlessly', () => {
    const csvRow = {
      City: 'Basel',
    };

    const variables = {
      greeting: { type: 'static' as const, value: 'Bonjour' },
      contact_name: { type: 'field' as const, value: 'name' },
      city: { type: 'csv_column' as const, value: 'City' },
    };

    const result = resolveVariables(
      variables,
      contact,
      undefined,
      csvRow,
      ['greeting', 'contact_name', 'city']
    );

    expect(result).toEqual(['Bonjour', 'Animo Coaching', 'Basel']);
  });

  it('handles case-insensitive CSV column lookup', () => {
    const csvRow = {
      'BUSINESS_NAME': 'Acme Corp',
    };

    const variables = {
      business_name: { type: 'csv_column' as const, value: 'business_name' },
    };

    const result = resolveVariables(
      variables,
      contact,
      undefined,
      csvRow,
      ['business_name']
    );

    expect(result).toEqual(['Acme Corp']);
  });

  it('falls back to CSV columns or contact name/company when unmapped', () => {
    const csvRow = {
      Name: 'Esther Arnold - Coaching & Training',
    };

    // No variables mapped
    const result = resolveVariables(
      {},
      contact,
      undefined,
      csvRow,
      ['business_name']
    );

    expect(result).toEqual(['Esther Arnold - Coaching & Training']);
  });
});
