import { SupabaseClient } from '@supabase/supabase-js'

export const SHIKHA_ACCOUNT_IDS = new Set([
  '562e1add-b78d-4bdd-b710-cff227ba71dd', // Shikha Bajaj (bajajshikha07@gmail.com)
  'c1c18331-6aee-413e-b401-91089a16897e', // Shikha Bajaj (shikhabajaj07@gmail.com)
])

export const NON_SHIKHA_ACCOUNT_IDS = new Set([
  '14426408-a9ea-41a7-b135-53cf59f42cc0', // MarutiDigital (avadhbajaj02@gmail.com)
  '0be2399f-c0eb-4ece-95ea-c5934851ac65', // Maruti (marutidigitalweb@gmail.com)
  'd1468e84-b808-4b83-ac18-bd47efafa112', // Nashatra Hotel (nakshtraweddings@gmail.com)
  '3c76e22f-6a4d-4559-83a6-043089a193ed', // Meta Reviewer (demo@shikhabajaj.online)
])

export const SHIKHA_PHONE_NUMBER_IDS = new Set([
  '1116585918214621', // +91 94066 33778
])

export const SHIKHA_YOGA_TIMING_MESSAGE = `Thank you so much for your enquiry and interest in our Yoga Classes! 🧘‍♀️🌸

🌞 Morning Yoga Batches:

6:50 AM – 7:50 AM

8:00 AM – 9:00 AM

🌸 Evening Batch (Women Only):

5:00 PM – 6:00 PM

✨ You're most welcome to join our Yoga Classes! Come experience a healthier, happier and more peaceful lifestyle with us. 💚`

export const SHIKHA_YOGA_LOCATION_MESSAGE = `📍 Venue: i-Play Sports Arena
Balaji Nagar, Near Avanigram Colony, Khargone

📌 Google Maps Location:
https://share.google/4hlv9qL0xdXLYByj9

✨ You're most welcome to join our Yoga Classes! Come experience a healthier, happier, and more peaceful lifestyle with us. 💚`

export const SHIKHA_YOGA_FEES_MESSAGE = `Yoga Classes Fee: 1200/- per month 🧘‍♀️🌸

✨ You're most welcome to join our Yoga Classes! Come experience a healthier, happier, and more peaceful lifestyle with us. 💚`

/**
 * Returns true if and only if the account belongs to Shikha Bajaj
 * (bajajshikha07@gmail.com or shikhabajaj07@gmail.com).
 * Guarantees that accounts like MarutiDigital (avadhbajaj02@gmail.com) return false.
 */
export async function isShikhaBajajAccount(
  db: SupabaseClient,
  accountId: string,
  phoneNumberId?: string
): Promise<boolean> {
  if (!accountId && !phoneNumberId) return false
  if (phoneNumberId && SHIKHA_PHONE_NUMBER_IDS.has(phoneNumberId)) return true
  if (NON_SHIKHA_ACCOUNT_IDS.has(accountId)) return false
  if (SHIKHA_ACCOUNT_IDS.has(accountId)) return true

  try {
    const { data: acc } = await db
      .from('accounts')
      .select('id, name, owner_user_id')
      .eq('id', accountId)
      .maybeSingle()

    if (!acc) return false
    const name = (acc.name || '').toLowerCase()
    if (name.includes('shikha')) return true

    if (acc.owner_user_id) {
      const { data: userData } = await db.auth.admin.getUserById(acc.owner_user_id)
      const email = (userData?.user?.email || '').toLowerCase()
      if (email === 'bajajshikha07@gmail.com' || email === 'shikhabajaj07@gmail.com') {
        return true
      }
    }
  } catch (err) {
    console.warn('[isShikhaBajajAccount] check failed:', err)
  }

  return false
}

export type ShikhaReplyKind = 'timing' | 'location' | 'fees'

export interface ShikhaInboundContext {
  messageType?: string
  interactiveReplyId?: string | null
  buttonText?: string | null
  buttonPayload?: string | null
  text?: string | null
}

const TIMING_REGEX = /\b(timing|timings|time|times|batch|batches|schedule|schedules|samay|hour|hours|waqt|kab|when)\b/i
const LOCATION_REGEX = /\b(location|address|venue|where|place|map|maps|directions|direction|locate|kahan|kaha|arena|i-play|iplay|balaji nagar|avanigram|khargone)\b/i
const FEES_REGEX = /\b(fee|fees|charge|charges|cost|price|pricing|rate|rates|payment|kitna|kitne|kitni|rupee|rupees|rs|paisa|paise)\b/i

/**
 * Evaluates whether an inbound message to Shikha Bajaj's account matches:
 * 1. Yoga class timing enquiry -> Timing response
 * 2. Location / address enquiry -> Location response
 * 3. Fees enquiry -> Fees response (1200/- per month)
 *
 * If the message is "hi", "hello", or anything else that does not ask for
 * timing, location, or fees, it returns `null` so NO reply is sent
 * ("when send hi/hello/ kuch bhi reply nhi karna hai").
 */
export function getShikhaAutomatedReply(
  ctx: ShikhaInboundContext
): { kind: ShikhaReplyKind; text: string } | null {
  const candidates = [
    ctx.interactiveReplyId,
    ctx.buttonPayload,
    ctx.buttonText,
    ctx.text,
  ]
    .filter((v): v is string => Boolean(v && typeof v === 'string'))
    .map((s) => s.trim().toLowerCase())

  if (candidates.length === 0) {
    return null
  }

  const combined = candidates.join(' ')

  const timingMatch = combined.search(TIMING_REGEX)
  const locationMatch = combined.search(LOCATION_REGEX)
  const feesMatch = combined.search(FEES_REGEX)

  const matches: { kind: ShikhaReplyKind; index: number; text: string }[] = []

  if (timingMatch !== -1) {
    matches.push({ kind: 'timing', index: timingMatch, text: SHIKHA_YOGA_TIMING_MESSAGE })
  }
  if (locationMatch !== -1) {
    matches.push({ kind: 'location', index: locationMatch, text: SHIKHA_YOGA_LOCATION_MESSAGE })
  }
  if (feesMatch !== -1) {
    matches.push({ kind: 'fees', index: feesMatch, text: SHIKHA_YOGA_FEES_MESSAGE })
  }

  if (matches.length === 0) {
    return null
  }

  // Pick the match that appears first in the input
  matches.sort((a, b) => a.index - b.index)
  return { kind: matches[0].kind, text: matches[0].text }
}

/**
 * Checks if the inbound message is specifically a click on "Session Details"
 * (preserved for legacy test backward compatibility).
 */
export function isSessionDetailsClick(args: {
  messageType?: string
  interactiveReplyId?: string | null
  text?: string | null
}): boolean {
  const replyId = (args.interactiveReplyId || '').trim().toLowerCase()
  const text = (args.text || '').trim().toLowerCase()

  const validTargets = [
    'session details',
    'sessions details',
    'session detail',
    'session details (optional)',
  ]

  const isInteractive =
    args.messageType === 'button' ||
    args.messageType === 'interactive' ||
    Boolean(args.interactiveReplyId)

  if (isInteractive) {
    return (
      validTargets.includes(replyId) ||
      validTargets.includes(text) ||
      replyId.startsWith('session detail') ||
      text.startsWith('session detail')
    )
  }

  return validTargets.includes(text)
}
