import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

/**
 * Helper to resolve unused contact IDs for the current account:
 * A contact is unused if:
 * 1. It has no conversations with messages (last_message_at IS NOT NULL or last_message_text IS NOT NULL).
 * 2. It has no deals attached.
 */
async function getUnusedContactIds(supabase: any, accountId: string): Promise<string[]> {
  // 1. Get contact IDs with active conversations
  const { data: convData } = await supabase
    .from('conversations')
    .select('contact_id')
    .eq('account_id', accountId)
    .or('last_message_at.not.is.null,last_message_text.not.is.null');

  // 2. Get contact IDs with deals
  const { data: dealsData } = await supabase
    .from('deals')
    .select('contact_id')
    .eq('account_id', accountId)
    .not('contact_id', 'is', null);

  const usedContactIds = new Set<string>();
  (convData ?? []).forEach((c: { contact_id?: string | null }) => {
    if (c.contact_id) usedContactIds.add(c.contact_id);
  });
  (dealsData ?? []).forEach((d: { contact_id?: string | null }) => {
    if (d.contact_id) usedContactIds.add(d.contact_id);
  });

  // 3. Fetch all contacts in this account
  const { data: contactsData, error } = await supabase
    .from('contacts')
    .select('id')
    .eq('account_id', accountId);

  if (error) {
    throw error;
  }

  const unused: string[] = [];
  (contactsData ?? []).forEach((c: { id: string }) => {
    if (!usedContactIds.has(c.id)) {
      unused.push(c.id);
    }
  });

  return unused;
}

/**
 * GET /api/contacts/unused
 * Returns the count and IDs of all unused contacts in the account.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const unusedIds = await getUnusedContactIds(supabase, accountId);

    return NextResponse.json({
      count: unusedIds.length,
      ids: unusedIds,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/contacts/unused
 * Bulk-deletes unused contacts in the current account.
 * Optional JSON body: { contactIds?: string[] } to delete only specific unused contacts.
 */
export async function DELETE(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const allUnusedIds = await getUnusedContactIds(supabase, accountId);
    const unusedSet = new Set(allUnusedIds);

    let targetIds: string[] = allUnusedIds;
    try {
      const body = await request.json().catch(() => null);
      if (body && Array.isArray(body.contactIds)) {
        // Only allow deleting IDs that are genuinely unused
        targetIds = body.contactIds.filter((id: string) => unusedSet.has(id));
      }
    } catch {
      // If no valid body, target all unused contacts
    }

    if (targetIds.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
      });
    }

    // Delete in batches of 100 to avoid PostgREST statement limits
    let deletedCount = 0;
    const BATCH_SIZE = 100;
    for (let i = 0; i < targetIds.length; i += BATCH_SIZE) {
      const batch = targetIds.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('contacts')
        .delete()
        .in('id', batch);

      if (error) {
        console.error('[delete-unused-contacts] Error deleting batch:', error.message);
        return NextResponse.json(
          { error: `Failed to delete contacts: ${error.message}` },
          { status: 500 }
        );
      }
      deletedCount += batch.length;
    }

    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
