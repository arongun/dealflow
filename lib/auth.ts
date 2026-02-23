const COOKIE_NAME = 'df_session'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function getKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function createSession(secret: string): Promise<string> {
  const expires = Date.now() + SESSION_DURATION_MS
  const payload = `authenticated:${expires}`
  const key = await getKey(secret)
  const encoder = new TextEncoder()
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  )
  const sig = bytesToHex(new Uint8Array(signature))
  return `${payload}.${sig}`
}

export async function verifySession(
  token: string,
  secret: string
): Promise<boolean> {
  try {
    const lastDot = token.lastIndexOf('.')
    if (lastDot === -1) return false
    const payload = token.substring(0, lastDot)
    const sig = token.substring(lastDot + 1)

    const key = await getKey(secret)
    const encoder = new TextEncoder()
    const sigBytes = hexToBytes(sig)
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer as ArrayBuffer,
      encoder.encode(payload)
    )
    if (!valid) return false

    const parts = payload.split(':')
    if (parts[0] !== 'authenticated') return false
    const expires = parseInt(parts[1], 10)
    if (Date.now() > expires) return false

    return true
  } catch {
    return false
  }
}

export function sessionCookieOptions(): string {
  const maxAge = SESSION_DURATION_MS / 1000
  return `${COOKIE_NAME}={value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

export { COOKIE_NAME, SESSION_DURATION_MS }
