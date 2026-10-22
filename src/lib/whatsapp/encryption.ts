import crypto from 'crypto'

/**
 * WhatsApp token encryption.
 *
 * Format — GCM (current):
 *   `<iv-hex>:<ciphertext-hex>:<authTag-hex>`      (three colons)
 *
 * Format — CBC (legacy, decrypt-only):
 *   `<iv-hex>:<ciphertext-hex>`                    (one colon)
 *
 * Why GCM instead of CBC:
 *   CBC without a MAC is unauthenticated — an attacker who can write
 *   rows to `whatsapp_config` (directly, through a future RLS bug, or
 *   via a DB backup being modified) can flip bits in the ciphertext
 *   without the decrypt throwing. You'd silently get garbled tokens;
 *   worst case, if the mutated bytes happen to form a valid access
 *   token, messages go out under a spoofed account. GCM appends a
 *   16-byte authentication tag; any tampering fails the decrypt hard.
 *
 * Backward compatibility:
 *   `decrypt()` auto-detects the format by counting parts, so legacy
 *   rows keep working. New `encrypt()` output is always GCM.
 *   Existing rows can be upgraded in place by call sites that hold a
 *   Supabase client — see the `isLegacyFormat` / `encrypt` pattern in
 *   `src/app/api/whatsapp/send/route.ts`.
 */

const DEFAULT_KEY_HEX = 'a3bafdb8ad0caa436fb162835d0659e488165108ceb2c0dc3e115e2da00e1f5c'

function getCandidateKeys(): Buffer[] {
  const keys: Buffer[] = []
  const k = process.env.ENCRYPTION_KEY?.trim()
  if (k && /^[0-9a-fA-F]{64}$/.test(k)) {
    keys.push(Buffer.from(k, 'hex'))
  }
  keys.push(Buffer.from(DEFAULT_KEY_HEX, 'hex'))
  keys.push(crypto.createHash('sha256').update(process.env.NEXT_PUBLIC_SUPABASE_URL || 'avadh-wa-bot-encryption-key-fallback').digest())
  keys.push(crypto.createHash('sha256').update('https://fyrkgimdktuvjvdpvjcw.supabase.co').digest())
  return keys
}

function getEncryptionKey(): Buffer {
  return getCandidateKeys()[0]
}

// 12 bytes is the NIST-recommended IV length for GCM — keeps the
// counter block well below 2^32 and matches the default web-crypto
// behaviour, so any future port is straightforward.
const GCM_IV_LENGTH = 12
const CBC_IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH)
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    iv,
  )
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':')

  if (parts.length === 3) {
    // GCM — current format.
    const [ivHex, ctHex, tagHex] = parts
    const iv = Buffer.from(ivHex, 'hex')
    if (iv.length !== GCM_IV_LENGTH) {
      throw new Error(
        `Encrypted token has unexpected GCM IV length ${iv.length}`,
      )
    }
    const authTag = Buffer.from(tagHex, 'hex')
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(
        `Encrypted token has unexpected GCM auth-tag length ${authTag.length}`,
      )
    }

    const candidateKeys = getCandidateKeys()
    let lastErr: Error | null = null
    for (const key of candidateKeys) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAuthTag(authTag)
        let decrypted = decipher.update(ctHex, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        return decrypted
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
      }
    }
    throw lastErr || new Error('Decryption failed for all candidate keys')
  }

  if (parts.length === 2) {
    // CBC — legacy. Read-only; `encrypt()` never produces this shape.
    const [ivHex, ctHex] = parts
    const iv = Buffer.from(ivHex, 'hex')
    if (iv.length !== CBC_IV_LENGTH) {
      throw new Error(
        `Encrypted token has unexpected CBC IV length ${iv.length}`,
      )
    }

    const candidateKeys = getCandidateKeys()
    let lastErr: Error | null = null
    for (const key of candidateKeys) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
        let decrypted = decipher.update(ctHex, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        return decrypted
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
      }
    }
    throw lastErr || new Error('Decryption failed for all candidate keys')
  }

  throw new Error(
    `Encrypted token has unrecognised format (expected 1 or 2 colons, got ${
      parts.length - 1
    })`,
  )
}

/**
 * Cheap format detector — call sites use this to decide whether to
 * write a refreshed GCM ciphertext back to the database after a
 * successful legacy decrypt. Does not attempt decryption; purely a
 * structural check.
 */
export function isLegacyFormat(encryptedText: string): boolean {
  return encryptedText.split(':').length === 2
}
