import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysAgoStart,
  DOW_SHORT_MON_FIRST,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
} from './date-utils'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  BroadcastsSummaryData,
  PipelineDonutData,
  ResponseTimeSummary,
} from './types'

// ------------------------------------------------------------
// All client-side aggregation. RLS scopes every query to the
// signed-in user automatically, so we never pass user_id explicitly
// here. Perf is acceptable for the current scale (low thousands of
// messages) — if a tenant's dataset outgrows this, we'd migrate the
// heavy aggregations to SQL RPCs. Noted in the PR.
// ------------------------------------------------------------

type DB = SupabaseClient

// --- 1. Metric cards ---------------------------------------------------

export async function loadMetrics(db: DB): Promise<MetricsBundle> {
  const todayStart = startOfLocalDay().toISOString()
  const yesterdayStart = daysAgoStart(1).toISOString()

  const [
    openConvCur,
    newConvToday,
    newConvYesterday,
    totalContactsRes,
    newContactsTodayRes,
    broadcastsRes,
    messagesToday,
    messagesYesterday,
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', todayStart),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('contacts').select('id', { count: 'exact', head: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    db.from('broadcasts').select('id, total_recipients, status').neq('status', 'draft'),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .neq('sender_type', 'customer')
      .gte('created_at', todayStart),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .neq('sender_type', 'customer')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
  ])

  const broadcasts = (broadcastsRes.data ?? []) as { total_recipients: number | null }[]
  const totalRecipients = broadcasts.reduce((sum, b) => sum + (b.total_recipients ?? 0), 0)

  return {
    activeConversations: {
      current: openConvCur.count ?? 0,
      previous: (newConvToday.count ?? 0) - (newConvYesterday.count ?? 0),
    },
    totalContacts: {
      current: totalContactsRes.count ?? 0,
      newToday: newContactsTodayRes.count ?? 0,
    },
    totalBroadcasts: {
      current: broadcasts.length,
      totalRecipients,
    },
    messagesSentToday: {
      current: messagesToday.count ?? 0,
      previous: messagesYesterday.count ?? 0,
    },
  }
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  rangeDays: number,
): Promise<ConversationsSeriesPoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('created_at, sender_type')
    .gte('created_at', start)
    .order('created_at', { ascending: true })
  if (error) throw error

  const keys = lastNDayKeys(rangeDays)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    else bucket.outgoing += 1 // agent + bot both count as outgoing
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}

// --- 3. Broadcasts summary ---------------------------------------------

export async function loadBroadcastsSummary(db: DB): Promise<BroadcastsSummaryData> {
  const { data, error } = await db
    .from('broadcasts')
    .select('id, name, template_name, status, total_recipients, sent_count, delivered_count, read_count, failed_count, created_at')
    .neq('status', 'draft')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dashboard] broadcasts summary error:', error)
    return {
      totalCampaigns: 0,
      totalSent: 0,
      totalDelivered: 0,
      totalRead: 0,
      totalFailed: 0,
      deliveryRate: 0,
      recentCampaigns: [],
    }
  }

  const rows = (data ?? []) as Array<{
    id: string
    name: string
    template_name: string
    status: string
    total_recipients: number | null
    sent_count: number | null
    delivered_count: number | null
    read_count: number | null
    failed_count: number | null
    created_at: string
  }>

  let totalSent = 0
  let totalDelivered = 0
  let totalRead = 0
  let totalFailed = 0

  for (const r of rows) {
    totalSent += r.sent_count ?? 0
    totalDelivered += r.delivered_count ?? 0
    totalRead += r.read_count ?? 0
    totalFailed += r.failed_count ?? 0
  }

  const denominator = totalSent > 0 ? totalSent : totalDelivered
  const deliveryRate = denominator > 0 ? Math.min(100, Math.round((totalDelivered / denominator) * 100)) : 0

  const recentCampaigns = rows.slice(0, 5).map((r) => ({
    id: r.id,
    name: r.name,
    template_name: r.template_name,
    status: r.status,
    total_recipients: r.total_recipients ?? 0,
    delivered_count: r.delivered_count ?? 0,
    read_count: r.read_count ?? 0,
    created_at: r.created_at,
  }))

  return {
    totalCampaigns: rows.length,
    totalSent,
    totalDelivered,
    totalRead,
    totalFailed,
    deliveryRate,
    recentCampaigns,
  }
}

// --- 4. Pipeline donut (deprecated/unused) ------------------------------

export async function loadPipelineDonut(db: DB): Promise<PipelineDonutData> {
  return { stages: [], totalValue: 0 }
}

// --- 5. Response time by day of week (deprecated/unused) ----------------

export async function loadResponseTime(db: DB): Promise<ResponseTimeSummary> {
  return { buckets: [], thisWeekAvg: null, lastWeekAvg: null }
}

// --- 6. Activity feed --------------------------------------------------

export async function loadActivity(db: DB, limit = 20): Promise<ActivityItem[]> {
  // Pull ~10 from each source (plenty of headroom after merge-sort),
  // then interleave by timestamp. The individual per-table limits
  // keep the payload small; the final limit is enforced after sort.
  const [msgs, contacts, broadcasts, autoLogs] = await Promise.all([
    db
      .from('messages')
      .select('id, content_text, sender_type, created_at, conversation_id, conversations(contact_id, contacts(name, phone))')
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('contacts')
      .select('id, name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('broadcasts')
      .select('id, name, status, total_recipients, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('automation_logs')
      .select('id, trigger_event, status, created_at, automation:automations(name), contact:contacts(name, phone)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: ActivityItem[] = []

  // PostgREST returns nested selections as arrays by default, even when
  // the foreign key is 1:1. We normalise by taking [0] on each level.
  for (const m of (msgs.data ?? []) as unknown as Array<{
    id: string
    content_text: string | null
    created_at: string
    conversation_id: string
    conversations:
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }[]
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }
      | null
  }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations
    const contact = Array.isArray(conv?.contacts) ? conv?.contacts[0] : conv?.contacts
    const who = contact?.name || contact?.phone || 'Unknown'
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: `New message from ${who}`,
      at: m.created_at,
      href: `/inbox?c=${m.conversation_id}`,
    })
  }

  for (const c of (contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string; created_at: string }>) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: `New contact: ${c.name || c.phone}`,
      at: c.created_at,
      href: '/contacts',
    })
  }


  for (const b of (broadcasts.data ?? []) as Array<{
    id: string
    name: string
    status: string
    total_recipients: number
    created_at: string
  }>) {
    const label =
      b.status === 'sent'
        ? `sent to ${b.total_recipients} contacts`
        : `${b.status} (${b.total_recipients} recipients)`
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text: `Broadcast "${b.name}" ${label}`,
      at: b.created_at,
      href: '/broadcasts',
    })
  }

  for (const l of (autoLogs.data ?? []) as unknown as Array<{
    id: string
    trigger_event: string
    status: string
    created_at: string
    automation: { name: string }[] | { name: string } | null
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null
  }>) {
    const automation = Array.isArray(l.automation) ? l.automation[0] : l.automation
    const contact = Array.isArray(l.contact) ? l.contact[0] : l.contact
    const who = contact?.name || contact?.phone || 'a contact'
    const autoName = automation?.name || 'Automation'
    items.push({
      id: `auto-${l.id}`,
      kind: 'automation',
      text: `Automation "${autoName}" ${l.status === 'failed' ? 'failed for' : 'triggered for'} ${who}`,
      at: l.created_at,
    })
  }

  return items
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0))
    .slice(0, limit)
}
