// Offline delivery through an optional relay. Messages are encrypted on the device with a key derived
// from the circle password, so the relay only ever holds ciphertext.
const te = new TextEncoder(); const td = new TextDecoder()
const b64 = u8 => { let s = ''; for (const c of u8) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
export const randId = n => b64(crypto.getRandomValues(new Uint8Array(n)))
const keys = {}
async function keyFor (c) {
  const id = c.roomId + ':' + c.password
  if (keys[id]) return keys[id]
  const base = await crypto.subtle.importKey('raw', te.encode(c.password), 'PBKDF2', false, ['deriveKey'])
  return (keys[id] = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: te.encode('orbit-relay-v1:' + c.roomId), iterations: 60000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
}
export async function seal (c, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(c), te.encode(JSON.stringify({ r: c.roomId, m: obj }))))
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64(out)
}
export async function open (circles, blob) {
  const raw = unb64(blob); const iv = raw.slice(0, 12); const ct = raw.slice(12)
  for (const c of circles) {
    try { const j = JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await keyFor(c), ct))); if (j.r === c.roomId) return { c, m: j.m } } catch { /* not this circle */ }
  }
  return null
}
const post = async (base, path, body) => {
  const res = await fetch(base.replace(/\/+$/, '') + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error('relay ' + res.status)
  return res.json()
}
export const relayRegister = (base, inbox, pk, token) => post(base, '/register', { inbox, pk, token })
export const relayPut = (base, inbox, blob) => post(base, '/put', { inbox, blob })
export const relayPull = (base, inbox, pk, ack) => post(base, '/pull', { inbox, pk, ack })
