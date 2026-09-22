import { supabaseAdmin } from './admin-client'
import { engineSendText } from '@/lib/flows/meta-send'

export interface ShikhaReplyResult {
  handled: boolean
  replyText?: string
  unsubscribed?: boolean
}

/**
 * Smart zero-API-key intent-based auto-responder for Shikha Bajaj.
 * Automatically handles common WhatsApp queries in natural, polite Hinglish.
 */
export function getShikhaReply(inboundText: string): ShikhaReplyResult {
  const text = (inboundText || '').trim().toLowerCase()

  // 1. Unsubscribe / Angry / Stop
  const stopPatterns = [
    'mat karna', 'mat karo', 'dont message', "don't message", 'stop', 'unsubscribe',
    'remove', 'block', 'faltu', 'bakwas', 'spam', 'disturb', 'nahi chahiye', 'na kare',
    'report', 'ab mat bhejna', 'wrong number'
  ]
  if (stopPatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      unsubscribed: true,
      replyText:
        'I am extremely sorry for disturbing you! 🙏 Aage se aapko meri taraf se koi message nahi aayega. Humara maksad sirf apne natural health program ko zyada se zyada logon tak pahunchana tha. Have a wonderful day! 🌸',
    }
  }

  // 2. Identity: "Kaun?", "Aap kaun ho?", "Who are you?"
  const identityPatterns = [
    'kaun', 'kon', 'who are you', 'who r u', 'aap kaun', 'koun', 'who is this',
    'kiska number', 'who are u', 'kya naam', 'aap kon'
  ]
  if (identityPatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Namaste! 🙏 Main Shikha Bajaj hoon, Certified Face Yoga & Natural Wellness Coach.\n\nHum ladies ke liye ek 5-Day Live Online Face Yoga Workshop conduct kar rahe hain jisme hum natural anti-aging, glowing skin aur double chin reduction ki simple exercises sikhate hain.\n\nWorkshop ki fees sirf ₹99 hai. Aap is link se details dekh kar register kar sakti hain:\n👉 https://rzp.io/rzp/shikha07',
    }
  }

  // 3. Location: "Aap kahan se ho?", "Where are you from?"
  const locationPatterns = [
    'kaha se', 'kahan se', 'where are you', 'city', 'location', 'address', 'kaha rehte'
  ]
  if (locationPatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Main Khargone (M.P.) se hoon! 😊 Lekin yeh 5-Day Workshop completely online live Zoom par hoti hai, toh aap apne ghar se aaram se kisi bhi shehar se join kar sakti hain!\n\nMorning aur Evening dono batches available hain. Fees sirf ₹99 hai:\n👉 https://rzp.io/rzp/shikha07',
    }
  }

  // 4. Number Source / Registration Doubt: "Mera number kahan se mila?", "Maine register nahi kiya"
  const sourcePatterns = [
    'number kahan', 'number kaha', 'kaha se mila', 'kahan se mila', 'kisne diya',
    'maine register nahi', 'maine to register', 'maine kab register', 'not registered',
    'didnt register', "didn't register", 'kaha se mila number', 'number kisne'
  ]
  if (sourcePatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Sorry agar aapko unexpected laga! 🙏 Actually humare wellness & yoga awareness campaigns ke through humara invitation aap tak pahuncha.\n\nAgar aapko Face Yoga me interest nahi hai toh bilkul koi baat nahi, main aapko disturb nahi karungi. Lekin agar aap daily 15-20 min me bina kisi chemical ke natural glowing skin aur face lift seekhna chahti hain, toh yeh 5-day live session sirf ₹99 me hai!\n\nAap yahan register kar sakti hain:\n👉 https://rzp.io/rzp/shikha07',
    }
  }

  // 5. Fees / Price: "Kitna lagega?", "Fees kya hai?"
  const feePatterns = [
    'fees', 'fee', 'cost', 'price', 'kitna', 'kitne', 'charge', 'payment', 'paise', 'charges'
  ]
  if (feePatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Fees sirf ₹99/- hai poore 5 din ke live sessions + daily recordings ke liye! 🌸\n\nIsme aapko live coaching ke sath daily practice guides bhi milte hain. Aap direct is link se register kar sakti hain:\n👉 https://rzp.io/rzp/shikha07',
    }
  }

  // 6. Timing / Batches: "Time kya hai?", "Kab se hai?"
  const timePatterns = [
    'time', 'timing', 'kab', 'batch', 'schedule', 'when', 'kitne baje', 'kya time'
  ]
  if (timePatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Session ke 2 batches available hain: Morning aur Evening! ⏰\n\nAap apni suvidha ke anusaar koi bhi batch attend kar sakti hain. Aur agar kisi din session miss ho jaye, toh daily recording bhi provide ki jaati hai!\n\nFees sirf ₹99 hai. Register karne ke liye:\n👉 https://rzp.io/rzp/shikha07',
    }
  }

  // 7. Link / Register / Join: "Link bhejo", "Kaise join karein?"
  const linkPatterns = [
    'link', 'register', 'join', 'karna hai', 'how to join', 'kaise join', 'form',
    'bhejo', 'send link', 'registration'
  ]
  if (linkPatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Yeh raha registration link: 🌸\n👉 https://rzp.io/rzp/shikha07\n\nFees sirf ₹99 hai. Register karte hi aapko workshop ke WhatsApp group aur Zoom link ka access mil jayega!',
    }
  }

  // 8. General Greetings: "Hi", "Hello", "Namaste"
  const greetingPatterns = ['hi', 'hello', 'namaste', 'hey', 'hlo', 'hii', 'namaskar']
  if (greetingPatterns.some((p) => text === p || text.startsWith(p + ' '))) {
    return {
      handled: true,
      replyText:
        'Namaste! 🙏 Main Shikha Bajaj hoon, Certified Face Yoga & Natural Wellness Coach.\n\nKya aap 5-Day Face Yoga & Anti-Aging Workshop ke baare me jaanna chahti hain? Fees sirf ₹99 hai live sessions + recordings ke liye.\n\nDetails & Registration:\n👉 https://rzp.io/rzp/shikha07',
    }
  }

  return { handled: false }
}

/**
 * Dispatches a smart reply for Shikha if an intent matches.
 */
export async function dispatchShikhaSmartReply(args: {
  accountId: string
  conversationId: string
  contactRecord: any
  inboundText: string
  configOwnerUserId: string
}): Promise<boolean> {
  const { accountId, conversationId, contactRecord, inboundText, configOwnerUserId } = args
  const match = getShikhaReply(inboundText)
  if (!match.handled || !match.replyText) return false

  const db = supabaseAdmin()

  // If user asked to unsubscribe / stop, disable auto-reply on this conversation
  if (match.unsubscribed) {
    await db
      .from('conversations')
      .update({ ai_autoreply_disabled: true })
      .eq('id', conversationId)
  }

  try {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId: contactRecord.id,
      text: match.replyText,
      aiGenerated: true,
    })

    return true
  } catch (err) {
    console.error('[shikha-smart-reply] Send error:', err)
    return false
  }
}
