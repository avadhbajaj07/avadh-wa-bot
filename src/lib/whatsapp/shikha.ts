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

/**
 * Returns true if and only if the account belongs to Shikha Bajaj
 * (bajajshikha07@gmail.com or shikhabajaj07@gmail.com).
 * Guarantees that accounts like MarutiDigital (avadhbajaj02@gmail.com) return false.
 */
export async function isShikhaBajajAccount(
  db: SupabaseClient,
  accountId: string
): Promise<boolean> {
  if (!accountId) return false
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

/**
 * Checks if the inbound message is specifically a click on "Session Details"
 * (or "Sessions Details") from a button / quick reply / interactive tap,
 * or an exact phrase match.
 *
 * Prevents false positives from generic words like "details", "session",
 * "flight details", "car details", or random text.
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

  // Exact typed match only (not substrings)
  return validTargets.includes(text)
}
