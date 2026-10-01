import { describe, it, expect } from 'vitest'
import { isSessionDetailsClick, isShikhaBajajAccount } from './shikha'

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
