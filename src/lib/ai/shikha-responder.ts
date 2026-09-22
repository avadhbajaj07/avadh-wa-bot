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

  // 8. Regular / Monthly Morning Yoga Class (Only if asked)
  const regularYogaPatterns = [
    'regular class', 'monthly class', 'daily yoga', 'morning yoga', '8 am', 'roz ki class',
    'regular yoga', 'monthly yoga', 'har roz'
  ]
  if (regularYogaPatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Haan ji! Meri regular morning yoga class bhi chalti hai subah 8:00 AM se 9:00 AM tak. 🧘‍♀️\n\nIska charge sirf ₹1200 per month hai, aur aap pehle 4 days ka FREE demo le sakti hain!\n\nAgar aap demo attend karna chahti hain toh batayein, main aapko link send kar doongi. 😊',
    }
  }

  // 9. Evening Yoga Class (Only if asked)
  const eveningYogaPatterns = [
    'evening class', 'evening yoga', 'sham ki class', 'shaam ki class', 'evening batch yoga', 'sham ko yoga'
  ]
  if (eveningYogaPatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Evening yoga class ke liye maine abhi thoda break liya hai, lekin evening class chalu hai — use Krishna ji le rahi hain! Main abhi sirf morning class (8 AM to 9 AM) le rahi hoon. 😊',
    }
  }

  // 10. Detailed Session / What will be taught
  const curriculumPatterns = [
    'kya sikhaye', 'kya sikhaya', 'kya hoga', 'workshop me kya', 'details kya hai',
    'kya details', 'session me kya', 'kya sikhne', 'content', 'syllabus', 'kya karwaoge',
    'kya sikhate'
  ]
  if (curriculumPatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Namaste! 🙏 Yeh jo program hai na, yeh 5 days ka hone wala hai jo kal se start ho raha hai.\n\nAur yeh paanch dino mein main:\n✨ Face oil ke sath practice karwaungi\n✨ Saath mein paani (water) & Spoons ke sath natural techniques\n✨ Anti-aging, dark circle, puffiness aur natural face cut\n\nAlmost 1 month ki exercises main aapko in 5 din mein hi seekha doongi, jisko fir aap ghar pe roz practice kar sakti hain! 🌸\n\nYeh 5 dino ka session only ₹99 mein hai. Register karne ke liye:\n👉 https://rzp.io/rzp/shikha07\n\n(Aur haan, agar aapko mera poster mila hai na, toh please isko zyada se zyada womens tak share karna aur ho sake toh status lagana! Thank you so much ❤️)',
    }
  }

  // 11. General Greetings: "Hi", "Hello", "Namaste"
  const greetingPatterns = ['hi', 'hello', 'namaste', 'hey', 'hlo', 'hii', 'namaskar', 'good morning', 'good afternoon', 'good evening']
  if (greetingPatterns.some((p) => text === p || text.startsWith(p + ' '))) {
    return {
      handled: true,
      replyText:
        'Namaste! 🙏 Kaise hain aap? Main Shikha Bajaj, bataiye main aapki kya help kar sakti hoon? 😊',
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
