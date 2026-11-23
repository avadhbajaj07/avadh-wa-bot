import { describe, it, expect } from 'vitest'
import {
  isSessionDetailsClick,
  isShikhaBajajAccount,
  getShikhaAutomatedReply,
  SHIKHA_YOGA_TIMING_MESSAGE,
  SHIKHA_YOGA_LOCATION_MESSAGE,
  SHIKHA_YOGA_FEES_MESSAGE,
} from './shikha'

describe('getShikhaAutomatedReply', () => {
  describe('Timing enquiries', () => {
    it('matches when user clicks a timing button', () => {
      const res = getShikhaAutomatedReply({
        messageType: 'button',
        buttonText: 'Yoga Class Timing',
        buttonPayload: 'timing',
      })
      expect(res).not.toBeNull()
      expect(res?.kind).toBe('timing')
      expect(res?.text).toBe(SHIKHA_YOGA_TIMING_MESSAGE)
    })

    it('matches interactive button reply for timing', () => {
      const res = getShikhaAutomatedReply({
        messageType: 'interactive',
        interactiveReplyId: 'btn_timing',
        buttonText: 'Timing',
      })
      expect(res?.kind).toBe('timing')
      expect(res?.text).toBe(SHIKHA_YOGA_TIMING_MESSAGE)
    })

    it('matches typed timing questions', () => {
      const phrases = [
        'timing',
        'timings',
        'yoga class timing',
        'what is the timing?',
        'class time kya hai',
        'morning batch timing',
        'batches kab hoti hai',
        'schedule of yoga classes',
      ]
      for (const phrase of phrases) {
        const res = getShikhaAutomatedReply({ text: phrase })
        expect(res?.kind).toBe('timing')
        expect(res?.text).toBe(SHIKHA_YOGA_TIMING_MESSAGE)
      }
    })
  })

  describe('Location enquiries', () => {
    it('matches when user clicks location button', () => {
      const res = getShikhaAutomatedReply({
        messageType: 'button',
        buttonText: 'Location',
        buttonPayload: 'location',
      })
      expect(res).not.toBeNull()
      expect(res?.kind).toBe('location')
      expect(res?.text).toBe(SHIKHA_YOGA_LOCATION_MESSAGE)
    })

    it('matches interactive button reply for address/venue', () => {
      const res = getShikhaAutomatedReply({
        messageType: 'interactive',
        interactiveReplyId: 'btn_address',
        buttonText: 'Address',
      })
      expect(res?.kind).toBe('location')
      expect(res?.text).toBe(SHIKHA_YOGA_LOCATION_MESSAGE)
    })

    it('matches typed location questions', () => {
      const phrases = [
        'location',
        'location button',
        'address',
        'venue',
        'where is the class located?',
        'kahan hai class',
        'kaha aana hoga',
        'google maps location please',
      ]
      for (const phrase of phrases) {
        const res = getShikhaAutomatedReply({ text: phrase })
        expect(res?.kind).toBe('location')
        expect(res?.text).toBe(SHIKHA_YOGA_LOCATION_MESSAGE)
      }
    })
  })

  describe('Fees enquiries', () => {
    it('matches typed fees questions', () => {
      const phrases = [
        'fees',
        'fee',
        'what is the fee?',
        'charges kya hai',
        'monthly cost',
        'price of class',
        'kitni fees hai',
        'kitna charge hai',
      ]
      for (const phrase of phrases) {
        const res = getShikhaAutomatedReply({ text: phrase })
        expect(res?.kind).toBe('fees')
        expect(res?.text).toBe(SHIKHA_YOGA_FEES_MESSAGE)
      }
    })
  })

  describe('Hi / Hello / Non-matching messages (Strictly DO NOT reply)', () => {
    it('returns null for hi, hello, and generic messages', () => {
      const phrases = [
        'hi',
        'hello',
        'hey',
        'Hi Shikha',
        'Hello mam',
        'Good morning',
        'Namaste',
        'kuch bhi',
        'ok',
        'thank you',
        'can i get more info',
        'interested',
        'call me',
      ]
      for (const phrase of phrases) {
        const res = getShikhaAutomatedReply({ text: phrase })
        expect(res).toBeNull()
      }
    })
  })

  describe('First-match priority when multiple keywords appear', () => {
    it('sends only timing when timing appears first', () => {
      const res = getShikhaAutomatedReply({
        text: 'What is the timing and location?',
      })
      expect(res?.kind).toBe('timing')
      expect(res?.text).toBe(SHIKHA_YOGA_TIMING_MESSAGE)
    })

    it('sends only location when location appears first', () => {
      const res = getShikhaAutomatedReply({
        text: 'Where is the location and what is the fee?',
      })
      expect(res?.kind).toBe('location')
      expect(res?.text).toBe(SHIKHA_YOGA_LOCATION_MESSAGE)
    })

    it('sends only fees when fees appears first', () => {
      const res = getShikhaAutomatedReply({
        text: 'Fees and timing please',
      })
      expect(res?.kind).toBe('fees')
      expect(res?.text).toBe(SHIKHA_YOGA_FEES_MESSAGE)
    })
  })
})

describe('isSessionDetailsClick', () => {
  it('detects button click on Session Details', () => {
    expect(
      isSessionDetailsClick({
        messageType: 'button',
        interactiveReplyId: 'Session Details',
        text: 'Session Details',
      })
    ).toBe(true)

    expect(
      isSessionDetailsClick({
        messageType: 'interactive',
        interactiveReplyId: 'btn_session_details',
        text: 'Session Details',
      })
    ).toBe(true)

    expect(
      isSessionDetailsClick({
        messageType: 'button',
        interactiveReplyId: 'Sessions Details',
        text: 'Sessions Details',
      })
    ).toBe(true)
  })

  it('detects exact typed "Session Details"', () => {
    expect(isSessionDetailsClick({ text: 'Session Details' })).toBe(true)
    expect(isSessionDetailsClick({ text: 'session details' })).toBe(true)
    expect(isSessionDetailsClick({ text: 'Sessions Details' })).toBe(true)
  })

  it('rejects generic text containing "details" or "session"', () => {
    expect(isSessionDetailsClick({ text: 'Flight details (if airport delivery)' })).toBe(false)
    expect(isSessionDetailsClick({ text: 'Please send car details' })).toBe(false)
    expect(isSessionDetailsClick({ text: 'send details' })).toBe(false)
    expect(isSessionDetailsClick({ text: 'details' })).toBe(false)
    expect(isSessionDetailsClick({ text: 'session' })).toBe(false)
    expect(isSessionDetailsClick({ text: 'face yoga' })).toBe(false)
    expect(isSessionDetailsClick({ text: '22month' })).toBe(false)
    expect(isSessionDetailsClick({ text: 'Can you give me the details?' })).toBe(false)
  })

  it('rejects unrelated button clicks', () => {
    expect(
      isSessionDetailsClick({
        messageType: 'button',
        interactiveReplyId: 'register_now',
        text: 'Register kare',
      })
    ).toBe(false)

    expect(
      isSessionDetailsClick({
        messageType: 'interactive',
        interactiveReplyId: 'help',
        text: 'Help chahiye',
      })
    ).toBe(false)
  })
})

describe('isShikhaBajajAccount', () => {
  it('identifies known Shikha accounts', async () => {
    const fakeDb = {} as any
    expect(
      await isShikhaBajajAccount(fakeDb, '562e1add-b78d-4bdd-b710-cff227ba71dd')
    ).toBe(true)
    expect(
      await isShikhaBajajAccount(fakeDb, 'c1c18331-6aee-413e-b401-91089a16897e')
    ).toBe(true)
  })

  it('identifies Shikha phone number ID', async () => {
    const fakeDb = {} as any
    expect(
      await isShikhaBajajAccount(fakeDb, '', '1116585918214621')
    ).toBe(true)
  })

  it('rejects MarutiDigital and other non-Shikha accounts', async () => {
    const fakeDb = {} as any
    expect(
      await isShikhaBajajAccount(fakeDb, '14426408-a9ea-41a7-b135-53cf59f42cc0')
    ).toBe(false)
    expect(
      await isShikhaBajajAccount(fakeDb, '0be2399f-c0eb-4ece-95ea-c5934851ac65')
    ).toBe(false)
    expect(
      await isShikhaBajajAccount(fakeDb, 'd1468e84-b808-4b83-ac18-bd47efafa112')
    ).toBe(false)
    expect(await isShikhaBajajAccount(fakeDb, '')).toBe(false)
  })
})
