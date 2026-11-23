// Orbit relay: a tiny store-and-forward mailbox so messages reach a phone that was closed.
// It only ever sees encrypted blobs (end-to-end encrypted by the apps) plus random inbox ids.
// Optional: sends a generic Apple push ("New message") so the phone can alert the person.
const MAX_BLOB = 90000      // bytes per message
const MAX_QUEUE = 300       // messages kept per inbox
const TTL = 14 * 24 * 3600  // seconds a message waits for its owner
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' }
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...cors } })
const okId = s => typeof s === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s)
const enc = new TextEncoder()
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function sha (s) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s))) }

async function apnsJwt (env) {
  const pem = env.APNS_KEY.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const head = b64u(enc.encode(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID })))
  const body = b64u(enc.encode(JSON.stringify({ iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })))
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body))
  return head + '.' + body + '.' + b64u(sig)
}
async function push (env, token, badge) {
  if (!env.APNS_KEY || !token) return
  try {
    const host = env.APNS_SANDBOX === '1' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
    await fetch(`https://${host}/3/device/${token}`, { method: 'POST', headers: { authorization: 'bearer ' + await apnsJwt(env), 'apns-topic': env.APNS_TOPIC, 'apns-push-type': 'alert', 'apns-priority': '10' },
      body: JSON.stringify({ aps: { alert: { title: 'Orbit', body: 'You have a new message' }, sound: 'default', badge: badge || 1 } }) })
  } catch { /* push is best effort */ }
}

export default {
  async fetch (req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
    const url = new URL(req.url)
    if (req.method === 'GET') return json({ orbit: 'relay', ok: true })
    let b; try { b = await req.json() } catch { return json({ error: 'bad json' }, 400) }
    if (!okId(b.inbox)) return json({ error: 'bad inbox' }, 400)
    const rk = 'r:' + b.inbox
    const reg = await env.KV.get(rk, 'json')

    if (url.pathname === '/register') {                 // claim an inbox (first claim wins) and optionally attach a push token
      if (typeof b.pk !== 'string' || b.pk.length < 16) return json({ error: 'bad key' }, 400)
      const h = await sha(b.pk)
      if (reg && reg.h !== h) return json({ error: 'inbox taken' }, 403)
      await env.KV.put(rk, JSON.stringify({ h, tok: typeof b.token === 'string' ? b.token.slice(0, 200) : (reg && reg.tok) || '' }), { expirationTtl: 90 * 24 * 3600 })
      return json({ ok: true })
    }
    if (url.pathname === '/put') {                      // anyone in a circle can drop an encrypted message in a member's inbox
      if (typeof b.blob !== 'string' || b.blob.length > MAX_BLOB) return json({ error: 'too big' }, 413)
      if (!reg) return json({ error: 'unknown inbox' }, 404)
      const list = await env.KV.list({ prefix: 'q:' + b.inbox + ':', limit: MAX_QUEUE + 1 })
      if (list.keys.length > MAX_QUEUE) return json({ error: 'inbox full' }, 429)
      const k = 'q:' + b.inbox + ':' + Date.now().toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 8)
      await env.KV.put(k, b.blob, { expirationTtl: TTL })
      if (reg.tok) await push(env, reg.tok, list.keys.length + 1)
      return json({ ok: true })
    }
    if (url.pathname === '/pull') {                     // the owner fetches (and acknowledges) their messages
      if (!reg || typeof b.pk !== 'string' || await sha(b.pk) !== reg.h) return json({ error: 'forbidden' }, 403)
      if (Array.isArray(b.ack)) await Promise.all(b.ack.slice(0, 200).filter(k => typeof k === 'string' && k.startsWith('q:' + b.inbox + ':')).map(k => env.KV.delete(k)))
      const list = await env.KV.list({ prefix: 'q:' + b.inbox + ':', limit: 100 })
      const items = []
      for (const k of list.keys) { const v = await env.KV.get(k.name); if (v) items.push({ k: k.name, blob: v }) }
      return json({ items })
    }
    return json({ error: 'not found' }, 404)
  }
}
