import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  recordOutboundBroadcastMessage,
  syncBroadcastRecipientsToConversations,
} from './broadcast-conversation-sync';

describe('broadcast-conversation-sync', () => {
  it('records a new broadcast message into conversations and messages', async () => {
    const insertedMessages: Record<string, unknown>[] = [];
    const conversationUpdates: Record<string, unknown>[] = [];

    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'conv-123' }],
              error: null,
            }),
            update: vi.fn((data: Record<string, unknown>) => {
              conversationUpdates.push(data);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }

        if (table === 'messages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn((data: Record<string, unknown>) => {
              insertedMessages.push(data);
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: { id: 'msg-456' },
                  error: null,
                }),
              };
            }),
          };
        }

        if (table === 'whatsapp_config') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { user_id: 'owner-user' },
              error: null,
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await recordOutboundBroadcastMessage({
      db: mockDb,
      accountId: 'acct-1',
      contactId: 'contact-1',
      templateName: 'demo_request',
      templateRow: {
        id: 't-1',
        account_id: 'acct-1',
        name: 'demo_request',
        language: 'fr',
        category: 'MARKETING',
        body_text: 'Bonjour {{1}}, confirmation pour {{2}}.',
      } as any,
      params: ['Jean', 'Boulangerie Paris'],
      whatsappMessageId: 'wamid.HBg123',
      status: 'sent',
    });

    expect(result).not.toBeNull();
    expect(result?.conversationId).toBe('conv-123');
    expect(result?.messageId).toBe('msg-456');

    expect(insertedMessages.length).toBe(1);
    expect(insertedMessages[0]).toMatchObject({
      conversation_id: 'conv-123',
      sender_type: 'agent',
      content_type: 'template',
      content_text: 'Bonjour Jean, confirmation pour Boulangerie Paris.',
      message_id: 'wamid.HBg123',
      status: 'sent',
    });

    expect(conversationUpdates.length).toBe(1);
    expect(conversationUpdates[0]).toMatchObject({
      last_message_text: 'Bonjour Jean, confirmation pour Boulangerie Paris.',
      status: 'open',
    });
  });

  it('updates an existing message when delivered/read status is recorded', async () => {
    const updatedMessages: Record<string, unknown>[] = [];
    const conversationUpdates: Record<string, unknown>[] = [];

    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'conv-123' }],
              error: null,
            }),
            update: vi.fn((data: Record<string, unknown>) => {
              conversationUpdates.push(data);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }

        if (table === 'messages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'msg-456',
                status: 'sent',
                conversation_id: 'conv-123',
              },
              error: null,
            }),
            update: vi.fn((data: Record<string, unknown>) => {
              updatedMessages.push(data);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await recordOutboundBroadcastMessage({
      db: mockDb,
      accountId: 'acct-1',
      contactId: 'contact-1',
      templateName: 'demo_request',
      contentText: 'Bonjour Jean',
      whatsappMessageId: 'wamid.HBg123',
      status: 'delivered',
    });

    expect(result?.conversationId).toBe('conv-123');
    expect(result?.messageId).toBe('msg-456');

    expect(updatedMessages.length).toBe(1);
    expect(updatedMessages[0].status).toBe('delivered');
  });

  it('heals an existing message if its content_text has unreplaced {{business_name}}', async () => {
    const updatedMessages: Record<string, unknown>[] = [];
    const conversationUpdates: Record<string, unknown>[] = [];

    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'conv-123' }],
              error: null,
            }),
            update: vi.fn((data: Record<string, unknown>) => {
              conversationUpdates.push(data);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }

        if (table === 'messages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'msg-456',
                status: 'sent',
                conversation_id: 'conv-123',
                content_text: 'Demande pour {{business_name}}.',
              },
              error: null,
            }),
            update: vi.fn((data: Record<string, unknown>) => {
              updatedMessages.push(data);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }

        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                name: 'Campanini Coaching',
                company: 'Campanini Coaching SARL',
              },
              error: null,
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await recordOutboundBroadcastMessage({
      db: mockDb,
      accountId: 'acct-1',
      contactId: 'contact-1',
      templateName: 'demo_request',
      templateRow: {
        id: 't-1',
        account_id: 'acct-1',
        name: 'demo_request',
        language: 'fr',
        category: 'MARKETING',
        body_text: 'Demande pour {{business_name}}.',
      } as any,
      params: ['Campanini Coaching SARL'],
      whatsappMessageId: 'wamid.HBg123',
      status: 'sent',
    });

    expect(result?.conversationId).toBe('conv-123');
    expect(updatedMessages.length).toBe(1);
    expect(updatedMessages[0].content_text).toBe(
      'Demande pour Campanini Coaching SARL.'
    );
    expect(conversationUpdates[0].last_message_text).toBe(
      'Demande pour Campanini Coaching SARL.'
    );
  });

  it('syncs existing broadcast recipients into conversations', async () => {
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'broadcast_recipients') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'rec-1',
                  broadcast_id: 'bc-1',
                  contact_id: 'contact-1',
                  status: 'delivered',
                  whatsapp_message_id: 'wamid.123',
                  template_params: ['Jean'],
                  sent_at: '2026-09-22T10:00:00Z',
                  created_at: '2026-09-22T10:00:00Z',
                  broadcast: {
                    id: 'bc-1',
                    account_id: 'acct-1',
                    template_name: 'test_template',
                    template_language: 'fr',
                  },
                },
              ],
              error: null,
            }),
          };
        }

        if (table === 'message_templates') {
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            then: (resolve: any) =>
              resolve({
                data: [
                  {
                    id: 't-1',
                    account_id: 'acct-1',
                    name: 'test_template',
                    language: 'fr',
                    category: 'MARKETING',
                    body_text: 'Hello {{1}}',
                  },
                ],
                error: null,
              }),
          };
          return chain;
        }

        if (table === 'conversations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'conv-123' }],
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }

        if (table === 'messages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'msg-new' },
                error: null,
              }),
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const res = await syncBroadcastRecipientsToConversations(mockDb, 'acct-1');
    expect(res.total).toBe(1);
    expect(res.synced).toBe(1);
  });
});
