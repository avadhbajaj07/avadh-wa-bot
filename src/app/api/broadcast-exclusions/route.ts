import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeKey } from '@/lib/contacts/dedupe';
import { formatPhoneNumber } from '@/lib/contacts/parse-pasted-numbers';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('id', user.id)
    .single();
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 });
  
  const accountId = profile.account_id;
  
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  
  let query = supabase
    .from('broadcast_exclusions')
    .select('*, contact:contacts(name)')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
    
  if (search) {
    query = query.or(`phone.ilike.%${search}%,note.ilike.%${search}%`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('id', user.id)
    .single();
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 });
  
  const accountId = profile.account_id;
  const body = await request.json();
  
  let phonesToAdd: string[] = [];
  if (body.phones && Array.isArray(body.phones)) {
    phonesToAdd = body.phones;
  } else if (body.phone) {
    phonesToAdd = [body.phone];
  }
  
  if (phonesToAdd.length === 0) {
    return NextResponse.json({ error: 'No phones provided' }, { status: 400 });
  }
  
  const reason = body.reason || 'manual';
  const note = body.note || null;
  
  // Normalize and deduplicate
  const uniquePhones = new Map<string, string>();
  for (const p of phonesToAdd) {
    const formatted = formatPhoneNumber(p) || p;
    const normalized = normalizeKey(formatted);
    if (normalized) {
      uniquePhones.set(normalized, formatted);
    }
  }
  
  if (uniquePhones.size === 0) {
    return NextResponse.json({ error: 'No valid phones provided' }, { status: 400 });
  }
  
  const normalizedPhones = Array.from(uniquePhones.keys());
  
  // Look up contacts for these phones
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, phone_normalized')
    .eq('account_id', accountId)
    .in('phone_normalized', normalizedPhones);
    
  const contactMap = new Map<string, string>();
  if (contacts) {
    for (const c of contacts) {
      if (c.phone_normalized) {
        contactMap.set(c.phone_normalized, c.id);
      }
    }
  }
  
  const records = normalizedPhones.map(normalized => ({
    account_id: accountId,
    phone: uniquePhones.get(normalized)!,
    contact_id: contactMap.get(normalized) || null,
    reason,
    note,
    created_by: user.id
  }));
  
  // Upsert (on conflict do nothing based on unique constraint)
  const { data, error } = await supabase
    .from('broadcast_exclusions')
    .upsert(records, { onConflict: 'account_id,phone_normalized', ignoreDuplicates: true })
    .select('id');
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ added: data?.length || 0 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('id', user.id)
    .single();
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 });
  
  const accountId = profile.account_id;
  const body = await request.json();
  
  let idsToDelete: string[] = [];
  if (body.ids && Array.isArray(body.ids)) {
    idsToDelete = body.ids;
  } else if (body.id) {
    idsToDelete = [body.id];
  }
  
  if (idsToDelete.length === 0) {
    return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
  }
  
  const { data, error } = await supabase
    .from('broadcast_exclusions')
    .delete()
    .eq('account_id', accountId)
    .in('id', idsToDelete)
    .select('id');
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ deleted: data?.length || 0 });
}
