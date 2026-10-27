import { describe, it, expect } from 'vitest'
import { getShikhaReply, SHIKHA_FACE_YOGA_1MONTH_TEXT } from './shikha-responder'

describe('getShikhaReply', () => {
  it('handles "Time?" query with 15th Nov batches and 799 link', () => {
    const res = getShikhaReply('Time?')
    expect(res.handled).toBe(true)
    expect(res.replyText).toContain('15th Nov')
    expect(res.replyText).toContain('6:30 – 7:00 PM')
    expect(res.replyText).toContain('9:00 – 9:30 PM')
    expect(res.replyText).toContain('799')
    expect(res.replyText).toContain('https://rzp.io/rzp/facebs')
    expect(res.replyText).not.toContain('₹99')
    expect(res.replyText).not.toContain('shikha07')
  })

  it('handles "Fees" query with 799 and facebs link', () => {
    const res = getShikhaReply('fees kitni hai?')
    expect(res.handled).toBe(true)
    expect(res.replyText).toContain('799')
    expect(res.replyText).toContain('https://rzp.io/rzp/facebs')
    expect(res.replyText).not.toContain('shikha07')
  })

  it('handles "Session Details" query with sendVoice and Nov 15 text', () => {
    const res = getShikhaReply('Session Details')
    expect(res.handled).toBe(true)
    expect(res.sendVoice).toBe(true)
    expect(res.replyText).toBe(SHIKHA_FACE_YOGA_1MONTH_TEXT)
    expect(res.replyText).toContain('Starting 15th Nov')
  })

  it('handles "Details" query with sendVoice and Nov 15 text', () => {
    const res = getShikhaReply('details kya hai?')
    expect(res.handled).toBe(true)
    expect(res.sendVoice).toBe(true)
    expect(res.replyText).toBe(SHIKHA_FACE_YOGA_1MONTH_TEXT)
  })

  it('handles "link" query with facebs registration link', () => {
    const res = getShikhaReply('link please')
    expect(res.handled).toBe(true)
    expect(res.replyText).toContain('https://rzp.io/rzp/facebs')
    expect(res.replyText).not.toContain('shikha07')
  })

  it('handles stop / unsubscribe request politely', () => {
    const res = getShikhaReply('stop message')
    expect(res.handled).toBe(true)
    expect(res.unsubscribed).toBe(true)
  })
})
