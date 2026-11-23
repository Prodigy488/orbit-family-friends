// storage, helpers, safety heuristics
export const APP_ID = 'orbit-p2p-circles-v1'

const dbp = new Promise((resolve, reject) => {
  const r = indexedDB.open('orbit', 1)
  r.onupgradeneeded = () => {
    const d = r.result
    d.createObjectStore('kv')
    d.createObjectStore('msgs', { keyPath: 'id' }).createIndex('cid', 'cid')
    d.createObjectStore('files')
  }
  r.onsuccess = () => resolve(r.result)
  r.onerror = () => reject(r.error)
})
const tx = (store, mode, fn) => dbp.then(d => new Promise((resolve, reject) => {
  const t = d.transaction(store, mode); const r = fn(t.objectStore(store))
  t.oncomplete = () => resolve(r && r.result); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error)
}))
export const kvGet = k => tx('kv', 'readonly', s => s.get(k))
export const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k))
export const msgsOf = cid => tx('msgs', 'readonly', s => s.index('cid').getAll(cid))
export const msgPut = m => tx('msgs', 'readwrite', s => s.put(m))
export const msgDel = id => tx('msgs', 'readwrite', s => s.delete(id))
export const filePut = (id, blob) => tx('files', 'readwrite', s => s.put(blob, id))
export const fileGet = id => tx('files', 'readonly', s => s.get(id))
export const fileDel = id => tx('files', 'readwrite', s => s.delete(id))
export const fileKeys = () => tx('files', 'readonly', s => s.getAllKeys())
export async function wipeAll () {
  const d = await dbp
  await Promise.all(['kv', 'msgs', 'files'].map(n => new Promise(r => { const t = d.transaction(n, 'readwrite'); t.objectStore(n).clear(); t.oncomplete = r })))
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const fmtB = n => { n = +n || 0; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < 3) { n /= 1024; i++ } return (i ? n.toFixed(n < 10 ? 1 : 0) : n | 0) + ' ' + u[i] }
export const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const fmtDay = ts => { const d = new Date(ts); const t = new Date(); const y = new Date(t - 864e5); return d.toDateString() === t.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) }
export const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const unb64u = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

export const COLORS = ['#5b8cff', '#8b5cff', '#2de2c4', '#3ddc84', '#ffb347', '#ff7a45', '#ff6fae', '#4cc3ff', '#c9e265', '#e879f9']
export const AVATARS = ['😀', '😎', '🥳', '🦊', '🐼', '🐸', '🦄', '🐙', '🌵', '🍕', '🚀', '🎧', '🎮', '🌈', '🔥', '👾', '🐶', '🐱', '🦋', '🌻']

// ---------- invites
export function makeInvite (c) { return 'orbit1.' + b64u(JSON.stringify({ r: c.roomId, p: c.password, n: c.name })) }
export function parseInvite (text) {
  let t = String(text || '').trim()
  const h = t.indexOf('#join='); if (h >= 0) t = decodeURIComponent(t.slice(h + 6))
  if (t.startsWith('orbit1.')) t = t.slice(7)
  try { const j = JSON.parse(unb64u(t)); if (j.r && j.p) return { roomId: String(j.r), password: String(j.p), name: String(j.n || 'Circle') } } catch { /* not an invite */ }
  return null
}

// ---------- safety heuristics
const EXEC = /\.(exe|msi|bat|cmd|scr|ps1|vbs|js|jse|jar|apk|dmg|pkg|com|lnk|hta|reg|sh|appimage)$/i
export const isExecutable = name => EXEC.test(name || '')
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'buff.ly', 'rebrand.ly'])
export function linkRisk (url) {
  try {
    const u = new URL(url); const h = u.hostname.toLowerCase(); const why = []
    if (!/^https?:$/.test(u.protocol)) why.push('not a web link')
    if (u.protocol === 'http:') why.push('not encrypted (http)')
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) why.push('goes to a raw IP address')
    if (h.includes('xn--')) why.push('uses look-alike (punycode) characters')
    if (SHORTENERS.has(h)) why.push('is a link shortener that hides the destination')
    if (u.username || u.password) why.push('contains a username/password trick')
    return { host: h, why }
  } catch { return { host: '', why: ['is not a valid link'] } }
}

export function linkify (escaped) {
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, (m) => {
    const clean = m.replace(/[).,!?;:]+$/, ''); const tail = m.slice(clean.length)
    return `<a href="#" data-url="${clean}">${clean}</a>${tail}`
  })
}
export const isEmojiOnly = t => { const s = String(t || '').trim(); return !!s && s.length <= 16 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(s) && !/^\d+$/.test(s) }

export function fileKind (type, name) {
  type = type || ''
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('text/') || /\.(txt|md|log|csv|json)$/i.test(name || '')) return 'text'
  return 'file'
}
export const fileIcon = k => ({ image: '🖼', video: '🎬', audio: '🎵', text: '📄', file: '📦' }[k] || '📦')
