import { supabaseAdmin } from './admin-client'
import { engineSendMedia, engineSendText } from '@/lib/flows/meta-send'

export const SHIKHA_FACE_YOGA_1MONTH_TEXT = `Face Yoga – 1 month With Shikha Bajaj
Namaste 🙏

Join me for a fun & simple 1 Month Face Yoga journey — ghar baithe, LIVE on Zoom! 🧘‍♀️

✨ 22 Live Classes
- Natural Glow
- Firmer-looking Skin
- Healthy & Fresh Look
- Fine Lines ki appearance ko reduce karne mein help
- Relaxed face + happy mood 

🗓️ Starting 15th Nov.
⏰ 6:30 – 7:00 PM
⏰ 9:00 – 9:30 PM
💻 Online on Zoom
💰 Only ₹799/-

No pressure, no complicated routine — bas 30 minutes for YOU! 
Aaiye, saath mein Glow, Smile & Feel Beautiful karein! 🌷✨
With Love,
Shikha Bajaj

with Registration link - https://rzp.io/rzp/facebs`

export const SHIKHA_FACE_YOGA_AUDIO_URL = 'https://www.shikhabajaj.online/media/faceyoga-1month.ogg'

export interface ShikhaReplyResult {
  handled: boolean
  replyText?: string
  unsubscribed?: boolean
  sendVoice?: boolean
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
        'Namaste! 🙏 Main Shikha Bajaj hoon, Certified Face Yoga & Natural Wellness Coach.\n\nHum ladies ke liye 1 Month ka Live Online Face Yoga Program shuru kar rahe hain (Starting 15th Nov, 22 Live Classes on Zoom) jisme hum natural glowing skin, firmer skin aur fine lines reduction ki simple exercises sikhate hain.\n\nProgram ki fees sirf ₹799 hai. Aap is link se details dekh kar register kar sakti hain:\n👉 https://rzp.io/rzp/facebs',
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
        'Main Khargone (M.P.) se hoon! 😊 Lekin yeh 1 Month Face Yoga Program completely online live Zoom par hoti hai, toh aap apne ghar se aaram se kisi bhi shehar se join kar sakti hain!\n\n🗓️ Starting: 15th Nov (22 Live Classes)\n⏰ Batches: 6:30 – 7:00 PM & 9:00 – 9:30 PM\n💰 Fees sirf ₹799 hai:\n👉 https://rzp.io/rzp/facebs',
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
        'Sorry agar aapko unexpected laga! 🙏 Actually humare wellness & yoga awareness campaigns ke through humara invitation aap tak pahuncha.\n\nAgar aapko Face Yoga me interest nahi hai toh bilkul koi baat nahi, main aapko disturb nahi karungi. Lekin agar aap daily 30 min me bina kisi chemical ke natural glowing skin seekhna chahti hain, toh yeh 1 Month Face Yoga journey (Starting 15th Nov, 22 Live Classes) sirf ₹799 me hai!\n\nAap yahan register kar sakti hain:\n👉 https://rzp.io/rzp/facebs',
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
        'Fees sirf ₹799/- hai poore 1 month (22 Live Classes) ke liye! 🌸\n\n🗓️ Starting: 15th Nov\n⏰ Batches: 6:30 – 7:00 PM & 9:00 – 9:30 PM\n💻 Online on Zoom\n\nAap direct is link se register kar sakti hain:\n👉 https://rzp.io/rzp/facebs',
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
        'Face Yoga 1 Month Program ke 2 batches available hain LIVE on Zoom! ⏰\n\n🗓️ Starting: 15th Nov (22 Live Classes)\n⏰ Batch 1: 6:30 – 7:00 PM\n⏰ Batch 2: 9:00 – 9:30 PM\n💰 Fees: Sirf ₹799/-\n\nAap apni suvidha ke anusaar koi bhi batch attend kar sakti hain. Register karne ke liye:\n👉 https://rzp.io/rzp/facebs',
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
        'Yeh raha registration link: 🌸\n👉 https://rzp.io/rzp/facebs\n\nFace Yoga 1 Month (Starting 15th Nov, 22 Live Classes on Zoom). Fees sirf ₹799 hai. Register karte hi aapko program ke WhatsApp group aur Zoom link ka access mil jayega!',
    }
  }

  // 8. Regular / Monthly Morning Yoga Class (Only if asked)
  const regularYogaPatterns = [
    'regular class', 'monthly class', 'daily yoga', 'morning yoga', '8 am', 'roz ki class',
    'regular yoga', 'monthly yoga', 'har roz', 'offline'
  ]
  if (regularYogaPatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Haan ji! Meri regular morning yoga class OFFLINE chalti hai subah 8:00 AM se 9:00 AM tak. 🧘‍♀️\n\n📍 Location: i-play sports arena, Balaji Nagar (Khargone) mein turf par hoti hai.\n💰 Fees: Sirf ₹1200 per month, aur aap pehle 4 days ka FREE demo le sakti hain!\n\nAgar aap demo attend karna chahti hain toh bataiye, main aapko details send kar doongi. 😊',
    }
  }

  // 9. Evening Yoga / Extra Classes (Only if asked)
  const eveningYogaPatterns = [
    'evening class', 'evening yoga', 'sham ki class', 'shaam ki class', 'evening batch yoga', 'sham ko yoga',
    'extra class', 'aur koi class', 'dusri class'
  ]
  if (eveningYogaPatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      replyText:
        'Meri abhi koi evening offline yoga class nahi chal rahi hai. Online Zoom par hamara Face Yoga 1 Month Program sham 6:30 – 7:00 PM aur raat 9:00 – 9:30 PM chalega (Starting 15th Nov). 😊\n\nRegistration link: https://rzp.io/rzp/facebs',
    }
  }

  // 10. Detailed Session / What will be taught / Session Details button
  const curriculumPatterns = [
    'session detail', 'sessions detail', 'session details', 'sessions details',
    'kya sikhaye', 'kya sikhaya', 'kya hoga', 'workshop me kya', 'details kya hai',
    'kya details', 'session me kya', 'kya sikhne', 'content', 'syllabus', 'kya karwaoge',
    'kya sikhate', 'recording', 'details'
  ]
  if (curriculumPatterns.some((p) => text.includes(p))) {
    return {
      handled: true,
      sendVoice: true,
      replyText: SHIKHA_FACE_YOGA_1MONTH_TEXT,
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
    // If voice mail requested (e.g. Session Details / Curriculum inquiry), send voice mail first
    if (match.sendVoice) {
      try {
        await engineSendMedia({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId: contactRecord.id,
          kind: 'audio',
          link: SHIKHA_FACE_YOGA_AUDIO_URL,
          filename: 'faceyoga-1month.ogg',
        })
      } catch (audioErr) {
        console.error('[shikha-smart-reply] Audio send error:', audioErr)
      }
    }

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
