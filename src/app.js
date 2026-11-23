import { joinRoom, roles } from '@trystero-p2p/torrent'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import profanity from 'leo-profanity'
import 'emoji-picker-element'
import L from 'leaflet'
import { APP_ID, kvGet, kvSet, msgsOf, msgPut, msgDel, filePut, fileGet, fileDel, wipeAll, uid, esc, fmtB, fmtTime, fmtDay, COLORS, AVATARS, makeInvite, parseInvite, isExecutable, linkRisk, linkify, isEmojiOnly, fileKind, fileIcon as _fi } from './core.js'
import { openStudio } from './studio.js'
import { ic } from './icons.js'
import { play } from './sounds.js'
import { randId, seal, open as relayOpen, relayRegister, relayPut, relayPull } from './relay.js'

const fileIcon = k => ic({ image: 'image', video: 'film', audio: 'music', text: 'file', file: 'file' }[k] || 'file', 28)
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
profanity.loadDictionary('en')

// ===================================================================== state
const THEMES = [['midnight', 'Midnight', 'linear-gradient(135deg,#0b0d12,#5b8cff)'], ['aurora', 'Aurora', 'linear-gradient(135deg,#0fb8a0,#6a5cff)'], ['ember', 'Ember', 'linear-gradient(135deg,#e8501f,#d62e5a)'], ['forest', 'Forest', 'linear-gradient(135deg,#14231a,#5fd68a)'], ['neon', 'Neon', 'linear-gradient(135deg,#b61ff0,#27e8ff)'], ['rose', 'Rosewood', 'linear-gradient(135deg,#441f3a,#ff6fae)'], ['ocean', 'Ocean', 'linear-gradient(135deg,#1c8fd6,#3b5bdb)'], ['dusk', 'Dusk', 'linear-gradient(135deg,#382a52,#a78bfa)'], ['sunset', 'Sunset', 'linear-gradient(135deg,#ff8a3d,#e5405e)'], ['amoled', 'AMOLED', 'linear-gradient(135deg,#000,#2b2b31)']]
const BGS = [['none', 'None', ''], ['dots', 'Dots', 'radial-gradient(rgba(255,255,255,.08) 1.5px,transparent 1.5px) 0 0/22px 22px'], ['grid', 'Grid', 'linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px) 0 0/26px 26px,linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px) 0 0/26px 26px'], ['aurora', 'Aurora', 'linear-gradient(160deg,#0b3b4a,#3a1f6b 55%,#0b0d12)'], ['sunrise', 'Sunrise', 'linear-gradient(180deg,#43255c,#c44a5a 70%,#f0a45a)'], ['deep', 'Deep sea', 'linear-gradient(180deg,#04121f,#0a3a5a)'], ['moss', 'Moss', 'linear-gradient(160deg,#0f2418,#27583a)'], ['wine', 'Wine', 'linear-gradient(160deg,#2a0a1a,#6a1b3e)'], ['mesh', 'Mesh', 'radial-gradient(at 20% 20%,#5b8cff55,transparent 50%),radial-gradient(at 80% 30%,#ff3df044,transparent 50%),radial-gradient(at 50% 90%,#2de2c444,transparent 50%),#0b0d12']]
const DEF = {
  me: null,
  settings: { theme: 'midnight', bubble: 'round', density: 'cozy', font: 'system', glass: false, align: 'split', profanity: true, shield: 'blur', giphy: '', notif: true, sound: true, soundSet: 'msn', volume: 0.7, popups: true, receipts: true, relay: '', discoverable: true, relays: '', turnUrl: '', turnUser: '', turnPass: '', webBase: '' },
  circles: [], blocked: {}
}
const S = { ...JSON.parse(JSON.stringify(DEF)), view: 'chats', invites: [], seenOn: {}, boot: Date.now(), feedFilter: 'all', feedNew: 0, feedOpen: new Set(), postDraft: { text: '', file: null, cids: null }, drafts: {}, draftCid: '', uid: '', active: null, panel: null, tab: 'members', mobileChat: false, reply: null, revealProf: new Set(), revealImg: new Set() }
const R = {}              // runtime per circle
const blobs = {}          // fileId -> {url, type, size}
const loading = new Set() // fileIds being read from DB
const shield = {}         // fileId -> 'pending' | 'ok' | 'sensitive'
window.__orbit = { S, R, shield }; setTimeout(() => Object.assign(window.__orbit, { relayPullAll, relayInit, saveCfg }), 0)
const prog = {}           // fileId -> 0..1 while downloading
let callUI = null
let myShares = {}         // cid -> {until, to:[userIds], watch, timer}

const saveCfg = () => kvSet('cfg', { me: S.me, settings: S.settings, circles: S.circles.map(c => ({ ...c })), blocked: S.blocked })
const isBlocked = id => !!S.blocked[id]
const profOf = (r, id) => r.users[id] || { name: 'Someone', emoji: '🙂', color: '#888' }
const me = () => S.me || { name: '', emoji: '🙂', color: '#555', pay: {} }
const cur = () => R[S.active]

function toast (msg, err) { const d = document.createElement('div'); d.className = 'toast' + (err ? ' err' : ''); d.textContent = msg; $('#toasts').appendChild(d); setTimeout(() => d.remove(), 5000) }
function beepForce (kind) { try { play(S.settings.soundSet, kind, S.settings.volume) } catch { /* ignore */ } }
function beep (kind = 'msg') { if (!S.settings.sound) return; try { play(S.settings.soundSet, kind, S.settings.volume) } catch { /* ignore */ } }
function notify (title, body, kind = 'msg') { beep(kind); if (S.settings.notif && document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body }) } catch { /* ignore */ } } }

function applyLook () {
  const s = S.settings; const h = document.documentElement
  h.dataset.theme = s.theme; h.dataset.bubble = s.bubble === 'round' ? '' : s.bubble; h.dataset.density = s.density === 'cozy' ? '' : s.density
  h.dataset.font = s.font === 'system' ? '' : s.font; h.dataset.glass = s.glass ? 'on' : ''; h.dataset.align = s.align === 'split' ? '' : 'left'
}
const avatarStyle = p => p.img ? `background-image:url(${p.img})` : `background:${p.color || '#555'}`
const avatar = (p, cls = '', dot = false) => `<div class="av ${cls}" style="${avatarStyle(p)}">${p.img ? '' : esc(p.emoji || '🙂')}${dot ? '<span class="dot"></span>' : ''}</div>`

// ===================================================================== rooms
function relayList () {
  const q = new URLSearchParams(location.search).get('relays')
  const raw = q || S.settings.relays || ''
  return raw.split(/[\s,]+/).filter(u => /^wss?:\/\//.test(u))
}
function baseCfg (pw) {
  const cfg = { appId: APP_ID, password: pw }
  const rl = relayList(); if (rl.length) cfg.relayConfig = { urls: rl }
  if (S.settings.turnUrl) cfg.turnConfig = [{ urls: S.settings.turnUrl.split(/[\s,]+/).filter(Boolean), username: S.settings.turnUser, credential: S.settings.turnPass }]
  return cfg
}
function mkRoom (c) {
  const cfg = { ...baseCfg(c.password), use: [c.isAdmin ? roles({ selfAsAdmin: true }) : roles()], maxReceiveBytes: 1536 * 1024 * 1024 }
  return joinRoom(cfg, c.isAdmin ? c.baseId : c.roomId)
}

async function connect (c) {
  if (R[c.id]) return R[c.id]
  const room = mkRoom(c)
  const r = R[c.id] = { c, room, users: {}, online: new Set(), msgs: [], unread: 0, typing: {}, locs: {}, callUsers: {}, tomb: new Set(), loaded: false, A: {}, peers: {}, seenBy: {} }
  const stored = await msgsOf(c.id); r.msgs = stored.sort((a, b) => a.ts - b.ts); r.loaded = true
  r.tomb = new Set((await kvGet('tomb:' + c.id)) || [])
  room.getSelf().then(self => {
    S.uid = self.userId
    if (c.isAdmin && c.roomId !== self.roomId) { c.roomId = self.roomId; saveCfg() }
    if (c.isAdmin && !c.owner) { c.owner = self.userId; saveCfg() }
    if (c.isAdmin) room.ready.then(() => r.cstate.set({ name: c.name, ttl: c.ttl || 0, owner: c.owner })).catch(() => {})
    render()
  })
  // profile (signed, synced to late joiners)
  r.profile = room.makeUserState('profile', profilePayload(), { maxBytes: 65000 })
  c.members = c.members || {}
  r.users = { ...c.members }
  const syncUsers = () => {
    let changed = false
    for (const [id, v] of Object.entries(r.profile.getAll() || {})) { if (!v || isBlocked(id)) continue; if (JSON.stringify(c.members[id]) !== JSON.stringify(v)) { c.members[id] = v; changed = true } }
    r.users = { ...c.members }; for (const id of Object.keys(r.users)) if (isBlocked(id)) delete r.users[id]
    if (changed) { saveCfg(); render() }
  }
  r.syncUsers = syncUsers
  room.ready.then(() => r.profile.set(profilePayload())).catch(() => {})
  r.profile.onChange(() => syncUsers(), { replay: true })
  setInterval(syncUsers, 3000)
  r.cstate = room.makeState('circle', { name: c.name, ttl: c.ttl || 0, owner: c.owner || '' })
  r.cstate.onChange(v => { if (v && v.name) { if (!c.dm) c.name = String(v.name).slice(0, 60); c.ttl = +v.ttl || 0; if (v.owner && !c.owner && typeof v.owner === 'string') c.owner = v.owner; saveCfg(); render() } }, { replay: true })
  r.callState = room.makeUserState('call', { active: false, video: false })
  r.callState.onChange((v, ctx) => {
    if (ctx.self) return
    const was = !!r.callUsers[ctx.userId]
    if (v && v.active && !isBlocked(ctx.userId)) { r.callUsers[ctx.userId] = v; if (!was) { notify(profOf(r, ctx.userId).name + ' started a call', c.name, 'call'); toast(profOf(r, ctx.userId).name + ' is in a call in ' + c.name) } } else { delete r.callUsers[ctx.userId]; dropTiles(ctx.userId) }
    if (r.call && r.call.on) syncTiles()
    render()
  }, { replay: true })
  // actions
  const A = r.A
  A.msg = room.makeAction('msg'); A.del = room.makeAction('del'); A.react = room.makeAction('react'); A.typing = room.makeAction('typing'); A.loc = room.makeAction('loc')
  A.seen = room.makeAction('seen'); A.seen.onMessage((d, ctx) => { if (isBlocked(ctx.userId) || !d) return; r.seenBy[ctx.userId] = Math.max(r.seenBy[ctx.userId] || 0, +d.ts || 0); if (S.active === c.id && S.view === 'chats') renderChat() })
  A.ring = room.makeAction('ring'); A.ring.onMessage((d, ctx) => onRing(r, ctx.userId))
  A.edit = room.makeAction('edit'); A.inv = room.makeAction('inv'); A.cdel = room.makeAction('cdel')
  A.edit.onMessage((d, ctx) => { if (isBlocked(ctx.userId)) return; applyEdit(r, d && d.id, d && d.text, ctx.userId) })
  A.inv.onMessage((d, ctx) => onInvite(d, ctx.userId))
  A.cdel.onMessage((d, ctx) => { if (!c.isAdmin && c.owner && ctx.userId === c.owner) { toast('"' + c.name + '" was deleted by its owner.'); leaveCircle(c.id, false) } })
  A.sync = room.makeAction('sync', { kind: 'request' }); A.fget = room.makeAction('fget', { kind: 'request' })
  A.msg.onMessage((m, ctx) => { if (isBlocked(ctx.userId) || !validMsg(m) || m.from !== ctx.userId) return; ingest(r, m, true, ctx.peerId) })
  A.del.onMessage((d, ctx) => { if (isBlocked(ctx.userId)) return; removeMsg(r, d.id, ctx.userId) })
  A.react.onMessage((d, ctx) => { if (isBlocked(ctx.userId)) return; applyReact(r, d.mid, d.e, ctx.userId, d.on) })
  A.typing.onMessage((d, ctx) => { if (isBlocked(ctx.userId)) return; r.typing[ctx.userId] = Date.now() + 4000; if (S.active === c.id) renderTyping() })
  A.loc.onMessage((d, ctx) => onLoc(r, d, ctx.userId))
  A.sync.onRequest((req, ctx) => {
    if (isBlocked(ctx.userId)) return { msgs: [], dels: [] }
    const have = new Set((req && req.ids) || [])
    const msgs = r.msgs.filter(m => m.kind !== 'sys' && !have.has(m.id) && !isBlocked(m.from)).slice(-300)
    const dels = [...r.tomb].slice(-500)
    return { msgs, dels }
  })
  A.fget.onRequest(async (req, ctx) => {
    if (isBlocked(ctx.userId) || !req || typeof req.id !== 'string') return null
    return (await fileGet(req.id)) || null
  })
  room.onUserJoin(({ userId, peerId }) => {
    r.online.add(userId); r.peers[userId] = peerId; setTimeout(syncUsers, 500)
    setTimeout(() => { const p = r.users[userId]; if (p && !isBlocked(userId) && Date.now() - S.boot > 15000 && Date.now() - (S.seenOn[userId] || 0) > 120000) { S.seenOn[userId] = Date.now(); beep('online'); toast(p.name + ' is online') } }, 1500)
    if (isBlocked(userId)) return
    A.sync.request({ ids: r.msgs.slice(-600).map(m => m.id) }, { target: peerId, timeoutMs: 20000 }).then(res => {
      if (!res || !Array.isArray(res.msgs)) return
      for (const d of res.dels || []) { const m = r.msgs.find(x => x.id === d); if (m && m.from === userId) removeMsg(r, d, userId) }
      for (const m of res.msgs) if (validMsg(m) && !isBlocked(m.from)) ingest(r, m, false, peerId)
      for (const m of r.msgs) if (m.file && !blobs[m.file.id]) tryFetch(r, m)
    }).catch(() => {})
    const sh = myShares[c.id]; if (sh && (sh.all || sh.to.includes(userId))) sendLoc(c.id, true)
    if (r.call && r.call.on) room.addStream(r.call.stream, { target: peerId, metadata: { type: 'webcam' } }).catch(() => {})
    render()
  })
  room.onUserLeave(({ userId }) => { r.online.delete(userId); delete r.typing[userId]; delete r.locs[userId]; delete r.callUsers[userId]; dropTiles(userId); render() })
  room.onPeerStream((stream, ctx) => { if (!isBlocked(ctx.userId)) addTile(r, ctx.userId, ctx.peerId, stream, (ctx.metadata && ctx.metadata.type) || 'webcam') })
  room.onError(err => {
    if (err.code === 'banned') { toast('You were removed from "' + c.name + '".', true); leaveCircle(c.id, false) }
    if (err.code === 'peer-connect-failed' && !err.turnConfigured && !R.__turnTip) { R.__turnTip = 1; toast('Some people could not connect directly. Adding a TURN server in Settings > Network helps on strict networks.') }
  })
  return r
}

const profilePayload = () => ({ name: me().name, emoji: me().emoji, color: me().color, img: me().img || '', status: me().status || '', pay: me().pay || {}, ib: me().ib || '' })
function pushProfile () { Object.values(R).forEach(r => r.profile && r.profile.set(profilePayload())) }

async function createCircle (name, opts = {}) {
  const c = { id: uid(), baseId: 'c-' + uid().replace(/-/g, '').slice(0, 14), roomId: '', password: uid().replace(/-/g, ''), name: name.trim().slice(0, 60) || 'My Circle', isAdmin: true, ttl: 0, created: Date.now(), bg: { id: 'mesh', dim: .25, blur: 0 }, dm: !!opts.dm, dmWith: opts.dmWith || '' }
  S.circles.push(c); await saveCfg()
  const r = await connect(c)
  const self = await r.room.getSelf(); c.roomId = self.roomId; await saveCfg()
  sysMsg(r, opts.dm ? 'Private chat started. It begins when ' + name + ' accepts.' : 'Circle created. Share the invite so others can join.')
  openCircle(c.id); return c
}
async function joinByInvite (text, opts = {}) {
  const inv = parseInvite(text); if (!inv) { toast('That invite code or link is not valid.', true); return false }
  const ex = S.circles.find(c => c.roomId === inv.roomId); if (ex) { openCircle(ex.id); toast('You are already in that circle.'); return true }
  const c = { id: uid(), baseId: '', roomId: inv.roomId, password: inv.password, name: (opts.dm && opts.name ? opts.name : inv.name).slice(0, 60), isAdmin: false, dm: !!opts.dm, dmWith: opts.from || '', ttl: 0, created: Date.now(), bg: { id: 'mesh', dim: .25, blur: 0 } }
  S.circles.push(c); await saveCfg(); await connect(c); sysMsg(R[c.id], 'You joined ' + c.name + '. History syncs when other members are online.')
  openCircle(c.id); return true
}
async function leaveCircle (id, ask = true) {
  const r = R[id]; const c = S.circles.find(x => x.id === id); if (!c) return
  if (ask && !confirm(`Leave "${c.name}"? Messages and files on this device will be deleted.`)) return
  try { stopShare(id); if (r) { await r.room.leave(); leaveCall(id) } } catch { /* ignore */ }
  for (const m of (r ? r.msgs : [])) { await msgDel(m.id); if (m.file) await fileDel(m.file.id) }
  delete R[id]; S.circles = S.circles.filter(x => x.id !== id); await saveCfg()
  if (S.active === id) { S.active = null; S.panel = null; S.mobileChat = false; S.view = 'chats' }
  render()
  if (!S.active && S.circles[0] && window.innerWidth > 820) openCircle(S.circles[0].id)
}
const openCircle = id => { S.view = 'chats'; S.active = id; S.mobileChat = true; S.reply = null; S.editing = null; const r = R[id]; if (r) r.unread = 0; render(); scrollEnd(); if (r) setTimeout(() => sendSeen(r), 300) }

// ===================================================================== people: usernames, invites, private chats
const MBX_PW = 'orbit-mailbox-v1'
const slug = n => String(n || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
const cardPayload = () => ({ name: me().name, emoji: me().emoji, color: me().color, img: me().img || '', handle: me().handle || '', at: me().handleAt || 0 })
let mbx = null
async function startMailbox () {
  if (mbx) { try { await mbx.room.leave() } catch { /* ignore */ } mbx = null }
  const h = S.me && S.me.handle; if (!h || S.settings.discoverable === false) return
  const room = joinRoom(baseCfg(MBX_PW), 'u-' + h)
  const card = room.makeUserState('card', cardPayload(), { maxBytes: 30000 })
  room.ready.then(() => card.set(cardPayload())).catch(() => {})
  const inv = room.makeAction('inv')
  inv.onMessage((d, ctx) => onInvite(d, ctx.userId))
  mbx = { room, card, inv }
  // username conflicts: the earliest claim keeps the name, later claimants are renamed
  let myId = ''; room.getSelf().then(x => { myId = x.userId }).catch(() => {})
  const check = () => {
    if (!myId || mbx === null || mbx.room !== room) return
    for (const [u, v] of Object.entries(card.getAll() || {})) {
      if (u === myId || !v || v.handle !== S.me.handle) continue
      const theirs = +v.at || 0; const mine = S.me.handleAt || 0
      if (theirs && (theirs < mine || (theirs === mine && u < myId))) { renameHandle(); return }
    }
  }
  card.onChange(() => check(), { replay: true }); setTimeout(check, 6000); setTimeout(check, 15000)
}
async function renameHandle () {
  const old = S.me.handle; const base = old.replace(/\d+$/, '').slice(0, 16) || 'user'
  S.me.handle = base + Math.floor(100 + Math.random() * 900); S.me.handleAt = Date.now(); await saveCfg()
  toast('@' + old + ' was already taken, so you are now @' + S.me.handle + '. You can change it in Settings.', true)
  startMailbox()
}
// returns the claimant if somebody else online already uses this username
async function handleTaken (h) {
  const room = joinRoom(baseCfg(MBX_PW), 'u-' + h); const card = room.makeUserState('card', {})
  let myId = ''; room.getSelf().then(x => { myId = x.userId }).catch(() => {})
  const t0 = Date.now(); let hit = null
  while (Date.now() - t0 < 6000 && !hit) {
    await new Promise(r => setTimeout(r, 500))
    hit = Object.entries(card.getAll() || {}).find(([u, v]) => u !== myId && u !== S.uid && v && v.handle === h) || null
  }
  try { await room.leave() } catch { /* ignore */ }
  return hit
}
const invRate = {}
function onInvite (d, from) {
  if (!d || typeof d !== 'object' || isBlocked(from) || typeof d.code !== 'string' || d.code.length > 1500) return
  const inv = parseInvite(d.code); if (!inv) return
  if (Date.now() - (invRate[from] || 0) < 4000) return; invRate[from] = Date.now()
  if (S.circles.some(c => c.roomId === inv.roomId) || S.invites.some(i => i.code === d.code)) return
  const f = d.from || {}
  const it = { code: d.code, dm: !!d.dm, circle: String(d.name || inv.name).slice(0, 60), from, name: String(f.name || 'Someone').slice(0, 30), emoji: String(f.emoji || '🙂').slice(0, 8), color: /^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color : '#566', ts: Date.now() }
  S.invites.push(it)
  notify(it.name + (it.dm ? ' wants to chat' : ' invited you to ' + it.circle), 'Open Orbit to accept or decline', 'online'); renderList()
}
const inviteMsg = (c, dm) => ({ code: makeInvite(c), name: c.name, dm: !!dm, from: { name: me().name, emoji: me().emoji, color: me().color } })
const dmPeer = r => { const id = Object.keys(r.users).find(u => u !== S.uid); return id ? profOf(r, id) : null }
async function startDM (p) {
  const ex = S.circles.find(c => c.dm && c.dmWith === p.uid); if (ex) { openCircle(ex.id); return }
  const c = await createCircle(p.name, { dm: true, dmWith: p.uid })
  try { await p.send(inviteMsg(c, true)); toast('Chat request sent to ' + p.name) } catch { toast('Could not reach ' + p.name + ' right now.', true) }
}
function knownPeople () {
  const out = {}
  for (const r of Object.values(R)) for (const [u, p] of Object.entries(r.users)) {
    if (u === S.uid || isBlocked(u)) continue
    const on = r.online.has(u) && r.peers[u]
    if (!out[u] || (on && !out[u].send)) out[u] = { uid: u, ...p, send: on ? payload => r.A.inv.send(payload, { target: r.peers[u] }) : null }
  }
  return Object.values(out)
}
function findDialog () {
  const opts = S.circles.map(c => `<option value="${c.id}" ${c.id === S.active ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
  const m = modal(`<h2>Find people</h2><p class="mute">Type a username to find someone who is online right now. You can start a private chat or add them to one of your circles; they choose whether to accept.</p>
    <div class="srch"><span>@</span><input id="fq" placeholder="username" maxlength="20" autocomplete="off" autocapitalize="off"><button class="btn pri" id="fgo">${ic('search', 16)} Search</button></div>
    <div id="fres" style="margin-top:10px"></div>
    <h4 class="mute" style="margin:16px 0 6px">People from your circles</h4><div id="fknown"></div>
    <div class="foot"><span class="row-sel"><span class="mute sm">Add to:</span> <select id="fcirc">${opts || '<option value="">(no circles yet)</option>'}</select></span><button class="btn" data-x>Done</button></div>`, true)
  const found = {}; const known = {}
  const row = p => `<div class="mrow">${avatar(p, '', !!p.send)}<div class="t"><div class="n">${esc(p.name)}${p.handle ? ` <span class="tag">@${esc(p.handle)}</span>` : ''}</div><div class="mute sm">${p.send ? 'Online' : 'Offline right now'}</div></div><button class="btn sm pri" data-fm="${p.uid}" ${p.send ? '' : 'disabled'}>Message</button><button class="btn sm" data-fa="${p.uid}" ${p.send ? '' : 'disabled'}>Add</button></div>`
  const drawKnown = () => { const k = knownPeople(); k.forEach(p => { known[p.uid] = p }); const el = $('#fknown', m); if (el) el.innerHTML = k.length ? k.map(row).join('') : '<p class="mute sm">Nobody yet. Join or create a circle first.</p>' }
  drawKnown(); const kt = setInterval(() => { if (!document.body.contains(m)) clearInterval(kt); else drawKnown() }, 3000)
  let sroom = null
  const leaveSearch = async () => { if (sroom) { const x = sroom; sroom = null; try { await x.leave() } catch { /* ignore */ } } }
  const search = async () => {
    const h = slug($('#fq', m).value); if (!h) return
    await leaveSearch(); for (const k of Object.keys(found)) delete found[k]
    $('#fres', m).innerHTML = '<p class="mute">Searching…</p>'
    const room = joinRoom(baseCfg(MBX_PW), 'u-' + h); sroom = room
    const card = room.makeUserState('card', {}); const inv = room.makeAction('inv'); const peers = {}
    room.onUserJoin(({ userId, peerId }) => { peers[userId] = peerId })
    const t0 = Date.now()
    const tick = () => {
      if (sroom !== room) return
      if (!document.body.contains(m)) { leaveSearch(); return }
      const all = card.getAll() || {}
      const list = Object.entries(all).filter(([u, v]) => v && v.handle === h && u !== S.uid && !isBlocked(u)).map(([u, v]) => ({ uid: u, name: String(v.name || '?').slice(0, 30), emoji: String(v.emoji || '🙂').slice(0, 8), color: /^#[0-9a-f]{6}$/i.test(v.color || '') ? v.color : '#566', img: typeof v.img === 'string' && v.img.startsWith('data:image/') ? v.img : '', handle: h, send: peers[u] ? payload => inv.send(payload, { target: peers[u] }) : null }))
      list.forEach(p => { found[p.uid] = p })
      const el = $('#fres', m); if (!el) return
      el.innerHTML = list.length ? list.map(row).join('') : (Date.now() - t0 > 9000 ? `<p class="mute">No one is online as @${esc(h)} right now. They need Orbit open and "Let people find me" turned on.</p>` : '<p class="mute">Searching…</p>')
      setTimeout(tick, 900)
    }
    tick()
  }
  $('#fgo', m).onclick = search
  $('#fq', m).onkeydown = e => { if (e.key === 'Enter') search() }
  m.addEventListener('click', async e => {
    const b = e.target.closest('[data-fm],[data-fa]'); if (!b || b.disabled) return
    const u = b.dataset.fm || b.dataset.fa; const p = found[u] || known[u]
    if (!p || !p.send) { toast('They are offline right now.', true); return }
    if (b.dataset.fm) { m.remove(); await startDM(p); return }
    const c = S.circles.find(x => x.id === $('#fcirc', m).value); if (!c) { toast('Pick a circle first.', true); return }
    try { await p.send(inviteMsg(c, false)); toast('Invite sent to ' + p.name) } catch { toast('Could not reach them.', true) }
  })
  setTimeout(() => $('#fq', m).focus(), 50)
}
function deleteCircleDialog (id) {
  const c = S.circles.find(x => x.id === id); if (!c) return; const r = R[id]
  const m = modal(`<h2>${c.dm ? 'Delete chat' : 'Delete circle'} "${esc(c.name)}"</h2><p class="mute">Choose what to delete. Messages and files are removed from this device and cannot be recovered.</p>
    <div class="stackbtns">${c.isAdmin ? `<button class="btn dng" id="dcAll">${ic('trash', 16)} Delete for everyone</button><p class="mute sm" style="margin:0 0 8px">Removes it from the app of everyone who is online now. Anyone offline keeps their copy until they delete it.</p>` : ''}
    <button class="btn dng" id="dcMe">${ic('trash', 16)} Delete from this device only</button><button class="btn" data-x>Cancel</button></div>`)
  $('#dcMe', m).onclick = async () => { m.remove(); await leaveCircle(id, false); toast('Deleted') }
  if (c.isAdmin) $('#dcAll', m).onclick = async () => { try { await r.A.cdel.send({}) } catch { /* ignore */ } m.remove(); setTimeout(async () => { await leaveCircle(id, false); toast('Deleted for everyone online') }, 700) }
}
function popMsg (r, m) {
  if (S.settings.popups === false) return
  const box = $('#pops'); if (!box) return
  const p = profOf(r, m.from)
  const txt = msgPreview(m)
  const old = box.querySelector(`[data-pc="${r.c.id}"]`); const n = old ? (+old.dataset.n || 1) + 1 : 1; if (old) old.remove()
  const el = document.createElement('div'); el.className = 'npop'; el.dataset.pc = r.c.id; el.dataset.n = n
  el.innerHTML = `${avatar(p, '', true)}<div class="pt2"><b>${esc(p.name)}${r.c.dm ? '' : ' · ' + esc(r.c.name)}</b><span>${esc(String(txt || '').slice(0, 90))}</span></div>${n > 1 ? `<i class="badge">${n}</i>` : ''}<button class="ib" data-popx title="Dismiss">${ic('x', 14)}</button>`
  box.appendChild(el); while (box.children.length > 4) box.firstChild.remove()
  setTimeout(() => el.remove(), 7000)
}
function applyEdit (r, id, text, by) {
  const m = r.msgs.find(x => x.id === id); if (!m || m.from !== by || !['text', 'file'].includes(m.kind) || typeof text !== 'string' || !text.trim() && m.kind === 'text') return
  m.text = text.slice(0, 6000); m.edited = Date.now(); msgPut(m)
  if (S.active === r.c.id && S.view === 'chats') renderChat(); else renderList()
}
function startEdit (r, m) {
  const ta = $('#msg'); S.preEdit = ta ? ta.value : (S.drafts[S.active] || '')
  S.editing = m; S.reply = null; S.drafts[S.active] = m.text || ''
  renderMain(); const t = $('#msg'); if (t) { t.value = m.text || ''; t.focus(); t.setSelectionRange(t.value.length, t.value.length); t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px' }
}
function endEdit () { S.editing = null; renderMain(); const t = $('#msg'); if (t) { t.value = S.preEdit || ''; S.drafts[S.active] = t.value; t.style.height = 'auto'; t.focus() } S.preEdit = '' }
function cancelEdit () { if (S.editing) endEdit() }
function submitComposer (ta) {
  const r = cur(); if (!r) return
  if (S.editing) {
    const m = S.editing; const t = ta.value.trim()
    if (t || m.kind === 'file') { applyEdit(r, m.id, t, S.uid); r.A.edit.send({ id: m.id, text: t }).catch(() => {}) }
    endEdit(); return
  }
  sendText(ta.value); ta.value = ''; ta.style.height = 'auto'; S.drafts[S.active] = ''
}
function editDialog (r, m) {
  const mm = modal(`<h2>Edit message</h2><textarea id="edt" rows="4" maxlength="6000">${esc(m.text || '')}</textarea><div class="foot"><button class="btn" data-x>Cancel</button><button class="btn pri" id="edgo">Save</button></div>`)
  const ta = $('#edt', mm); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length)
  const go = () => { const t = ta.value.trim(); if (!t && m.kind === 'text') return; applyEdit(r, m.id, t, S.uid); r.A.edit.send({ id: m.id, text: t }).catch(() => {}); mm.remove() }
  $('#edgo', mm).onclick = go; ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go() }
}
async function saveMedia (id) {
  let f = null; for (const r of Object.values(R)) { const m = r.msgs.find(x => x.file && x.file.id === id); if (m) { f = m.file; break } }
  const b = blobs[id]; if (!f || !b) { toast('Still downloading, try again in a moment.', true); return }
  if (document.body.classList.contains('native') && navigator.canShare) {
    // iPhone: open the share sheet so the person can pick "Save Image" / "Save to Files"
    const blob = await (await fetch(b.url)).blob(); const file = new File([blob], f.name || 'orbit-file', { type: b.type || blob.type })
    if (navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(() => {}); return }
  }
  const a = document.createElement('a'); a.href = b.url; a.download = f.name || 'orbit-file'; document.body.appendChild(a); a.click(); a.remove(); toast('Saved ' + (f.name || 'file'))
}


// ===================================================================== messages
function validMsg (m) {
  if (!m || typeof m.id !== 'string' || m.id.length > 64 || typeof m.from !== 'string' || typeof m.ts !== 'number') return false
  if (m.kind === 'text') return typeof m.text === 'string' && m.text.length <= 6000
  if (m.kind === 'post') return (typeof m.text === 'string' && m.text.length <= 3000) && typeof m.pid === 'string' && m.pid.length <= 64 && (!m.file || (typeof m.file.id === 'string' && typeof m.file.name === 'string' && typeof m.file.size === 'number'))
  if (m.kind === 'comment') return typeof m.text === 'string' && m.text.length <= 1000 && typeof m.pid === 'string' && m.pid.length <= 64
  if (m.kind === 'loc') return typeof m.lat === 'number' && typeof m.lng === 'number' && Math.abs(m.lat) <= 90 && Math.abs(m.lng) <= 180 && typeof m.until === 'number'
  if (m.kind === 'file') return m.file && typeof m.file.id === 'string' && typeof m.file.name === 'string' && m.file.name.length < 300 && typeof m.file.size === 'number'
  return false
}
async function ingest (r, m, live, peerId) {
  if (r.tomb.has(m.id) || r.msgs.some(x => x.id === m.id)) return
  if (r.c.ttl && m.ts < Date.now() - r.c.ttl) return
  m = { id: m.id, cid: r.c.id, from: m.from, ts: Math.min(m.ts, Date.now() + 60000), kind: m.kind, pid: m.pid ? String(m.pid).slice(0, 64) : undefined, fc: /^#[0-9a-f]{6}$/i.test(m.fc || '') ? m.fc : undefined, gid: m.gid ? String(m.gid).slice(0, 64) : undefined, text: m.text ? String(m.text).slice(0, 6000) : '', file: m.file ? { id: m.file.id, name: m.file.name.slice(0, 200), type: String(m.file.type || '').slice(0, 100), size: m.file.size } : undefined, reply: m.reply && typeof m.reply.id === 'string' ? { id: m.reply.id, from: String(m.reply.from || ''), text: String(m.reply.text || '').slice(0, 120) } : undefined, reacts: m.reacts && typeof m.reacts === 'object' ? m.reacts : {}, edited: +m.edited || undefined, lat: typeof m.lat === 'number' ? m.lat : undefined, lng: typeof m.lng === 'number' ? m.lng : undefined, until: typeof m.until === 'number' ? m.until : undefined }
  r.msgs.push(m); r.msgs.sort((a, b) => a.ts - b.ts); await msgPut(m)
  if (m.file) tryFetch(r, m, peerId)
  if (live && m.from !== S.uid) {
    if (m.kind === 'post') { if (S.view !== 'feed') { S.feedNew++; popMsg(r, m) } notify(profOf(r, m.from).name + ' shared a post', (m.text || 'New photo').slice(0, 100)) }
    else if (m.kind === 'comment') { /* shown under the post in the feed */ }
    else if (S.active !== r.c.id || S.view !== 'chats' || document.hidden) { r.unread++; if (!r.c.mute) { r.ping = Date.now() + 5000; setTimeout(renderList, 5100); popMsg(r, m) } if (!r.c.mute) notify(profOf(r, m.from).name + ' · ' + r.c.name, msgPreview(m).slice(0, 120)) }
  }
  if (m.kind === 'post' || m.kind === 'comment') { if (S.view === 'feed') renderFeed(); else renderList() }
  else if (S.active === r.c.id && S.view === 'chats') { renderChat(); scrollEnd() } else renderList()
}
function removeMsg (r, id, by) {
  const m = r.msgs.find(x => x.id === id); if (!m) return
  if (by && m.from !== by) return
  r.tomb.add(id); kvSet('tomb:' + r.c.id, [...r.tomb].slice(-2000))
  r.msgs = r.msgs.filter(x => x.id !== id); msgDel(id)
  if (m.file && !Object.values(R).some(rr => rr.msgs.some(x => x.file && x.file.id === m.file.id))) { fileDel(m.file.id); if (blobs[m.file.id]) { URL.revokeObjectURL(blobs[m.file.id].url); delete blobs[m.file.id] } }
  if (S.active === r.c.id) renderChat(); else renderList()
}
function applyReact (r, mid, e, uidr, on) {
  const m = r.msgs.find(x => x.id === mid); if (!m || typeof e !== 'string' || e.length > 8) return
  m.reacts = m.reacts || {}; const a = new Set(m.reacts[e] || [])
  on ? a.add(uidr) : a.delete(uidr); if (a.size) m.reacts[e] = [...a]; else delete m.reacts[e]
  msgPut(m); if (S.view === 'feed') renderFeed(); else if (S.active === r.c.id) renderChat()
}
function sysMsg (r, text) { const m = { id: uid(), cid: r.c.id, from: '', ts: Date.now(), kind: 'sys', text }; r.msgs.push(m); msgPut(m) }
async function sendText (text) {
  const r = cur(); text = text.trim(); if (!r || !text) return
  const m = { id: uid(), cid: r.c.id, from: S.uid, ts: Date.now(), kind: 'text', text, fc: me().feedColor || '', reacts: {} }
  if (S.reply) { m.reply = { id: S.reply.id, from: S.reply.from, text: S.reply.kind === 'file' ? 'Attachment: ' + S.reply.file.name : S.reply.text.slice(0, 120) }; S.reply = null }
  r.msgs.push(m); await msgPut(m); r.A.msg.send(m).catch(() => {}); relaySend(r, m); render(); scrollEnd()
}
async function sendFile (file, caption) {
  const r = cur(); if (!r || !file) return
  const fid = uid(); await filePut(fid, file)
  blobs[fid] = { url: URL.createObjectURL(file), type: file.type, size: file.size }
  const m = { id: uid(), cid: r.c.id, from: S.uid, ts: Date.now(), kind: 'file', text: caption || '', file: { id: fid, name: file.name || 'file', type: file.type || 'application/octet-stream', size: file.size }, fc: me().feedColor || '', reacts: {} }
  if (S.reply) { m.reply = { id: S.reply.id, from: S.reply.from, text: S.reply.kind === 'file' ? 'Attachment: ' + S.reply.file.name : S.reply.text.slice(0, 120) }; S.reply = null }
  r.msgs.push(m); await msgPut(m); r.A.msg.send(m).catch(() => {}); render(); scrollEnd()
  if (!r.online.size) toast('Nobody else is online. They will receive it when you are both online.')
}
async function tryFetch (r, m, peerId, manual) {
  const f = m.file; if (blobs[f.id] || prog[f.id] !== undefined) return
  if (await fileGet(f.id)) return ensureBlob(f.id)
  const auto = f.size <= 30 * 1024 * 1024 || fileKind(f.type, f.name) === 'image'
  if (!auto && !manual) return
  const cands = []; const users = r.room.getUsers()
  const first = users[m.from]; if (first) cands.push(first.peerIds[0])
  if (peerId && !cands.includes(peerId)) cands.push(peerId)
  for (const [u, info] of Object.entries(users)) if (!isBlocked(u) && !cands.includes(info.peerIds[0])) cands.push(info.peerIds[0])
  if (!cands.length) return
  prog[f.id] = 0; render()
  for (const p of cands) {
    try {
      const res = await r.A.fget.request({ id: f.id }, { target: p, timeoutMs: 20 * 60 * 1000, onProgress: pr => { prog[f.id] = pr; updProg(f.id, pr) } })
      if (res) {
        const blob = res instanceof Blob ? res : new Blob([res], { type: f.type })
        await filePut(f.id, new Blob([blob], { type: f.type })); delete prog[f.id]; await ensureBlob(f.id); return
      }
    } catch { /* try next peer */ }
  }
  delete prog[f.id]; render()
}
function updProg (id, p) { $$(`[data-pg="${id}"]`).forEach(e => { e.style.width = (p * 100).toFixed(0) + '%' }) }
async function ensureBlob (id) {
  if (blobs[id] || loading.has(id)) return; loading.add(id)
  const b = await fileGet(id); loading.delete(id)
  if (!b) return
  blobs[id] = { url: URL.createObjectURL(b), type: b.type, size: b.size }
  if (b.type.startsWith('image/') && S.settings.shield !== 'off') runShield(id, b)
  if (S.view === 'feed') renderFeed(); else if (S.active) { renderChat(); renderPanel() }
}
async function runShield (id, blob) {
  if (shield[id]) return; shield[id] = 'pending'
  try { const { classify } = await import('./nsfw.js'); const res = await classify(blob); shield[id] = res.sensitive ? 'sensitive' : 'ok' } catch { shield[id] = 'ok' }
  if (S.view === 'feed') renderFeed(); else if (S.active) renderChat()
}

// prune disappearing messages
setInterval(() => {
  for (const r of Object.values(R)) {
    if (r.c.ttl) for (const m of r.msgs.filter(x => x.kind !== 'sys' && x.ts < Date.now() - r.c.ttl)) removeMsg(r, m.id)
    for (const [u, t] of Object.entries(r.typing)) if (t < Date.now()) delete r.typing[u]
  }
  if (S.active) renderTyping()
}, 15000)

// ===================================================================== rendering
function render () { if (S.view === 'chats' && !S.active) { S.mobileChat = false; S.panel = false } renderList(); renderMain(); renderPanel(); $('#app').className = (S.panel ? 'pan ' : '') + (S.mobileChat ? 'chatting ' : '') + (S.view === 'chats' && S.mobileChat ? 'inchat' : '')
  const mn = $('#mnav'); if (mn) { mn.innerHTML = `<button data-mn="chats" class="${S.view === 'chats' ? 'on' : ''}">${ic('chat', 22)}<span>Chats</span></button><button data-mn="feed" class="${S.view === 'feed' ? 'on' : ''}">${ic('news', 22)}<span>Feed</span>${S.feedNew ? `<i class="badge">${S.feedNew}</i>` : ''}</button>` } }
function onlineUsers () {
  const out = {}
  for (const r of Object.values(R)) for (const u of r.online) { if (u === S.uid || isBlocked(u)) continue; (out[u] = out[u] || { p: profOf(r, u), cids: [] }).cids.push(r.c.id) }
  return out
}
// native geolocation on iOS/Android shells (Capacitor); plain browser geolocation everywhere else
const capGeo = (() => { try { const c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() ? c.registerPlugin('Geolocation') : null } catch { return null } })()
const geo = {
  ok: !!(capGeo || navigator.geolocation),
  get (ok, err, o) { if (!capGeo) return navigator.geolocation.getCurrentPosition(ok, err, o); capGeo.getCurrentPosition({ enableHighAccuracy: o.enableHighAccuracy, timeout: o.timeout, maximumAge: o.maximumAge }).then(ok, e => err({ message: (e && e.message) || 'Location unavailable' })) },
  watch (ok, err, o) {
    if (!capGeo) return navigator.geolocation.watchPosition(ok, err, o)
    let id = null; let dead = false
    capGeo.watchPosition({ enableHighAccuracy: o.enableHighAccuracy, timeout: o.timeout, maximumAge: o.maximumAge }, (p, e) => { if (e) err(e); else if (p) ok(p) }).then(i => { if (dead) capGeo.clearWatch({ id: i }); else id = i })
    return { native: true, stop () { dead = true; if (id !== null) capGeo.clearWatch({ id }) } }
  },
  clear (w) { if (w && w.native) w.stop(); else if (w !== null && w !== undefined && navigator.geolocation) navigator.geolocation.clearWatch(w) }
}
// ---- optional offline relay (store-and-forward for people whose app is closed)
const relayUrl = () => (S.settings.relay || '').trim()
async function relayInit () {
  const base = relayUrl(); if (!base || !me()) return false
  try {
    if (!me().ib) { me().ib = randId(18); me().ipk = randId(24); await saveCfg(); for (const r of Object.values(R)) { try { r.profile.set(profilePayload()) } catch { /* ignore */ } } }
    if (S.relayOk !== base + me().ib + (S.pushToken || '')) { await relayRegister(base, me().ib, me().ipk, S.pushToken || ''); S.relayOk = base + me().ib + (S.pushToken || '') }
    return true
  } catch { return false }
}
async function relaySend (r, m) {
  const base = relayUrl(); if (!base || !me().ib) return
  const targets = Object.entries(r.users).filter(([u, p]) => u !== S.uid && p && p.ib && !isBlocked(u))
  if (!targets.length) return
  try {
    const blob = await seal(r.c, { t: 'msg', m })
    await Promise.all(targets.map(([, p]) => relayPut(base, p.ib, blob).catch(() => {})))
  } catch { /* relay is best effort */ }
}
const capPush = (() => { try { const c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() ? c.registerPlugin('PushNotifications') : null } catch { return null } })()
let pushOn = false
async function setupPush () {
  if (!capPush || pushOn || !relayUrl()) return
  try {
    const p = await capPush.requestPermissions(); if (p.receive !== 'granted') return
    pushOn = true
    capPush.addListener('registration', t => { S.pushToken = t.value; S.relayOk = ''; relayInit() })
    capPush.addListener('registrationError', () => { pushOn = false })
    capPush.addListener('pushNotificationReceived', () => relayPullAll())
    capPush.addListener('pushNotificationActionPerformed', () => relayPullAll())
    await capPush.register()
  } catch { pushOn = false }
}
let pulling = false
async function relayPullAll () {
  const base = relayUrl(); if (!base || !me() || !me().ib || pulling) return
  pulling = true
  try {
    if (!await relayInit()) return
    let ack = []
    for (let round = 0; round < 5; round++) {
      const { items } = await relayPull(base, me().ib, me().ipk, ack); ack = []
      if (!items || !items.length) break
      for (const it of items) {
        ack.push(it.k)
        const o = await relayOpen(S.circles, it.blob); if (!o) continue
        const r = R[o.c.id]; const m = o.m && o.m.m; if (!r || !m || o.m.t !== 'msg' || !validMsg(m) || isBlocked(m.from) || m.from === S.uid || !r.users[m.from]) continue
        await ingest(r, m, true)
      }
      if (items.length < 100) { await relayPull(base, me().ib, me().ipk, ack).catch(() => {}); break }
    }
  } catch { /* offline */ } finally { pulling = false }
}
setInterval(() => { if (!document.hidden) relayPullAll() }, 45000)
document.addEventListener('visibilitychange', () => { if (!document.hidden) relayPullAll() })
const msgPreview = m => m.kind === 'file' ? 'Sent a file: ' + m.file.name : m.kind === 'loc' ? '📍 Shared a location' : m.kind === 'post' ? 'Shared a post: ' + (m.text || 'new photo') : (m.text || '')
function lastActivity (c) { const r = R[c.id]; const l = r && r.msgs.filter(m => m.kind === 'text' || m.kind === 'file' || m.kind === 'loc').slice(-1)[0]; return l ? l.ts : (c.created || 0) }
function sortedCircles () {
  const q = (S.q || '').trim().toLowerCase()
  return S.circles.filter(c => !q || c.name.toLowerCase().includes(q)).slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || lastActivity(b) - lastActivity(a))
}
function rowTime (ts) { const d = new Date(ts); const n = new Date(); return d.toDateString() === n.toDateString() ? fmtTime(ts) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
function searchHits () {
  const q = (S.q || '').trim().toLowerCase(); if (q.length < 2) return ''
  const hits = []
  for (const r of Object.values(R)) for (const m of r.msgs) if ((m.kind === 'text' || m.kind === 'file') && m.text && m.text.toLowerCase().includes(q) && !isBlocked(m.from)) hits.push({ r, m })
  hits.sort((a, b) => b.m.ts - a.m.ts)
  if (!hits.length) return '<div class="empty sm">No messages found.</div>'
  return '<div class="lbl" style="margin:10px 12px 4px">Messages</div>' + hits.slice(0, 25).map(({ r, m }) => {
    const i = m.text.toLowerCase().indexOf(q); const a = Math.max(0, i - 20); const sn = m.text.slice(a, a + 70)
    return `<div class="crow srow" data-sm="${r.c.id}|${m.id}"><div class="t"><div class="n">${esc(r.c.name)} <span class="mute sm">· ${esc(profOf(r, m.from).name)}</span></div><div class="l">${esc(sn)}</div></div><span class="rt">${rowTime(m.ts)}</span></div>`
  }).join('')
}
function closeCtx () { const o = $('#ctx'); if (o) o.remove() }
function ctxMenu (x, y, items, emojis) {
  closeCtx()
  const el = document.createElement('div'); el.id = 'ctx'; el.className = 'ctx'
  el.innerHTML = (emojis ? `<div class="ctxe">${emojis.map(e => `<button data-ce="${e}">${e}</button>`).join('')}<button data-cplus title="More reactions">${ic('plus', 16)}</button></div>` : '') + items.map((it, i) => `<button class="${it.danger ? 'dng' : ''}" data-ci="${i}">${it.icon ? ic(it.icon, 16) : ''}<span>${it.label}</span></button>`).join('')
  document.body.appendChild(el)
  const w = el.offsetWidth; const h = el.offsetHeight
  el.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; el.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px'
  el.onclick = e => {
    if (e.target.closest('[data-cplus]') && emojis) { const bb = el.getBoundingClientRect(); closeCtx(); reactPicker(bb.left, bb.top, emojis.pick); return }
    const ce = e.target.closest('[data-ce]'); if (ce && emojis) { emojis.pick(ce.dataset.ce); closeCtx(); return }
    const b = e.target.closest('[data-ci]'); if (!b) return; const it = items[+b.dataset.ci]; closeCtx(); it.fn()
  }
}
function reactPicker (x, y, pick) {
  const old = $('#rpick'); if (old) old.remove()
  const w = document.createElement('div'); w.id = 'rpick'; w.className = 'rpick'
  const pk = document.createElement('emoji-picker'); pk.dataSource = './emoji/data.json'; w.appendChild(pk); document.body.appendChild(w)
  w.style.left = Math.max(8, Math.min(x, innerWidth - 360)) + 'px'; w.style.top = Math.max(8, Math.min(y, innerHeight - 440)) + 'px'
  pk.addEventListener('emoji-click', e => { pick(e.detail.unicode); w.remove() })
  setTimeout(() => document.addEventListener('pointerdown', function off (ev) { if (!w.contains(ev.target)) { w.remove(); document.removeEventListener('pointerdown', off) } }), 0)
}
function msgMenu (x, y, r, m) {
  const mine = m.from === S.uid; const items = []
  items.push({ label: 'Reply', icon: 'reply', fn: () => { S.reply = m; renderMain(); $('#msg') && $('#msg').focus() } })
  if (m.text && m.kind !== 'loc') items.push({ label: 'Copy text', icon: 'copy', fn: () => { navigator.clipboard.writeText(m.text); toast('Copied') } })
  if (m.file && blobs[m.file.id] && ['image', 'video'].includes(fileKind(m.file.type, m.file.name))) items.push({ label: 'Save to device', icon: 'down', fn: () => saveMedia(m.file.id) })
  if (mine && (m.kind === 'text' || m.kind === 'file')) items.push({ label: 'Edit', icon: 'edit', fn: () => startEdit(r, m) })
  if (mine) items.push({ label: 'Delete for everyone', icon: 'trash', danger: true, fn: () => { if (confirm('Delete this message for everyone?')) { removeMsg(r, m.id, S.uid); r.A.del.send({ id: m.id }).catch(() => {}) } } })
  else items.push({ label: 'Block this person', icon: 'ban', danger: true, fn: () => blockUser(m.from) })
  const em = ['👍', '❤️', '😂', '😮', '😢', '🙏']; em.pick = e => { const has = ((m.reacts || {})[e] || []).includes(S.uid); applyReact(r, m.id, e, S.uid, !has); r.A.react.send({ mid: m.id, e, on: !has }).catch(() => {}) }
  ctxMenu(x, y, items, em)
}
function rowMenu (x, y, id) {
  const c = S.circles.find(k => k.id === id); if (!c) return
  ctxMenu(x, y, [
    { label: c.pin ? 'Unpin from top' : 'Pin to top', icon: 'pin', fn: async () => { c.pin = !c.pin; await saveCfg(); renderList() } },
    { label: c.mute ? 'Unmute notifications' : 'Mute notifications', icon: c.mute ? 'bell' : 'bellOff', fn: async () => { c.mute = !c.mute; await saveCfg(); renderList() } },
    { label: c.dm ? 'Delete chat…' : 'Delete or leave…', icon: 'trash', danger: true, fn: () => deleteCircleDialog(id) }
  ])
}
function jumpTo (cid, mid) { S.hl = mid; S.q = ''; S.view = 'chats'; openCircle(cid); setTimeout(hlMsg, 80) }
function hlMsg () { if (!S.hl) return; const el = $('#m-' + S.hl); S.hl = null; if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 2200) } }
function sendSeen (r) {
  if (S.settings.receipts === false || S.active !== r.c.id || S.view !== 'chats' || document.hidden) return
  const last = r.msgs.filter(m => m.from && m.from !== S.uid && (m.kind === 'text' || m.kind === 'file' || m.kind === 'loc')).slice(-1)[0]
  if (last && last.ts > (r.seenSent || 0)) { r.seenSent = last.ts; r.A.seen.send({ ts: last.ts }).catch(() => {}) }
}
const tickHtml = (r, m) => { const n = Object.values(r.seenBy).filter(t => t >= m.ts).length; return `<span class="tick ${n ? 'seen' : ''}" title="${n ? 'Seen' + (r.c.dm ? '' : ' by ' + n) : 'Sent'}">${ic('check', 12)}${n ? ic('check', 12) : ''}</span>` }

function renderList () {
  { const n = Object.values(R).reduce((a, r) => a + (r.unread || 0), 0); document.title = (n ? '(' + n + ') ' : '') + 'Orbit Family & Friends' }
  const sqEl = document.activeElement && document.activeElement.id === 'sq' ? document.activeElement : null; const sqPos = sqEl ? sqEl.selectionStart : 0
  const rows = sortedCircles().map(c => {
    const r = R[c.id]; const last = r && r.msgs.filter(m => m.kind === 'text' || m.kind === 'file' || m.kind === 'loc').slice(-1)[0]
    const preview = last ? msgPreview(last) : 'No messages yet'
    const on = r ? r.online.size : 0
    const dp = c.dm && r ? dmPeer(r) : null
    const tm = last ? rowTime(last.ts) : ''
    return `<div class="crow ${S.active === c.id && S.view === 'chats' ? 'on' : ''} ${r && r.ping > Date.now() ? 'ping' : ''} ${r && r.unread ? 'unr' : ''}" data-c="${c.id}">${dp ? avatar(dp, '', !!on) : `<div class="av" style="background:${COLORS[(c.name.length * 3) % COLORS.length]}">${esc([...c.name][0] || '?')}${on ? '<span class="dot"></span>' : ''}</div>`}<div class="t"><div class="n">${c.pin ? ic('pin', 12) + ' ' : ''}${esc(c.name)}${c.mute ? ' ' + ic('bellOff', 12) : ''}</div><div class="l">${on ? `<span style="color:var(--good)">${on} online</span> · ` : ''}${esc(preview.slice(0, 50))}</div></div><div class="rcol"><span class="rt">${tm}</span>${r && r.unread ? `<span class="badge ${c.mute ? 'mutedb' : ''}">${r.unread}</span>` : ''}</div>${r && Object.keys(r.callUsers).length ? `<span class="calling" title="Call in progress">${ic('video', 16)}</span>` : ''}<button class="rowx" data-rm="${c.id}" title="More">${ic('more', 16)}</button></div>${vcHtml(r)}`
  }).join('')
  const sharing = Object.keys(myShares).length
  const ou = Object.entries(onlineUsers())
  $('#side').innerHTML = `<h1><span class="logo"></span><span class="brand">Orbit<small>Family &amp; Friends</small></span></h1>
    <div class="seg"><button class="${S.view === 'chats' ? 'on' : ''}" data-v="chats">${ic('chat', 17)}<span>Chats</span></button><button class="${S.view === 'feed' ? 'on' : ''}" data-v="feed">${ic('news', 17)}<span>Feed</span>${S.feedNew ? `<i class="badge">${S.feedNew}</i>` : ''}</button></div>
    <div class="onl"><div class="lbl" style="margin:0 0 6px">Online now${ou.length ? ' · ' + ou.length : ''}</div>${ou.length ? `<div class="onrow">${ou.map(([u, o]) => `<div class="on1" data-c="${o.cids[0]}" title="${esc(o.p.name)}">${avatar(o.p, 'sm', true)}<span>${esc(o.p.name.split(' ')[0])}</span></div>`).join('')}</div>` : '<div class="mute sm">Nobody is online right now.</div>'}</div>
    <div style="padding:6px 12px 8px;display:flex;gap:6px"><button class="btn pri" style="flex:1" data-a="new">${ic('plus', 16)} New</button><button class="btn" style="flex:1" data-a="find">${ic('search', 16)} Find</button><button class="btn" style="flex:1" data-a="join">${ic('userplus', 16)} Join</button></div>
    ${S.invites.length ? `<div class="invs">${S.invites.map((i, ix) => `<div class="inv1">${avatar({ name: i.name, emoji: i.emoji, color: i.color }, 'sm')}<div class="t"><b>${esc(i.name)}</b><span>${i.dm ? 'wants to chat with you' : 'invited you to ' + esc(i.circle)}</span></div><button class="btn sm pri" data-ia="${ix}" data-iv="yes">Accept</button><button class="btn sm" data-ia="${ix}" data-iv="no" title="Decline">${ic('x', 14)}</button></div>`).join('')}</div>` : ''}
    ${sharing ? `<div class="banner" style="margin:0 12px 8px;border-radius:10px"><span>${ic('pin', 16)} Sharing location</span><button class="btn sm dng" data-a="stopall">Stop all</button></div>` : ''}
    <div class="sbar">${ic('search', 16)}<input id="sq" placeholder="Search chats and messages  (Ctrl+K)" value="${esc(S.q || '')}" autocomplete="off"></div>
    <div class="clist">${rows}${searchHits()}${rows || S.q ? '' : '<div class="empty">No circles yet.<br>Create one for your family or friends, or join with an invite.</div>'}</div>
    <div class="me">${avatar(me(), 'sm')}<div class="t">${esc(me().name)}<div class="mute sm" style="font-weight:400">${esc(me().status || 'Available')}</div></div><button class="ib" data-a="settings" title="Settings">${ic('sliders', 20)}</button></div>`
  if (sqEl) { const i = $('#sq'); if (i) { i.focus(); i.setSelectionRange(sqPos, sqPos) } }
}

let mainSig = ''
function renderMain () {
  if (S.view === 'feed') { mainSig = 'feed'; renderFeed(); return }
  const r = cur(); const main = $('#main')
  const sig = r ? [S.active, r.c.name, r.c.ttl, Object.keys(r.users).length, r.online.size, S.settings.profanity, !!myShares[r.c.id], !!S.panel, S.reply && S.reply.id, S.editing && S.editing.id, Object.keys(r.callUsers).join(), !!(r.call && r.call.on), S.settings.theme].join('|') : 'none'
  if (sig === mainSig && $('#chat')) { renderChat(); return }
  mainSig = sig
  const oldTa = $('#msg'); if (oldTa && S.draftCid) S.drafts[S.draftCid] = oldTa.value
  const hadFocus = !!oldTa && document.activeElement === oldTa
  S.draftCid = S.active
  if (!r) { main.innerHTML = `<div class="empty"><span class="logo xl"></span><h2>Welcome to Orbit Family &amp; Friends</h2><p>Private chat, files, video calls and live location, sent directly between devices. Pick a circle or start a new one.</p></div>`; return }
  const c = r.c; const online = r.online.size; const inCall = !!(r.call && r.call.on); const others = Object.keys(r.callUsers)
  const members = new Set([...Object.keys(r.users)]); if (S.uid) members.add(S.uid)
  main.innerHTML = `
    <div class="head"><button class="ib back" data-a="back" title="Back">${ic('back', 22)}</button>${avatar({ emoji: [...c.name][0], color: COLORS[(c.name.length * 3) % COLORS.length] }, 'sm')}
      <div class="t"><div class="n">${esc(c.name)}</div><div class="s">${members.size} member${members.size === 1 ? '' : 's'} · ${online} online${c.ttl ? ' · messages vanish after ' + ttlLabel(c.ttl) : ''}</div></div>
      <div class="stack">${[...r.online].filter(u => !isBlocked(u)).slice(0, 4).map(u => avatar(profOf(r, u), 'sm', true)).join('')}</div>
      <button class="hb ${S.settings.profanity ? 'on' : ''}" data-a="prof" title="${S.settings.profanity ? 'Swearing is hidden. Click to show it.' : 'Swearing is shown. Click to hide it.'}">${ic(S.settings.profanity ? 'eyeoff' : 'eye', 18)}<span>${S.settings.profanity ? 'Swearing hidden' : 'Swearing shown'}</span></button>
      <button class="hb" data-a="call" title="Start or join a video call">${ic('video', 18)}<span>Call</span></button>
      <button class="hb ${myShares[c.id] ? 'on' : ''}" data-a="loc" title="Share my live location (timed)">${ic('pin', 18)}<span>Location</span></button>
      <button class="hb" data-a="invite" title="Invite people to this circle">${ic('userplus', 18)}<span>Invite</span></button>
      <button class="hb ${S.panel ? 'on' : ''}" data-a="panel" title="People, media, map and circle settings">${ic('panel', 18)}<span>Details</span></button></div>
    ${others.length && !inCall ? `<div class="banner"><span>${ic('video', 16)} ${others.map(u => esc(profOf(r, u).name)).join(', ')} ${others.length > 1 ? 'are' : 'is'} in a call</span><button class="btn sm pri" data-a="call">${ic('video', 15)} Join</button><button class="btn sm" data-a="callv">${ic('mic', 15)} Voice only</button></div>` : ''}
    <div class="chatwrap"><div class="chatbg" id="bg"></div><div class="chat" id="chat"></div></div>
    <div class="typing" id="typing"></div>
    ${S.editing ? `<div class="replying edit">${ic('edit', 18)}<div class="rq"><b>Editing message</b><span>${esc((S.editing.text || '').slice(0, 90))}</span></div><button class="ib" data-a="noedit" title="Cancel (Esc)">${ic('x', 18)}</button></div>` : S.reply ? `<div class="replying">${ic('reply', 18)}<div class="rq"><b>Replying to ${esc(S.reply.from === S.uid ? 'yourself' : profOf(r, S.reply.from).name)}</b><span>${esc(S.reply.kind === 'file' ? 'Attachment: ' + S.reply.file.name : S.reply.text.slice(0, 90))}</span></div><button class="ib" data-a="noreply" title="Cancel reply">${ic('x', 16)}</button></div>` : ''}
    <div class="composer" id="composer">
      <button class="ib" data-a="emoji" title="Emoji">${ic('smile', 22)}</button><button class="ib" data-a="gif" title="GIFs">${ic('gif', 24)}</button>
      <button class="ib" data-a="attach" title="Send photos or files">${ic('clip', 21)}</button><button class="ib" data-a="studio" title="Camera: take photos or short videos with filters">${ic('camera', 22)}</button>
      <button class="ib" data-a="voice" id="voiceBtn" title="Record a voice message">${ic('mic', 22)}</button>
      <textarea id="msg" rows="1" placeholder="Message ${esc(c.name)}"></textarea>
      <button class="btn pri sendb" data-a="send" title="Send">${ic('send', 18)}</button><input type="file" id="fileIn" multiple hidden></div>`
  applyBg(); renderChat(); renderTyping()
  const ta = $('#msg')
  ta.value = S.drafts[S.active] || ''; if (hadFocus) ta.focus()
  let lastT = 0
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; if (Date.now() - lastT > 2500) { lastT = Date.now(); r.A.typing.send({}).catch(() => {}) } }
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComposer(ta) } }
  ta.onpaste = e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); f.forEach(x => sendFile(x)) } }
  $('#fileIn').onchange = e => { [...e.target.files].forEach(f => sendFile(f)); e.target.value = '' }
  main.ondragover = e => e.preventDefault()
  main.ondrop = e => { e.preventDefault(); [...e.dataTransfer.files].forEach(f => sendFile(f)) }
}
const ttlLabel = ms => ms >= 864e5 ? Math.round(ms / 864e5) + ' day(s)' : Math.round(ms / 36e5) + ' hour(s)'

function applyBg () {
  const r = cur(); const el = $('#bg'); if (!r || !el) return
  const bg = r.c.bg || {}; el.style.setProperty('--bgblur', (bg.blur || 0) + 'px'); el.style.setProperty('--bgdim', bg.dim ?? .25)
  if (bg.id === 'custom') { fileGet('bg:' + r.c.id).then(b => { if (b) el.style.backgroundImage = `url(${URL.createObjectURL(b)})` }) } else { const p = BGS.find(x => x[0] === bg.id); el.style.background = p ? p[2] : ''; el.style.backgroundImage = '' ; if (p) el.style.background = p[2] }
}

function maskProf (text, id) {
  if (!S.settings.profanity || S.revealProf.has(id) || !profanity.check(text)) return null
  return profanity.clean(text, '▮')
}
function msgHtml (r, m, prev) {
  if (m.kind === 'sys') return `<div class="sys">${esc(m.text)}</div>`
  const mine = m.from === S.uid; const p = mine ? me() : profOf(r, m.from)
  let body = ''
  if (m.reply) body += `<div class="reply"><b>${esc(profOf(r, m.reply.from).name)}</b><br>${esc(m.reply.text)}</div>`
  if (m.kind === 'file') body += fileHtml(r, m, mine)
  if (m.kind === 'loc') body += locHtml(r, m, mine)
  if (m.text) {
    const masked = maskProf(m.text, m.id)
    if (masked !== null) body += `<div class="prof" data-rev="${m.id}" title="Click to reveal">${linkify(esc(masked))} <small>(hidden)</small></div>`
    else if (isEmojiOnly(m.text) && m.kind === 'text') body += `<div class="big">${esc(m.text)}</div>`
    else body += `<div>${linkify(esc(m.text))}</div>`
  }
  const reacts = Object.entries(m.reacts || {}).map(([e, u]) => `<span class="${u.includes(S.uid) ? 'mine' : ''}" data-rx="${esc(e)}" data-m="${m.id}">${esc(e)} ${u.length}</span>`).join('')
  const tools = `<div class="act"><button data-act="reply" data-m="${m.id}" title="Reply">${ic('reply', 14)}</button>${mine && (m.kind === 'text' || m.kind === 'file') ? `<button data-act="edit" data-m="${m.id}" title="Edit">${ic('edit', 14)}</button>` : ''}${m.file && blobs[m.file.id] && ['image', 'video'].includes(fileKind(m.file.type, m.file.name)) ? `<button data-act="save" data-m="${m.id}" title="Save to device">${ic('down', 14)}</button>` : ''}${['👍', '❤️', '😂', '😮', '🙏'].map(e => `<button data-act="react" data-e="${e}" data-m="${m.id}">${e}</button>`).join('')}${mine ? `<button data-act="del" data-m="${m.id}" title="Delete for everyone">${ic('trash', 14)}</button>` : `<button data-act="block" data-u="${m.from}" title="Block this person">${ic('ban', 14)}</button>`}</div>`
  const grouped = prev && prev.from === m.from && m.ts - prev.ts < 120000 && prev.kind !== 'sys'
  return `<div class="m ${mine ? 'me' : ''}" id="m-${m.id}">${mine || grouped ? '' : avatar(p, 'sm')}${!mine && grouped ? '<div style="width:30px;flex:none"></div>' : ''}<div class="bub"${bubStyle(mine ? me().feedColor : m.fc)}>${!mine && !grouped ? `<div class="who">${esc(p.name)}</div>` : ''}${body}${reacts ? `<div class="react">${reacts}</div>` : ''}<div class="time">${m.edited ? 'edited · ' : ''}${fmtTime(m.ts)}${mine && S.settings.receipts !== false ? ' ' + tickHtml(r, m) : ''}</div></div><button class="mbtn" data-mm="${m.id}" title="React, reply, more">${ic('smile', 17)}</button></div>`
}
function locLive (r, m) { if (m.from === S.uid) { const sh = myShares[r.c.id]; return !!(sh && sh.until > Date.now() && sh.pos) } const l = r.locs[m.from]; return !!(l && l.until > Date.now() && m.until > Date.now()) }
function locNow (r, m) { if (locLive(r, m)) { if (m.from === S.uid) { const sh = myShares[r.c.id]; return [sh.pos.latitude, sh.pos.longitude] } const l = r.locs[m.from]; return [l.lat, l.lng] } return [m.lat, m.lng] }
function locHtml (r, m) {
  const live = locLive(r, m); const [la, ln] = locNow(r, m)
  return `<div class="locc"><div class="minimap" data-mid="${m.id}"></div><div class="locx"><b>${ic('pin', 15)} ${live ? 'Live location' : 'Location shared'}</b><span>${live ? 'sharing until ' + fmtTime(m.until) + (m.from === S.uid && myShares[r.c.id] && myShares[r.c.id].pos && myShares[r.c.id].pos.accuracy ? ' · accurate to ~' + (myShares[r.c.id].pos.accuracy >= 1000 ? (myShares[r.c.id].pos.accuracy / 1000).toFixed(1) + ' km' : Math.round(myShares[r.c.id].pos.accuracy) + ' m') : '') : 'sharing ended'}</span></div><div class="locb"><button class="btn sm" data-a="openmap">${ic('map', 15)} Open full map</button>${live && m.from === S.uid ? `<button class="btn sm" data-a="fixloc">Wrong spot?</button>` : ''}<a class="btn sm" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${la}&mlon=${ln}#map=16/${la}/${ln}" style="text-decoration:none">OpenStreetMap</a></div></div>`
}
const minis = {}
function initMiniMaps (r) {
  for (const k of Object.keys(minis)) { try { minis[k].map.remove() } catch { /* ignore */ } delete minis[k] }
  for (const el of document.querySelectorAll('#chat .minimap')) {
    const m = r.msgs.find(x => x.id === el.dataset.mid); if (!m) continue
    const [la, ln] = locNow(r, m); const p = m.from === S.uid ? me() : profOf(r, m.from)
    try {
      const map = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, keyboard: false, boxZoom: false }).setView([la, ln], 15)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      const marker = L.marker([la, ln], { icon: L.divIcon({ className: '', html: `<div class="pin" style="background:${p.color}">${esc(p.emoji)}</div>`, iconSize: [34, 34] }) }).addTo(map)
      minis[m.id] = { map, marker, m }
    } catch { /* ignore */ }
  }
}
function updateMiniMaps (r) { for (const x of Object.values(minis)) { if (x.m.cid !== r.c.id) continue; const [la, ln] = locNow(r, x.m); x.marker.setLatLng([la, ln]); x.map.setView([la, ln]) } }
function fileHtml (r, m, mine) {
  const f = m.file; const k = fileKind(f.type, f.name); const b = blobs[f.id]
  if (!b) {
    ensureBlob(f.id)
    if (prog[f.id] !== undefined) return `<div class="filebox"><span class="ic">${fileIcon(k)}</span><div><div class="nm">${esc(f.name)}</div><div class="sm">${fmtB(f.size)} · receiving…</div><div class="pbar"><i data-pg="${f.id}" style="width:${(prog[f.id] * 100).toFixed(0)}%"></i></div></div></div>`
    return `<div class="filebox"><span class="ic">${fileIcon(k)}</span><div><div class="nm">${esc(f.name)}</div><div class="sm">${fmtB(f.size)}</div>${mine ? '' : `<button class="btn sm" data-dl="${m.id}">Download</button>`}</div></div>`
  }
  const warn = isExecutable(f.name) ? `<div class="sm" style="color:var(--warn)">Program file. Only open it if you trust the sender.</div>` : ''
  if (k === 'image') {
    const st = mine ? 'ok' : (S.settings.shield === 'off' ? 'ok' : shield[f.id] || 'pending')
    if (st === 'ok' || S.revealImg.has(f.id)) return `<img class="pic" src="${b.url}" data-lb="${f.id}" alt="${esc(f.name)}">`
    if (st === 'pending') return `<div class="shield"><img class="pic" src="${b.url}" style="filter:blur(30px)"><div class="ov">Checking image…</div></div>`
    if (S.settings.shield === 'block') return `<div class="filebox"><span class="ic">${ic('ban', 28)}</span><div><div class="nm">Sensitive image hidden</div><div class="sm">Your safety setting blocks adult content.</div></div></div>`
    return `<div class="shield"><img class="pic" src="${b.url}"><div class="ov" data-rvimg="${f.id}"><b>Sensitive content</b><span>May contain nudity. Tap to view.</span></div></div>`
  }
  if (k === 'video') return `<video class="vid" src="${b.url}" controls playsinline preload="metadata"></video>`
  if (k === 'audio') return `<audio src="${b.url}" controls preload="metadata"></audio>`
  return `<div class="filebox"><span class="ic">${fileIcon(k)}</span><div><div class="nm">${esc(f.name)}</div><div class="sm">${fmtB(f.size)}</div><a class="btn sm" href="${b.url}" download="${esc(f.name)}" style="text-decoration:none;display:inline-block;margin-top:4px">Save</a>${k === 'text' ? ` <button class="btn sm" data-txt="${f.id}">Preview</button>` : ''}</div></div>${warn}`
}
function renderChat () {
  const r = cur(); const el = $('#chat'); if (!r || !el) return
  const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  const list = r.msgs.filter(m => (m.kind === 'sys' || m.kind === 'text' || m.kind === 'file' || m.kind === 'loc') && !isBlocked(m.from)).slice(-400)
  let html = ''; let prev = null; let day = ''
  for (const m of list) { const d = fmtDay(m.ts); if (d !== day) { day = d; html += `<div class="sys">${d}</div>` } html += msgHtml(r, m, prev); prev = m }
  if (!list.length) html = '<div class="empty">No messages yet. Say hello!</div>'
  const top = el.scrollTop; el.innerHTML = html; el.scrollTop = atEnd ? el.scrollHeight : top
  let j = $('#jump'); if (!j) { j = document.createElement('button'); j.id = 'jump'; j.className = 'jump'; j.title = 'Jump to latest'; j.innerHTML = ic('down', 20); el.parentElement.appendChild(j); j.onclick = () => { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) } }
  el.onscroll = () => { j.classList.toggle('on', el.scrollHeight - el.scrollTop - el.clientHeight > 300) }; el.onscroll()
  initMiniMaps(r); sendSeen(r)
}
function renderTyping () {
  const r = cur(); const el = $('#typing'); if (!r || !el) return
  const who = Object.entries(r.typing).filter(([u, t]) => t > Date.now() && !isBlocked(u)).map(([u]) => profOf(r, u).name)
  el.textContent = who.length ? who.join(', ') + (who.length > 1 ? ' are typing…' : ' is typing…') : ''
}
const scrollNow = () => { const el = $('#chat'); if (el) el.scrollTop = el.scrollHeight }
const scrollEnd = () => { requestAnimationFrame(scrollNow); setTimeout(scrollNow, 120); setTimeout(scrollNow, 350) }
// iPhone keyboard: size the app to the visible area, undo the page shift iOS applies, and keep the newest message in view
if (window.visualViewport) {
  let lastH = 0
  const fit = () => {
    const vv = window.visualViewport; document.documentElement.style.setProperty('--vvh', vv.height + 'px')
    if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0)
    const shrank = vv.height < lastH - 80; lastH = vv.height
    const ta = document.activeElement
    if (shrank || (ta && ta.id === 'msg')) scrollEnd()
  }
  window.visualViewport.addEventListener('resize', fit); window.visualViewport.addEventListener('scroll', fit)
  document.addEventListener('focusin', e => { if (e.target.id === 'msg') { setTimeout(fit, 80); setTimeout(fit, 350) } })
  document.addEventListener('focusout', () => setTimeout(() => { window.scrollTo(0, 0); fit() }, 60))
}

// ===================================================================== feed
let feedSig = ''
S.cdraft = {}
function feedItems () {
  const map = new Map()
  for (const r of Object.values(R)) for (const m of r.msgs) {
    if (m.kind !== 'post' || isBlocked(m.from)) continue
    const k = m.from + ':' + (m.pid || m.id); let it = map.get(k)
    if (!it) { it = { key: k, pid: m.pid || m.id, from: m.from, ts: m.ts, text: m.text, file: m.file, copies: [], comments: new Map() }; map.set(k, it) }
    it.copies.push({ r, m }); if (!it.file && m.file) it.file = m.file
  }
  for (const r of Object.values(R)) for (const m of r.msgs) {
    if (m.kind !== 'comment' || isBlocked(m.from)) continue
    for (const it of map.values()) if (it.pid === m.pid) it.comments.set(m.gid || m.id, m)
  }
  let list = [...map.values()]
  if (S.feedFilter !== 'all') list = list.filter(it => it.copies.some(c => c.r.c.id === S.feedFilter))
  return list.sort((a, b) => b.ts - a.ts)
}
const likesOf = it => { const u = new Set(); it.copies.forEach(({ m }) => (m.reacts && m.reacts['❤️'] || []).forEach(x => u.add(x))); return u }
const timeAgo = ts => { const d = (Date.now() - ts) / 1000; return d < 60 ? 'just now' : d < 3600 ? Math.floor(d / 60) + 'm' : d < 86400 ? Math.floor(d / 3600) + 'h' : new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }) }

const FEEDCOLS = ['', '#5b8cff', '#a56bff', '#ff6b9a', '#ff8a4c', '#f5c542', '#3ddc97', '#2fd0d0', '#9aa4b5']
const fcStyle = c => c && /^#[0-9a-f]{6}$/i.test(c) ? ` style="border-color:${c};background:linear-gradient(135deg,color-mix(in srgb,${c} 18%,var(--panel)),var(--panel) 70%);--fc:${c}"` : ''
const bubStyle = c => { if (!c || !/^#[0-9a-f]{6}$/i.test(c)) return ''; const n = parseInt(c.slice(1), 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)); return ` style="background:${c};color:${l > 150 ? '#111' : '#fff'}"` }
function postCard (it) {
  const mine = it.from === S.uid; const r0 = it.copies[0].r
  const p = mine ? me() : profOf(r0, it.from)
  const likes = likesOf(it); const liked = likes.has(S.uid)
  const comments = [...it.comments.values()].sort((a, b) => a.ts - b.ts)
  const open = S.feedOpen.has(it.pid); const shown = open ? comments : comments.slice(-2)
  const names = [...new Set(it.copies.map(c => c.r.c.name))]
  const media = it.file ? fileHtml(it.copies[0].r, { ...it.copies[0].m, file: it.file }, mine).replace('class="pic"', 'class="pic feedpic"') : ''
  const fc = mine ? me().feedColor : it.copies[0].m.fc
  return `<article class="post"${fcStyle(fc)} data-pid="${it.pid}"><div class="ph">${avatar(p, '', r0.online.has(it.from) || mine)}<div class="t"><div class="n">${esc(p.name)}</div><div class="mute sm">${timeAgo(it.ts)} · ${names.map(esc).join(', ')}</div></div>${mine ? `<button class="ib" data-delpost="${it.pid}" title="Delete this post">${ic('trash', 17)}</button>` : ''}</div>
    ${it.text ? `<div class="pt">${(() => { const mk = maskProf(it.text, 'p' + it.pid); return mk !== null ? `<span class="prof" data-rev="p${it.pid}">${linkify(esc(mk))}</span>` : linkify(esc(it.text)) })()}</div>` : ''}
    ${media ? `<div class="pm">${media}</div>` : ''}
    <div class="pbar2"><button class="act2 ${liked ? 'liked' : ''}" data-like="${it.pid}" title="Like">${ic('heart', 18, liked ? 'fill="currentColor"' : '')}<span>${likes.size || ''}</span></button><button class="act2" data-cmt="${it.pid}" title="Comments">${ic('chat', 18)}<span>${comments.length || ''}</span></button>${it.file && blobs[it.file.id] && ['image', 'video'].includes(fileKind(it.file.type, it.file.name)) ? `<button class="act2" data-sv="${it.file.id}" title="Save to device">${ic('down', 18)}</button>` : ''}</div>
    ${comments.length > 2 && !open ? `<button class="lnk" data-cmt="${it.pid}">View all ${comments.length} comments</button>` : ''}
    ${shown.map(c => { const cp = c.from === S.uid ? me() : profOf(r0, c.from); const cm = maskProf(c.text, 'c' + c.id); return `<div class="cm2">${avatar(cp, 'xs')}<div><b>${esc(cp.name)}</b> ${cm !== null ? `<span class="prof" data-rev="c${c.id}">${esc(cm)}</span>` : linkify(esc(c.text))}</div></div>` }).join('')}
    <div class="cin"><input data-cin="${it.pid}" placeholder="Write a comment…" maxlength="500" value="${esc(S.cdraft[it.pid] || '')}"><button class="ib" data-cs="${it.pid}" title="Post comment">${ic('send', 18)}</button></div></article>`
}

function renderFeed () {
  const main = $('#main'); if (!main) return
  const items = feedItems()
  const d = S.postDraft
  const sig = JSON.stringify([S.feedFilter, S.circles.map(c => c.id + c.name), items.map(it => [it.key, likesOf(it).size, it.comments.size, !!(it.file && blobs[it.file.id]), it.file && shield[it.file.id], S.revealImg.size, S.feedOpen.has(it.pid), it.copies.length]), d.file && d.file.name, [...(d.cids || [])], S.settings.profanity, Object.keys(prog).length, S.view])
  const had = $('#ptext'); if (had) d.text = had.value
  if (sig === feedSig && had) return
  feedSig = sig
  const active = document.activeElement; const focusKey = active && (active.id || active.dataset.cin) ? (active.id ? '#' + active.id : `[data-cin="${active.dataset.cin}"]`) : null
  const aud = d.cids || new Set(S.circles.map(c => c.id))
  main.innerHTML = `<div class="head"><button class="ib back" data-a="back" title="Back">${ic('back', 22)}</button><div class="t"><div class="n">${ic('news', 18)} Feed</div><div class="s">Photos and thoughts from your circles. Only you can see who you are connected to.</div></div></div>
    <div class="feed"><div class="feedin">
      <div class="postbox"${fcStyle(me().feedColor)}><div style="display:flex;gap:10px">${avatar(me(), '')}<textarea id="ptext" rows="2" placeholder="Share a photo or a thought with your circles…" maxlength="3000">${esc(d.text || '')}</textarea></div>
        ${d.file ? `<div class="pfile">${d.file.type.startsWith('image/') ? `<img src="${URL.createObjectURL(d.file)}">` : `<span>${esc(d.file.name)}</span>`}<button class="ib" data-pa="rmfile" title="Remove attachment">${ic('x', 16)}</button></div>` : ''}
        <div class="lbl" style="margin:10px 0 4px">Share with</div><div class="chips">${S.circles.map(c => `<span class="chip ${aud.has(c.id) ? 'on' : ''}" data-aud="${c.id}">${esc(c.name)}</span>`).join('') || '<span class="mute sm">Create or join a circle first.</span>'}</div>
        <div class="prow"><button class="btn" data-pa="photo">${ic('image', 17)} Photo / video</button><button class="btn" data-pa="cam">${ic('camera', 17)} Camera</button><span style="flex:1"></span><button class="btn pri" data-pa="post">${ic('send', 16)} Post</button><input type="file" id="pfile" accept="image/*,video/*" hidden></div>
        <div class="mute sm" style="margin-top:8px">Only people in the circles you pick can see a post. Nobody can see who else is in your circles.</div></div>
      <div class="chips" style="margin:14px 0"><span class="chip ${S.feedFilter === 'all' ? 'on' : ''}" data-ff="all">Everyone</span>${S.circles.map(c => `<span class="chip ${S.feedFilter === c.id ? 'on' : ''}" data-ff="${c.id}">${esc(c.name)}</span>`).join('')}</div>
      ${items.length ? items.map(postCard).join('') : `<div class="empty">${ic('news', 40)}<h3>Nothing here yet</h3><p>Posts from your family and friends show up here. Share something to get it started.</p></div>`}
    </div></div>`
  const t = $('#ptext'); t.oninput = () => { d.text = t.value }
  $('#pfile').onchange = e => { const f = e.target.files[0]; if (f) { d.file = f; feedSig = ''; renderFeed() } }
  $$('[data-cin]').forEach(i => { i.oninput = () => { S.cdraft[i.dataset.cin] = i.value }; i.onkeydown = e => { if (e.key === 'Enter') sendComment(i.dataset.cin) } })
  if (focusKey) { const el = $(focusKey); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* ignore */ } } }
}

async function sendPost () {
  const d = S.postDraft; const ta = $('#ptext'); if (ta) d.text = ta.value
  const text = (d.text || '').trim()
  if (!text && !d.file) return toast('Write something or add a photo first.', true)
  const cids = [...(d.cids || new Set(S.circles.map(c => c.id)))].filter(id => R[id])
  if (!cids.length) return toast('Pick at least one circle to share with.', true)
  if (!S.uid) return toast('Still connecting. Try again in a moment.', true)
  let file
  if (d.file) {
    const fid = uid(); await filePut(fid, d.file); blobs[fid] = { url: URL.createObjectURL(d.file), type: d.file.type, size: d.file.size }
    file = { id: fid, name: d.file.name || 'photo', type: d.file.type || 'application/octet-stream', size: d.file.size }
  }
  const pid = uid(); const ts = Date.now()
  for (const cid of cids) {
    const r = R[cid]; const m = { id: uid(), cid, pid, from: S.uid, ts, kind: 'post', text, file, fc: me().feedColor || '', reacts: {} }
    r.msgs.push(m); await msgPut(m); r.A.msg.send(m).catch(() => {})
  }
  S.postDraft = { text: '', file: null, cids: d.cids }; feedSig = ''; renderFeed(); toast('Posted')
}
async function sendComment (pid) {
  const text = (S.cdraft[pid] || '').trim(); if (!text || !S.uid) return
  const it = feedItems().find(x => x.pid === pid); if (!it) return
  const gid = uid(); const ts = Date.now()
  for (const cid of new Set(it.copies.map(c => c.r.c.id))) {
    const r = R[cid]; const m = { id: uid(), gid, cid, pid, from: S.uid, ts, kind: 'comment', text }
    r.msgs.push(m); await msgPut(m); r.A.msg.send(m).catch(() => {})
  }
  S.cdraft[pid] = ''; S.feedOpen.add(pid); feedSig = ''; renderFeed()
}
function toggleLike (pid) {
  const it = feedItems().find(x => x.pid === pid); if (!it) return
  const on = !likesOf(it).has(S.uid)
  for (const { r, m } of it.copies) { applyReact(r, m.id, '❤️', S.uid, on); r.A.react.send({ mid: m.id, e: '❤️', on }).catch(() => {}) }
}
function deletePost (pid) {
  const it = feedItems().find(x => x.pid === pid); if (!it || it.from !== S.uid) return
  if (!confirm('Delete this post for everyone?')) return
  for (const { r, m } of it.copies) { removeMsg(r, m.id, S.uid); r.A.del.send({ id: m.id }).catch(() => {}) }
  feedSig = ''; renderFeed()
}

// ---------- right panel
function renderPanel () {
  const pn = $('#panel'); const r = cur()
  if (!S.panel || !r) { pn.innerHTML = ''; return }
  const tabs = [['members', ic('users', 16) + ' People'], ['media', ic('image', 16) + ' Media'], ['map', ic('map', 16) + ' Map'], ['circle', ic('sliders', 16) + ' Circle']]
  pn.innerHTML = `<div class="phead"><button class="ib" data-a="panel" title="Back to chat">${ic('back', 22)}</button><div class="t">${esc(r.c.name)} <small class="mute">Details</small></div><button class="ib" data-a="panel" title="Close">${ic('x', 20)}</button></div><div class="tabs">${tabs.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div class="pbody" id="pbody"></div>`
  const body = $('#pbody')
  if (S.tab === 'members') body.innerHTML = membersHtml(r)
  if (S.tab === 'media') body.innerHTML = mediaHtml(r)
  if (S.tab === 'map') mapPanel(r, body)
  if (S.tab === 'circle') body.innerHTML = circleHtml(r)
}
function payButtons (p) {
  const pay = p.pay || {}; const out = []
  if (pay.cashapp) out.push(`<button class="btn sm" data-pay="cashapp" data-v="${esc(pay.cashapp)}">Cash App</button>`)
  if (pay.venmo) out.push(`<button class="btn sm" data-pay="venmo" data-v="${esc(pay.venmo)}">Venmo</button>`)
  if (pay.paypal) out.push(`<button class="btn sm" data-pay="paypal" data-v="${esc(pay.paypal)}">PayPal</button>`)
  if (pay.zelle) out.push(`<button class="btn sm" data-pay="zelle" data-v="${esc(pay.zelle)}">Zelle</button>`)
  return out.length ? `<div class="chips" style="margin-top:4px">${out.join('')}</div>` : ''
}
function membersHtml (r) {
  const ids = new Set(Object.keys(r.users)); if (S.uid) ids.add(S.uid)
  const rows = [...ids].map(u => {
    const mine = u === S.uid; const p = mine ? me() : profOf(r, u); const on = mine || r.online.has(u)
    const admin = r.c.isAdmin && !mine
    return `<div class="mrow">${avatar(p, '', on)}<div class="t"><div class="n">${esc(p.name)} ${mine ? '<span class="tag">you</span>' : ''}</div><div class="mute sm">${on ? 'Online' : 'Offline'}${p.status ? ' · ' + esc(p.status) : ''}</div>${mine ? '' : payButtons(p)}</div>
      ${mine ? '' : `${on ? `<button class="btn sm pri" data-mem="dm" data-u="${u}">Message</button>` : ''}<button class="btn sm" data-mem="block" data-u="${u}">Block</button>${admin ? `<button class="btn sm dng" data-mem="ban" data-u="${u}">Remove</button>` : ''}`}</div>`
  }).join('')
  const blocked = Object.entries(S.blocked).map(([u, b]) => `<div class="mrow"><div class="t mute">${esc(b.name || u.slice(0, 8))}</div><button class="btn sm" data-mem="unblock" data-u="${u}">Unblock</button></div>`).join('')
  return rows + (blocked ? `<h4 class="mute">Blocked</h4>${blocked}` : '') + `<div class="note mute sm" style="margin-top:12px">Remove (admin) kicks someone out of this circle for everyone. Block hides someone only for you, in every circle.</div>`
}
function mediaHtml (r) {
  const items = r.msgs.filter(m => m.file && m.kind !== 'comment' && !isBlocked(m.from) && ['image', 'video'].includes(fileKind(m.file.type, m.file.name)))
  if (!items.length) return '<div class="empty">Photos and videos shared in this circle appear here in full quality.</div>'
  return `<div class="mediagrid">${items.slice().reverse().map(m => { const b = blobs[m.file.id]; const k = fileKind(m.file.type, m.file.name); const hide = !b || (k === 'image' && m.from !== S.uid && S.settings.shield !== 'off' && shield[m.file.id] !== 'ok'); return `<div ${!hide && b ? `data-lb="${m.file.id}" style="background-image:url(${k === 'image' ? b.url : ''})"` : ''}>${hide ? ic('image', 26) : k === 'video' ? ic('play', 26) : ''}</div>` }).join('')}</div>`
}
function circleHtml (r) {
  const c = r.c
  const bgs = BGS.map(([id, n, css]) => `<div class="${(c.bg && c.bg.id) === id ? 'on' : ''}" data-bg="${id}" style="background:${css || 'var(--bg2)'}" title="${n}"></div>`).join('')
  return `<div class="sec"><h3>Chat background</h3><div class="bgs">${bgs}<div data-bg="upload" title="Upload your own" style="display:flex;align-items:center;justify-content:center">${ic('plus', 22)}</div></div>
    <label class="lbl">Dim</label><input type="range" id="bgDim" min="0" max="80" value="${Math.round(((c.bg && c.bg.dim) ?? .25) * 100)}"><label class="lbl">Blur</label><input type="range" id="bgBlur" min="0" max="20" value="${(c.bg && c.bg.blur) || 0}"><input type="file" id="bgFile" accept="image/*" hidden><div class="mute sm">Backgrounds are only on your device.</div></div>
    <div class="sec"><h3>${c.isAdmin ? 'Circle settings (admin)' : 'Circle'}</h3>
    ${c.isAdmin ? `<label class="lbl">Name</label><input id="cName" value="${esc(c.name)}"><label class="lbl">Disappearing messages</label><div class="chips">${[[0, 'Off'], [36e5, '1 hour'], [864e5, '1 day'], [6048e5, '7 days'], [2592e6, '30 days']].map(([v, l]) => `<span class="chip ${(c.ttl || 0) === v ? 'on' : ''}" data-ttl="${v}">${l}</span>`).join('')}</div><button class="btn pri" style="margin-top:10px" id="cSave">Save</button>` : `<div class="mute sm">Only the circle admin can rename the circle or set disappearing messages.</div>`}
    <div class="chips" style="margin-top:12px"><button class="btn" data-a="invite">Invite people</button><button class="btn" data-a="find">${ic('search', 16)} Find by username</button><button class="btn dng" data-dc="${c.id}">${ic('trash', 16)} ${c.dm ? 'Delete chat' : 'Delete circle'}</button></div></div>`
}
function mapPanel (r, body) {
  const entries = Object.entries(r.locs).filter(([u, l]) => l.until > Date.now() && !isBlocked(u))
  const mine = myShares[r.c.id]
  if (mine && mine.pos) entries.unshift([S.uid || 'me', { lat: mine.pos.latitude, lng: mine.pos.longitude, acc: mine.pos.accuracy, until: mine.until }])
  body.innerHTML = `<div id="map"></div>${mine ? `<div class="banner" style="border-radius:10px;margin-bottom:8px"><span>You are sharing with ${mine.all ? 'everyone in this circle' : mine.to.length + (mine.to.length === 1 ? ' person' : ' people')} until ${fmtTime(mine.until)}</span><button class="btn sm dng" data-a="stoploc">Stop</button></div>` : '<button class="btn pri" style="width:100%;margin-bottom:10px" data-a="loc">Share my location…</button>'}
    ${entries.map(([u, l]) => { const p = u === (S.uid || 'me') ? me() : profOf(r, u); return `<div class="mrow">${avatar(p, 'sm', true)}<div class="t"><div class="n">${esc(p.name)}</div><div class="mute sm">${l.lat.toFixed(4)}, ${l.lng.toFixed(4)} · ±${Math.round(l.acc || 0)}m · until ${fmtTime(l.until)}</div></div><a class="btn sm" target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=16/${l.lat}/${l.lng}">Open</a></div>` }).join('') || '<div class="mute sm">Nobody is sharing their location with you right now. Locations only show while people are online and have chosen to share.</div>'}`
  const mel = $('#map', body); if (!mel) return
  const map = L.map(mel, { zoomControl: true, attributionControl: true }).setView(entries[0] ? [entries[0][1].lat, entries[0][1].lng] : [20, 0], entries[0] ? 14 : 2)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
  const pts = []
  for (const [u, l] of entries) { const p = u === (S.uid || 'me') ? me() : profOf(r, u); L.marker([l.lat, l.lng], { icon: L.divIcon({ className: '', html: `<div class="pin" style="background:${p.color}">${esc(p.emoji)}</div>`, iconSize: [34, 34] }) }).addTo(map).bindTooltip(p.name); pts.push([l.lat, l.lng]) }
  if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] })
  setTimeout(() => map.invalidateSize(), 50)
}

// ===================================================================== location
function onLoc (r, d, userId) {
  if (isBlocked(userId) || !d) return
  if (d.stop) { delete r.locs[userId]; if (S.active === r.c.id) renderChat(); toast(profOf(r, userId).name + ' stopped sharing their location'); if (S.panel && S.tab === 'map' && S.active === r.c.id) renderPanel(); return }
  if (typeof d.lat !== 'number' || typeof d.lng !== 'number' || Math.abs(d.lat) > 90 || Math.abs(d.lng) > 180) return
  const until = Math.min(+d.until || 0, Date.now() + 24 * 36e5)
  const first = !r.locs[userId]
  r.locs[userId] = { lat: d.lat, lng: d.lng, acc: +d.acc || 0, until, ts: Date.now() }
  if (S.active === r.c.id && S.view === 'chats') updateMiniMaps(r)
  if (first) { notify(profOf(r, userId).name + ' is sharing their location', 'Until ' + fmtTime(until)); toast(profOf(r, userId).name + ' is sharing their location with you until ' + fmtTime(until)) }
  if (S.panel && S.tab === 'map' && S.active === r.c.id) { clearTimeout(onLoc.t); onLoc.t = setTimeout(renderPanel, 800) }
}
function shareTargets (r, sh) { const us = r.room.getUsers(); const ids = sh.all ? Object.keys(us).filter(u => !isBlocked(u)) : sh.to; return ids.map(u => us[u]).filter(Boolean).map(i => i.peerIds[0]) }
function sendLoc (cid, force) {
  const sh = myShares[cid]; const r = R[cid]; if (!sh || !r || !sh.pos) return
  if (Date.now() > sh.until) return stopShare(cid)
  const targets = shareTargets(r, sh)
  if (!targets.length) return
  if (S.active === cid && S.view === 'chats') updateMiniMaps(r)
  r.A.loc.send({ lat: sh.pos.latitude, lng: sh.pos.longitude, acc: sh.pos.accuracy, until: sh.until }, { target: targets }).catch(() => {})
}
async function postLocMsg (r, sh) {
  const m = { id: uid(), cid: r.c.id, from: S.uid, ts: Date.now(), kind: 'loc', text: '', lat: sh.pos.latitude, lng: sh.pos.longitude, until: sh.until, fc: me().feedColor || '', reacts: {} }
  r.msgs.push(m); await msgPut(m); r.A.msg.send(m).catch(() => {}); relaySend(r, m); render(); scrollEnd()
}
function startShare (cid, to, ms, all, fixed) {
  const r = R[cid]; if (!r) return
  stopShare(cid, true)
  const sh = myShares[cid] = { to, all: !!all, until: Date.now() + ms, pos: fixed || null, watch: null, timer: null, fixed: !!fixed }
  const begin = () => {
    if (myShares[cid] !== sh) return
    sh.sentFirst = true; sendLoc(cid); postLocMsg(r, sh)
    sh.timer = setInterval(() => sendLoc(cid), 5000)
    setTimeout(() => { if (myShares[cid] === sh) stopShare(cid) }, ms + 500)
    render(); toast('Sharing your location until ' + fmtTime(sh.until))
  }
  if (fixed) return begin()
  if (!geo.ok) { delete myShares[cid]; return locFallback(cid, to, ms, all, { message: 'Location is not available on this device.' }) }
  toast('Finding your location…')
  const got = p => {
    if (myShares[cid] !== sh || sh.pos) return
    sh.pos = p.coords; begin()
    sh.watch = geo.watch(q => { if (!sh.pos || q.coords.accuracy <= sh.pos.accuracy * 1.5 || Date.now() - (sh.posAt || 0) > 30000) { sh.pos = q.coords; sh.posAt = Date.now() } }, () => { /* keep last position */ }, { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 })
    if (p.coords.accuracy > 2000) toast('Your computer only found you within about ' + Math.round(p.coords.accuracy / 1000) + ' km. Tap "Wrong spot?" on the map to pin your exact location.', true)
  }
  // try the most accurate source first (GPS or Wi-Fi positioning), then fall back to a coarse fix
  geo.get(got, () => {
    geo.get(got, err => { if (myShares[cid] === sh && !sh.pos) { delete myShares[cid]; locFallback(cid, to, ms, all, err) } }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 0 })
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
}
function locFallback (cid, to, ms, all, err) {
  const m = modal(`<h2>Couldn't find your location</h2><p class="mute">${esc((err && err.message) || 'Unknown error')}. On Windows, turn on <b>Location services</b> and <b>Let desktop apps access your location</b>, then try again. Computers without GPS use Wi-Fi to find you, so Wi-Fi must be on.</p>
    <div class="stackbtns"><button class="btn pri" id="lfRetry">${ic('pin', 16)} Try again</button><button class="btn" id="lfSet">Open Windows location settings</button><button class="btn" id="lfPick">${ic('map', 16)} Choose a spot on the map instead</button><button class="btn" data-x>Cancel</button></div>`)
  $('#lfRetry', m).onclick = () => { m.remove(); startShare(cid, to, ms, all) }
  $('#lfSet', m).onclick = () => { try { window.open('ms-settings:privacy-location') } catch { /* ignore */ } }
  $('#lfPick', m).onclick = () => { m.remove(); pickSpotDialog(cid, to, ms, all) }
}
function pickSpotDialog (cid, to, ms, all) {
  const m = modal(`<h2>Choose a spot to share</h2><p class="mute">Search for an address or tap the map to drop a pin. This shares that spot (not your live position) for the time you picked.</p>
    <div class="srch"><span>${ic('search', 15)}</span><input id="psq" placeholder="Search an address or place"><button class="btn sm pri" id="psgo">Search</button></div>
    <div id="pickmap" style="height:300px;border-radius:12px;margin-top:10px;overflow:hidden"></div>
    <div class="foot"><button class="btn" data-x>Cancel</button><button class="btn pri" id="psok" disabled>Share this spot</button></div>`, true)
  const map = L.map($('#pickmap', m)).setView([39.5, -98.35], 3)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
  setTimeout(() => map.invalidateSize(), 80)
  let mk = null; let spot = null
  const put = (la, ln) => { spot = { latitude: la, longitude: ln, accuracy: 0 }; if (mk) mk.setLatLng([la, ln]); else mk = L.marker([la, ln]).addTo(map); $('#psok', m).disabled = false }
  map.on('click', e => put(e.latlng.lat, e.latlng.lng))
  $('#psgo', m).onclick = async () => {
    const q = $('#psq', m).value.trim(); if (!q) return
    try { const res = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q))).json(); if (!res[0]) return toast('No match found.', true); const la = +res[0].lat; const ln = +res[0].lon; map.setView([la, ln], 15); put(la, ln) } catch { toast('Search needs an internet connection.', true) }
  }
  $('#psq', m).onkeydown = e => { if (e.key === 'Enter') $('#psgo', m).click() }
  $('#psok', m).onclick = () => { S.settings.savedSpot = { la: spot.latitude, ln: spot.longitude }; saveCfg(); m.remove(); startShare(cid, to, ms, all, spot) }
}
function stopShare (cid, silent) {
  const sh = myShares[cid]; if (!sh) return
  geo.clear(sh.watch); clearInterval(sh.timer)
  const r = R[cid]
  if (r) { const targets = shareTargets(r, sh); if (targets.length) r.A.loc.send({ stop: true }, { target: targets }).catch(() => {}) }
  delete myShares[cid]; if (!silent) { render(); toast('Stopped sharing your location') }
}
function locDialog () {
  const r = cur(); if (!r) return
  const ids = Object.keys(r.users).filter(u => u !== S.uid && !isBlocked(u))
  const m = modal(`<h2>Share my location</h2><p class="mute">Only people in this circle can see it, and only while you are both online. You can stop any time, and it ends automatically when the timer runs out. You can start sharing even if nobody is here yet.</p>
    <label class="lbl">Share with</label><label class="mrow"><span class="t n">Everyone in this circle <small class="mute">(including people who join while you are sharing)</small></span><input type="checkbox" id="lAll" checked></label>${ids.map(u => `<label class="mrow">${avatar(profOf(r, u), 'sm', r.online.has(u))}<span class="t n">${esc(profOf(r, u).name)} <small class="mute">${r.online.has(u) ? '' : '(offline: will see it when back online)'}</small></span><input type="checkbox" data-lu="${u}"></label>`).join('')}
    <label class="lbl">For how long</label><div class="chips" id="dur">${[[15, '15 min'], [60, '1 hour'], [480, '8 hours']].map(([v, l], i) => `<span class="chip ${i === 1 ? 'on' : ''}" data-d="${v}">${l}</span>`).join('')}</div>
    <div class="foot"><button class="btn" data-x>Cancel</button>${S.settings.savedSpot ? '<button class="btn" id="goSaved">Use my saved spot</button>' : ''}<button class="btn" id="goPick">${ic('map', 15)} Pick a spot instead</button><button class="btn pri" id="goShare">Share my location</button></div>`)
  let dur = 60
  $('#dur', m).onclick = e => { const c = e.target.closest('.chip'); if (!c) return; dur = +c.dataset.d; $$('#dur .chip', m).forEach(x => x.classList.toggle('on', x === c)) }
  $('#goPick', m).onclick = () => { const to = $$('[data-lu]', m).filter(x => x.checked).map(x => x.dataset.lu); const all = $('#lAll', m).checked; if (!to.length && !all) return toast('Pick at least one person, or choose everyone.', true); m.remove(); pickSpotDialog(r.c.id, to, dur * 60000, all) }
  const sv = $('#goSaved', m); if (sv) sv.onclick = () => { const to = $$('[data-lu]', m).filter(x => x.checked).map(x => x.dataset.lu); const all = $('#lAll', m).checked; if (!to.length && !all) return toast('Pick at least one person, or choose everyone.', true); m.remove(); startShare(r.c.id, to, dur * 60000, all, { latitude: S.settings.savedSpot.la, longitude: S.settings.savedSpot.ln, accuracy: 0 }) }
  $('#goShare', m).onclick = () => { const to = $$('[data-lu]', m).filter(x => x.checked).map(x => x.dataset.lu); const all = $('#lAll', m).checked; if (!to.length && !all) return toast('Pick at least one person, or choose everyone.', true); m.remove(); startShare(r.c.id, to, dur * 60000, all) }
}

// ===================================================================== calls (voice channel style)
const tiles = {}          // key -> { el, v }
const streams = {}        // userId -> { webcam, screens: { peerId: stream } }
const speakNodes = {}     // key -> { an, buf, userId, src }
S.speak = new Set()
let actx = null
const selfId = () => S.uid || 'me'
const gUM = c => navigator.mediaDevices.getUserMedia(c)
const VID = { width: { ideal: 1280 }, height: { ideal: 720 } }
function watchSpeaking (key, userId, stream) {
  stopWatch(key); if (!stream.getAudioTracks().length) return
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume()
    const src = actx.createMediaStreamSource(stream); const an = actx.createAnalyser(); an.fftSize = 512; src.connect(an)
    speakNodes[key] = { an, buf: new Uint8Array(an.fftSize), userId, src }
  } catch { /* ignore */ }
}
function stopWatch (key) { const n = speakNodes[key]; if (n) { try { n.src.disconnect() } catch { /* ignore */ } delete speakNodes[key] } }
setInterval(() => {
  if (!Object.keys(speakNodes).length) { if (S.speak.size) { S.speak = new Set(); applySpeaking() } return }
  const now = new Set()
  for (const n of Object.values(speakNodes)) { n.an.getByteTimeDomainData(n.buf); let m = 0; for (const x of n.buf) m = Math.max(m, Math.abs(x - 128)); if (m > 12) now.add(n.userId) }
  if (now.size !== S.speak.size || [...now].some(u => !S.speak.has(u))) { S.speak = now; applySpeaking() }
}, 150)
function applySpeaking () { document.querySelectorAll('[data-su]').forEach(el => el.classList.toggle('speaking', S.speak.has(el.dataset.su))) }
const callParticipants = r => { const ids = Object.keys(r.callUsers).filter(u => !isBlocked(u)); return r.call && r.call.on ? [selfId(), ...ids] : ids }
function vcHtml (r) {
  if (!r) return ''; const ids = callParticipants(r); if (!ids.length) return ''
  return `<div class="vcl">${ids.map(u => { const self = u === selfId(); const p = self ? me() : profOf(r, u); const st = self ? { mute: r.call.mute } : r.callUsers[u] || {}; return `<div class="vc1 ${S.speak.has(u) ? 'speaking' : ''}" data-su="${u}">${avatar(p, 'xs')}<span>${esc(p.name)}</span>${st.mute ? ic('micoff', 13) : ''}</div>` }).join('')}</div>`
}
function tileFor (key, kind, userId) {
  let t = tiles[key]; if (t) return t
  const el = document.createElement('div'); el.className = 'tile ' + kind; el.dataset.su = userId
  el.innerHTML = '<video autoplay playsinline></video><div class="ava"></div><div class="nm"></div><div class="mi">' + ic('micoff', 14) + '</div>'
  t = tiles[key] = { el, v: el.querySelector('video') }
  if (userId === selfId()) t.v.muted = true
  $('#tiles').appendChild(el); return t
}
function syncTiles () {
  const cid = $('#call').dataset.cid; const r = R[cid]; if (!r || !r.call || !r.call.on) return
  const want = new Set(); const parts = callParticipants(r)
  for (const u of parts) {
    const self = u === selfId(); const p = self ? me() : profOf(r, u)
    const st = self ? { video: r.call.camOn, mute: r.call.mute } : (r.callUsers[u] || {})
    const key = 'c:' + u; want.add(key); const t = tileFor(key, 'cam', u)
    const stream = self ? r.call.stream : (streams[u] && streams[u].webcam)
    if (stream && t.v.srcObject !== stream) t.v.srcObject = stream
    t.el.classList.toggle('hascam', !!(st.video && stream)); t.el.classList.toggle('muted', !!st.mute); t.el.classList.toggle('me', self)
    t.el.querySelector('.nm').textContent = p.name + (self ? ' (you)' : '')
    const ava = t.el.querySelector('.ava'); if (!ava.dataset.k || ava.dataset.k !== (p.img || '') + p.emoji + p.color) { ava.dataset.k = (p.img || '') + p.emoji + p.color; ava.innerHTML = avatar(p, 'lg') }
  }
  for (const [u, sx] of Object.entries(streams)) if (parts.includes(u)) for (const [pid, st] of Object.entries(sx.screens)) {
    const key = 's:' + pid; want.add(key); const t = tileFor(key, 'screen', u); if (t.v.srcObject !== st) t.v.srcObject = st
    t.el.classList.add('hascam'); t.el.querySelector('.nm').textContent = profOf(r, u).name + ' (screen)'
  }
  if (r.call.screen) { const t = tileFor('s:self', 'screen', selfId()); want.add('s:self'); if (t.v.srcObject !== r.call.screen) t.v.srcObject = r.call.screen; t.el.classList.add('hascam'); t.el.querySelector('.nm').textContent = 'Your screen' }
  for (const [k, t] of Object.entries(tiles)) if (!want.has(k)) { t.el.remove(); delete tiles[k] }
  $('#callTitle').textContent = r.c.name + ' · ' + parts.length + ' in call'
  $('#tiles').dataset.n = Math.min(parts.length + (r.call.screen ? 1 : 0), 6)
  applySpeaking()
}
function updateCallBtns () {
  const r = R[$('#call').dataset.cid]; if (!r || !r.call) return
  $('#bMic').classList.toggle('off', !!r.call.mute); $('#bMic').innerHTML = ic(r.call.mute ? 'micoff' : 'mic', 22)
  $('#bCam').classList.toggle('off', !r.call.camOn); $('#bCam').innerHTML = ic(r.call.camOn ? 'video' : 'videooff', 22)
  $('#bScreen').classList.toggle('on', !!r.call.screen)
  const el = $('#call'); const mode = S.callSize || 'dock'; el.classList.toggle('sm', mode === 'sm'); el.classList.toggle('lg', mode === 'lg'); document.body.classList.toggle('callsm', mode === 'sm')
  const dk = mode === 'dock' && innerWidth > 820; el.classList.toggle('dock', dk); document.body.classList.toggle('calldock', dk)
}
const pushCallState = r => r.callState.set({ active: !!(r.call && r.call.on), video: !!(r.call && r.call.camOn), mute: !!(r.call && r.call.mute) })
function showCall (cid) { const el = $('#call'); el.dataset.cid = cid; el.classList.add('on'); document.body.classList.add('incall'); syncTiles(); updateCallBtns() }
function addTile (r, userId, peerId, stream, type) {
  const sx = streams[userId] = streams[userId] || { screens: {} }; sx.peers = sx.peers || {}
  const drop = () => { if (!stream.getTracks().length) { if (type === 'screen') delete sx.screens[peerId]; else if (sx.webcam === stream) { delete sx.webcam; stopWatch('r:' + peerId) } syncTiles() } }
  if (type === 'screen') sx.screens[peerId] = stream; else { sx.webcam = stream; watchSpeaking('r:' + peerId, userId, stream) }
  stream.onremovetrack = drop
  syncTiles()
}
function dropTiles (userId) { const sx = streams[userId]; if (sx) { for (const k of Object.keys(speakNodes)) if (speakNodes[k].userId === userId) stopWatch(k); delete streams[userId] } syncTiles() }
async function joinCall (cid, opts = {}) {
  const r = R[cid]; if (!r) return
  if (r.call && r.call.on) { showCall(cid); return }
  if (Object.values(R).some(x => x.call && x.call.on)) return toast('Leave your current call first.', true)
  const wantVideo = opts.video !== false
  let stream; let camOn = false
  try { stream = await gUM({ audio: { echoCancellation: true, noiseSuppression: true }, video: wantVideo ? VID : false }); camOn = wantVideo && stream.getVideoTracks().length > 0 } catch (e) {
    try { stream = await gUM({ audio: true }); if (wantVideo) toast('No camera available. Joined with voice only.') } catch (e2) { return toast('Could not access the microphone: ' + (e2.message || e2.name), true) }
  }
  r.call = { on: true, stream, cid, screen: null, camOn, mute: false }
  showCall(cid); watchSpeaking('self', selfId(), stream)
  await r.room.addStream(stream, { metadata: { type: 'webcam' } }).catch(() => {})
  pushCallState(r)
  if (r.c.dm) r.A.ring.send({}).catch(() => {})
  syncTiles(); render()
}
function leaveCall (cid) {
  const r = R[cid]; if (!r || !r.call) return
  const c = r.call; try { r.room.removeStream(c.stream) } catch { /* ignore */ } c.stream.getTracks().forEach(t => t.stop())
  if (c.screen) { try { r.room.removeStream(c.screen) } catch { /* ignore */ } c.screen.getTracks().forEach(t => t.stop()) }
  r.call = null; pushCallState(r); stopWatch('self')
  Object.values(tiles).forEach(t => t.el.remove()); for (const k of Object.keys(tiles)) delete tiles[k]
  $('#call').classList.remove('on'); document.body.classList.remove('incall', 'calldock', 'callsm'); render()
}
async function setCamera (r, on) {
  const c = r.call; if (!c) return
  const audio = c.stream.getAudioTracks(); let v = []
  if (on) { try { v = (await gUM({ video: VID })).getVideoTracks() } catch { return toast('Could not open the camera.', true) } } else c.stream.getVideoTracks().forEach(t => t.stop())
  try { r.room.removeStream(c.stream) } catch { /* ignore */ }
  c.stream = new MediaStream([...audio, ...v]); c.camOn = on && v.length > 0
  c.stream.getAudioTracks().forEach(t => { t.enabled = !c.mute })
  await r.room.addStream(c.stream, { metadata: { type: 'webcam' } }).catch(() => {})
  watchSpeaking('self', selfId(), c.stream); pushCallState(r); syncTiles(); updateCallBtns()
}
function toggleMic () { const r = R[$('#call').dataset.cid]; if (!r || !r.call) return; r.call.mute = !r.call.mute; r.call.stream.getAudioTracks().forEach(t => { t.enabled = !r.call.mute }); pushCallState(r); syncTiles(); updateCallBtns(); renderList() }
async function shareScreen () {
  const cid = $('#call').dataset.cid; const r = R[cid]; if (!r || !r.call) return
  if (r.call.screen) { try { r.room.removeStream(r.call.screen) } catch { /* ignore */ } r.call.screen.getTracks().forEach(t => t.stop()); r.call.screen = null; syncTiles(); updateCallBtns(); return }
  try {
    const sc = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); r.call.screen = sc
    await r.room.addStream(sc, { metadata: { type: 'screen' } }); if (S.callSize && S.callSize !== 'dock') S.callSize = 'lg'; syncTiles(); updateCallBtns()
    sc.getVideoTracks()[0].onended = () => { if (r.call && r.call.screen) shareScreen() }
  } catch (e) { toast('Screen sharing is not available here.', true) }
}
function callInviteMenu (btn) {
  const r = R[$('#call').dataset.cid]; if (!r) return
  const bb = btn.getBoundingClientRect(); const items = []
  const cand = Object.keys(r.users).filter(u => u !== S.uid && !isBlocked(u) && r.online.has(u) && r.peers[u] && !r.callUsers[u])
  for (const u of cand) { const nm = profOf(r, u).name; items.push({ label: 'Ring ' + esc(nm), icon: 'userplus', fn: () => { r.A.ring.send({}, { target: r.peers[u] }).catch(() => {}); toast('Invited ' + nm) } }) }
  if (cand.length > 1) items.unshift({ label: 'Ring everyone online', icon: 'users', fn: () => { r.A.ring.send({}).catch(() => {}); toast('Invited everyone online') } })
  if (!cand.length) items.push({ label: 'No one else is online right now', icon: 'users', fn: () => {} })
  items.push({ label: 'Add someone new…', icon: 'search', fn: () => findDialog() })
  ctxMenu(bb.left, bb.bottom + 6, items)
}
let ringTimer = null
function hideRing () { clearInterval(ringTimer); ringTimer = null; const el = $('#ring'); el.classList.remove('on'); el.innerHTML = '' }
function onRing (r, from) {
  if (isBlocked(from) || (r.call && r.call.on)) return
  const p = profOf(r, from); const el = $('#ring')
  el.innerHTML = `${avatar(p, 'lg', true)}<div class="rt2"><b>${esc(p.name)}</b><span>invites you to a call${r.c.dm ? '' : ' in ' + esc(r.c.name)}</span></div><div class="rb"><button class="btn pri" data-ring="video" data-cid="${r.c.id}">${ic('video', 16)} Join</button><button class="btn" data-ring="voice" data-cid="${r.c.id}">Voice only</button><button class="btn dng" data-ring="no">${ic('phoneoff', 16)}</button></div>`
  el.classList.add('on'); clearInterval(ringTimer); beep('call'); notify(p.name + ' is calling', r.c.name, 'call'); ringTimer = setInterval(() => beep('call'), 3200); setTimeout(hideRing, 30000)
}
// draggable window
{
  const el = $('#call'); const h = $('#callHead'); let d = null
  h.addEventListener('pointerdown', e => { if (e.target.closest('button') || innerWidth <= 820 || el.classList.contains('dock')) return; const b = el.getBoundingClientRect(); d = { dx: e.clientX - b.left, dy: e.clientY - b.top }; h.setPointerCapture(e.pointerId) })
  h.addEventListener('pointermove', e => { if (!d) return; el.style.left = Math.max(0, Math.min(innerWidth - 120, e.clientX - d.dx)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 60, e.clientY - d.dy)) + 'px'; el.style.right = 'auto' })
  h.addEventListener('pointerup', () => { d = null })
}

// ===================================================================== modals
function modal (html, wide) {
  const m = document.createElement('div'); m.className = 'modal'
  m.innerHTML = `<div class="card ${wide ? 'wide' : ''}">${html}</div>`
  m.onclick = e => { if (e.target === m || e.target.closest('[data-x]')) m.remove() }
  document.body.appendChild(m); return m
}
async function inviteDialog () {
  const r = cur(); if (!r) return
  const code = makeInvite(r.c); const base = S.settings.webBase || (location.protocol.startsWith('http') && !/^(127\.0\.0\.1|localhost)/.test(location.hostname) ? location.origin + location.pathname : '')
  const link = base ? base + '#join=' + encodeURIComponent(code) : ''
  const qr = await QRCode.toDataURL(link || code, { margin: 1, width: 240 })
  const m = modal(`<h2>Invite to ${esc(r.c.name)}</h2><p class="mute">Anyone with this invite can join and read the circle, so share it only with people you trust. You can remove people later.</p>
    <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start"><div class="qr"><img src="${qr}" width="200" height="200"></div>
    <div style="flex:1;min-width:220px"><label class="lbl">Invite code (paste into Orbit > Join)</label><textarea id="ivc" rows="3" readonly>${esc(code)}</textarea><div class="chips" style="margin-top:8px"><button class="btn sm" id="cpc">Copy code</button>${link ? '<button class="btn sm" id="cpl">Copy link</button>' : ''}${navigator.share ? '<button class="btn sm pri" id="shr">Share…</button>' : ''}</div>
    ${link ? '' : '<p class="mute sm">To make tap-to-join links, put the Orbit app on a web address and enter it in Settings > Network > Web app address. Codes and QR work without that.</p>'}</div></div><div class="foot"><span></span><button class="btn" data-x>Done</button></div>`)
  $('#cpc', m).onclick = () => { navigator.clipboard.writeText(code); toast('Code copied') }
  if (link) $('#cpl', m).onclick = () => { navigator.clipboard.writeText(link); toast('Link copied') }
  if (navigator.share) $('#shr', m).onclick = () => navigator.share({ title: 'Join my Orbit circle', text: 'Join "' + r.c.name + '" on Orbit', url: link || undefined }).catch(() => {})
  if (!link && navigator.share) $('#shr', m).onclick = () => navigator.share({ title: 'Orbit invite', text: code }).catch(() => {})
}
function joinDialog (prefill) {
  const m = modal(`<h2>Join a circle</h2><p class="mute">Paste an invite code or link, or scan a QR code.</p><textarea id="jc" rows="3" placeholder="orbit1.…">${esc(prefill || '')}</textarea>
    <div class="chips" style="margin-top:10px"><button class="btn" id="scan">${ic('camera', 17)} Scan QR code</button></div><video id="sv" playsinline style="display:none;width:100%;margin-top:10px;border-radius:12px"></video>
    <div class="foot"><button class="btn" data-x>Cancel</button><button class="btn pri" id="jgo">Join</button></div>`)
  let stream, stop = false
  const done = () => { stop = true; stream && stream.getTracks().forEach(t => t.stop()) }
  m.addEventListener('remove', done)
  new MutationObserver(() => { if (!document.body.contains(m)) done() }).observe(document.body, { childList: true })
  $('#jgo', m).onclick = async () => { if (await joinByInvite($('#jc', m).value)) { done(); m.remove() } }
  $('#scan', m).onclick = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); const v = $('#sv', m); v.style.display = 'block'; v.srcObject = stream; await v.play()
      const cvs = document.createElement('canvas'); const cx = cvs.getContext('2d', { willReadFrequently: true })
      const tick = () => { if (stop) return; if (v.videoWidth) { cvs.width = v.videoWidth; cvs.height = v.videoHeight; cx.drawImage(v, 0, 0); const q = jsQR(cx.getImageData(0, 0, cvs.width, cvs.height).data, cvs.width, cvs.height); if (q && q.data) { $('#jc', m).value = q.data; done(); $('#jgo', m).click(); return } } requestAnimationFrame(tick) }
      tick()
    } catch (e) { toast('Camera not available: ' + (e.message || e.name), true) }
  }
}
function newDialog () {
  const m = modal(`<h2>New circle</h2><p class="mute">A circle is a private space for family, friends or a team. Chat, files, calls and location are shared only inside it.</p><label class="lbl">Name</label><input id="cn" placeholder="Family, Road trip, Game night…" maxlength="60" autofocus>
    <div class="foot"><button class="btn" data-x>Cancel</button><button class="btn pri" id="cg">Create</button></div>`)
  $('#cg', m).onclick = async () => { const n = $('#cn', m).value; m.remove(); await createCircle(n); inviteDialog() }
}

// ---------- settings
function swatchRow (items, key, val) { return `<div class="chips">${items.map(([k, l]) => `<span class="chip ${val === k ? 'on' : ''}" data-set="${key}" data-v="${k}">${l}</span>`).join('')}</div>` }
function settingsDialog (tab = 'profile') {
  const s = S.settings
  const pages = {
    profile: () => `<label class="lbl">Display name</label><input id="pName" value="${esc(me().name)}" maxlength="30"><label class="lbl">Status</label><input id="pStatus" value="${esc(me().status || '')}" maxlength="60" placeholder="What are you up to?">
      <label class="lbl">Username (how people find you)</label><div class="srch"><span>@</span><input id="pHandle" value="${esc(me().handle || '')}" maxlength="20" autocapitalize="off"></div>
      <div class="tgl"><div>Let people find me by username<small>Only while Orbit is open. They can send you a chat or circle invite; you choose to accept or decline.</small></div><label class="sw"><input type="checkbox" data-tg="discoverable" ${s.discoverable !== false ? 'checked' : ''}><span></span></label></div>
      <label class="lbl">Avatar</label>${avatar(me(), 'lg')}<div class="avpick">${AVATARS.map(a => `<span class="${me().emoji === a && !me().img ? 'on' : ''}" data-av="${a}">${a}</span>`).join('')}</div><div class="colors">${COLORS.map(c => `<i class="${me().color === c ? 'on' : ''}" data-col="${c}" style="background:${c}"></i>`).join('')}</div>
      <button class="btn sm" id="pPhoto">Use a photo</button> ${me().img ? '<button class="btn sm" id="pNoPhoto">Remove photo</button>' : ''}<input type="file" id="pFile" accept="image/*" hidden>
      <label class="lbl">My color</label><div class="chips">${FEEDCOLS.map(c => `<span class="swatch fcs ${(me().feedColor || '') === c ? 'on' : ''}" data-fcol="${c}" title="${c || 'Default'}" style="background:${c || 'var(--panel2)'}"></span>`).join('')}<input type="color" id="fcCustom" value="${me().feedColor || '#5b8cff'}" title="Custom color"></div><p class="mute sm">Colors your feed posts and your chat bubbles. Everyone you chat or share with sees it.</p>
      <h3 style="margin-top:20px">Payment handles</h3><p class="mute sm">Shown to circle members so they can pay you in their own app. Orbit never touches the money.</p>
      ${[['cashapp', 'Cash App $cashtag'], ['venmo', 'Venmo username'], ['paypal', 'PayPal.me name'], ['zelle', 'Zelle email or phone']].map(([k, l]) => `<div class="row2"><label>${l}</label><input data-pay="${k}" value="${esc((me().pay || {})[k] || '')}" maxlength="60"></div>`).join('')}`,
    look: () => `<label class="lbl">Theme</label><div class="chips">${THEMES.map(([id, n, g]) => `<div class="swatch ${s.theme === id ? 'on' : ''}" data-set="theme" data-v="${id}"><i style="background:${g}"></i>${n}</div>`).join('')}</div>
      <label class="lbl">Bubble shape</label>${swatchRow([['round', 'Rounded'], ['pill', 'Pill'], ['square', 'Square']], 'bubble', s.bubble)}
      <label class="lbl">Message layout</label>${swatchRow([['split', 'Bubbles left/right'], ['left', 'All on the left']], 'align', s.align)}
      <label class="lbl">Density</label>${swatchRow([['cozy', 'Cozy'], ['compact', 'Compact']], 'density', s.density)}
      <label class="lbl">Font</label>${swatchRow([['system', 'Standard'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Mono']], 'font', s.font)}
      <div class="tgl"><div>Glass effect<small>Frosted, translucent panels</small></div><label class="sw"><input type="checkbox" data-tg="glass" ${s.glass ? 'checked' : ''}><span></span></label></div>
      <p class="mute sm">Chat backgrounds are set per circle in the Details panel > Circle tab.</p>`,
    safety: () => `<div class="tgl"><div>Hide profanity<small>Masks swear words; tap a hidden message to reveal it. Also the Swearing button in the chat header.</small></div><label class="sw"><input type="checkbox" data-tg="profanity" ${s.profanity ? 'checked' : ''}><span></span></label></div>
      <div class="tgl"><div>Read receipts<small>Show others when you have seen their messages, and see when they have seen yours</small></div><label class="sw"><input type="checkbox" data-tg="receipts" ${s.receipts !== false ? 'checked' : ''}><span></span></label></div>
      <label class="lbl">Sensitive image shield</label>${swatchRow([['blur', 'Blur adult images'], ['block', 'Block adult images'], ['off', 'Off']], 'shield', s.shield)}
      <p class="mute sm">Images from others are checked on your device (nothing is uploaded). Adult content is blurred or hidden until you choose to view it.</p>
      <div class="sec" style="margin-top:12px"><h3>What this can and can't do</h3><p class="mute sm" style="margin:0">Orbit is peer-to-peer and end-to-end encrypted, so nobody (including the developer) can scan or moderate what you send. The shield is an on-device filter for adult images, warnings flag program files and risky links, and you can block or report-by-removing anyone in one tap. It cannot detect every illegal or harmful file. Never open or forward anything you believe is illegal, and report it to the authorities (in the US: report.cybertip.org).</p></div>`,
    notify: () => `<div class="tgl"><div>Desktop notifications<small>When the window is in the background</small></div><label class="sw"><input type="checkbox" data-tg="notif" ${s.notif ? 'checked' : ''}><span></span></label></div><div class="tgl"><div>Sounds</div><label class="sw"><input type="checkbox" data-tg="sound" ${s.sound ? 'checked' : ''}><span></span></label></div>
      <label class="lbl">Sound style</label>${swatchRow([['msn', 'Messenger chimes'], ['im', 'Classic IM'], ['soft', 'Soft ping']], 'soundSet', s.soundSet)}
      <div class="chips" style="margin-top:8px"><button class="btn sm" data-snd="msg">Play: message</button><button class="btn sm" data-snd="online">Play: friend online</button><button class="btn sm" data-snd="call">Play: call</button></div>
      <label class="lbl">Volume</label><input type="range" id="sVol" min="0" max="100" value="${Math.round((s.volume ?? 0.7) * 100)}">
      <div class="tgl"><div>Floating pop-ups<small>A small avatar bubble appears when someone messages you in another chat</small></div><label class="sw"><input type="checkbox" data-tg="popups" ${s.popups !== false ? 'checked' : ''}><span></span></label></div>
      <p class="mute sm">Sounds are original, synthesized tones inspired by classic messenger apps.</p>`,
    network: () => `<label class="lbl">GIF search key (free, from developers.giphy.com)</label><input id="nGif" value="${esc(s.giphy)}" placeholder="Paste your Giphy API key"><p class="mute sm">Without a key you can still send GIFs by uploading them or pasting a GIF link.</p>
      <label class="lbl">Offline message relay (optional)</label><input id="nRelayUrl" value="${esc(s.relay || '')}" placeholder="https://orbit-relay.yourname.workers.dev"><p class="mute sm">Delivers messages to people whose app is closed. Messages are encrypted before they leave your device; the relay can't read them. Everyone in a circle should use the same relay.</p>
      <label class="lbl">Web app address (for tap-to-join invite links)</label><input id="nBase" value="${esc(s.webBase)}" placeholder="https://yourname.github.io/orbit/">
      <label class="lbl">Custom signaling relays (wss://…, optional)</label><textarea id="nRel" rows="2" placeholder="Leave empty for the default public relays">${esc(s.relays)}</textarea>
      <label class="lbl">TURN server (helps on strict networks / mobile data)</label><input id="nTurn" value="${esc(s.turnUrl)}" placeholder="turn:host:3478"><div class="row2" style="margin-top:8px"><input id="nTu" value="${esc(s.turnUser)}" placeholder="username"><input id="nTp" value="${esc(s.turnPass)}" placeholder="credential"></div><p class="mute sm">Changes to relays/TURN apply after restarting Orbit.</p>`,
    data: () => `<div class="sec"><h3>Your data</h3><p class="mute sm">Everything lives on this device. There is no account and no server copy.</p><button class="btn dng" id="wipe">Erase everything on this device</button></div>${Object.keys(S.blocked).length ? '<h3>Blocked people</h3>' + Object.entries(S.blocked).map(([u, b]) => `<div class="mrow"><div class="t">${esc(b.name || u.slice(0, 10))}</div><button class="btn sm" data-mem="unblock" data-u="${u}">Unblock</button></div>`).join('') : '<p class="mute sm">You have not blocked anyone.</p>'}`
  }
  const names = [['profile', 'Profile'], ['look', 'Look'], ['safety', 'Safety'], ['notify', 'Alerts'], ['network', 'Network'], ['data', 'Data']]
  const old = $('#setm'); const keep = old && old.dataset.tab === tab ? old.querySelector('.card').scrollTop : 0; if (old) old.remove()
  const m = modal(`<h2>Settings</h2><div class="chips" style="margin:10px 0 14px">${names.map(([k, l]) => `<span class="chip ${tab === k ? 'on' : ''}" data-st="${k}">${l}</span>`).join('')}</div><div id="sbody">${pages[tab]()}</div><div class="foot"><span></span><button class="btn pri" data-x id="sdone">Done</button></div>`, true)
  m.id = 'setm'; m.dataset.tab = tab; m.querySelector('.card').scrollTop = keep
  m.addEventListener('input', e => { if (e.target.id === 'sVol') { S.settings.volume = e.target.value / 100; clearTimeout(S._vt); S._vt = setTimeout(async () => { await saveCfg(); beepForce('msg') }, 250) } })
  m.addEventListener('change', async e => { if (e.target.id === 'fcCustom') { me().feedColor = e.target.value; await commitSettings(m, tab); feedSig = ''; settingsDialog(tab) } })
  m.onclick = async e => {
    if (e.target === m || e.target.closest('[data-x]')) { await commitSettings(m, tab); m.remove(); return }
    const st = e.target.closest('[data-st]'); if (st) { await commitSettings(m, tab); settingsDialog(st.dataset.st); return }
    const sn = e.target.closest('[data-snd]'); if (sn) { beepForce(sn.dataset.snd); return }
    const sc = e.target.closest('[data-set]'); if (sc) { S.settings[sc.dataset.set] = sc.dataset.v; await saveCfg(); applyLook(); render(); settingsDialog(tab); return }
    const av = e.target.closest('[data-av]'); if (av) { me().emoji = av.dataset.av; me().img = ''; await commitSettings(m, tab); settingsDialog(tab); return }
    const fcb = e.target.closest('[data-fcol]'); if (fcb) { me().feedColor = fcb.dataset.fcol; await commitSettings(m, tab); feedSig = ''; mainSig = ''; render(); settingsDialog(tab); return }
    const col = e.target.closest('[data-col]'); if (col) { me().color = col.dataset.col; await commitSettings(m, tab); settingsDialog(tab); return }
    const um = e.target.closest('[data-mem="unblock"]'); if (um) { delete S.blocked[um.dataset.u]; await saveCfg(); render(); settingsDialog(tab); return }
    if (e.target.id === 'pPhoto') $('#pFile', m).click()
    if (e.target.id === 'pNoPhoto') { me().img = ''; await commitSettings(m, tab); settingsDialog(tab) }
    if (e.target.id === 'wipe' && confirm('Erase all circles, messages, files and settings from this device? This cannot be undone.')) { await wipeAll(); location.hash = ''; location.reload() }
  }
  m.onchange = async e => {
    const tg = e.target.dataset.tg; if (tg) { S.settings[tg] = e.target.checked; await saveCfg(); if (tg === 'discoverable') startMailbox(); applyLook(); render() }
    if (e.target.id === 'pFile' && e.target.files[0]) { me().img = await resizeImg(e.target.files[0], 128); await commitSettings(m, tab); settingsDialog(tab) }
  }
}
async function commitSettings (m, tab) {
  if (tab === 'profile') {
    const n = $('#pName', m); if (n && n.value.trim()) me().name = n.value.trim().slice(0, 30)
    const st = $('#pStatus', m); if (st) me().status = st.value.trim().slice(0, 60)
    const hd = $('#pHandle', m); if (hd) { const h = slug(hd.value); if (h && h !== me().handle) { toast('Checking if @' + h + ' is free…'); const hit = await handleTaken(h); if (hit) { toast('@' + h + ' is already taken. Try another username.', true) } else { me().handle = h; me().handleAt = Date.now(); startMailbox() } } }
    me().pay = me().pay || {}; $$('[data-pay]', m).forEach(i => { if (i.tagName === 'INPUT') me().pay[i.dataset.pay] = i.value.trim().replace(/^[$@]/, '') })
    pushProfile(); if (mbx) mbx.card.set(cardPayload())
  }
  if (tab === 'network') {
    const s = S.settings; s.giphy = $('#nGif', m).value.trim(); s.webBase = $('#nBase', m).value.trim(); s.relay = $('#nRelayUrl', m).value.trim(); S.relayOk = ''; setTimeout(relayPullAll, 300); setTimeout(setupPush, 600); s.relays = $('#nRel', m).value.trim(); s.turnUrl = $('#nTurn', m).value.trim(); s.turnUser = $('#nTu', m).value.trim(); s.turnPass = $('#nTp', m).value.trim()
  }
  await saveCfg(); render()
}
function resizeImg (file, size) {
  return new Promise(res => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; const k = Math.max(size / img.width, size / img.height); c.getContext('2d').drawImage(img, (size - img.width * k) / 2, (size - img.height * k) / 2, img.width * k, img.height * k); res(c.toDataURL('image/jpeg', .8)) }; img.src = URL.createObjectURL(file) })
}

// ---------- first-run wizard
function wizard () {
  const W = { step: 0, name: '', emoji: AVATARS[Math.floor(Math.random() * AVATARS.length)], color: COLORS[Math.floor(Math.random() * COLORS.length)], img: '', theme: 'midnight', bubble: 'round', profanity: true, shield: 'blur', notif: true, mode: 'create', circle: '', invite: sessionStorage.getItem('orbit-invite') || '' }
  if (W.invite) W.mode = 'join'
  const m = document.createElement('div'); m.className = 'modal'; m.style.background = 'var(--bg)'; document.body.appendChild(m)
  const steps = 5
  const draw = () => {
    const dots = `<div class="dots">${Array.from({ length: steps }, (_, i) => `<i class="${i <= W.step ? 'on' : ''}"></i>`).join('')}</div>`
    let body = ''
    if (W.step === 0) body = `<div style="text-align:center;padding:10px 0"><span class="logo xl"></span><h2 style="font-size:28px">Welcome to Orbit Family &amp; Friends</h2><p class="mute">Chat, share files, make video calls and share your live location with the people you choose. Everything goes directly between your devices. No account, no server in the middle.</p></div>`
    if (W.step === 1) body = `<h2>Who are you?</h2><p class="mute">This is how people in your circles will see you.</p><label class="lbl">Display name</label><input id="wn" value="${esc(W.name)}" placeholder="Your name or nickname" maxlength="30" autofocus>
      <label class="lbl">Avatar</label><div style="display:flex;align-items:center;gap:14px">${avatar({ emoji: W.emoji, color: W.color, img: W.img }, 'lg')}<div><div class="avpick">${AVATARS.slice(0, 10).map(a => `<span class="${W.emoji === a && !W.img ? 'on' : ''}" data-av="${a}">${a}</span>`).join('')}</div></div></div><div class="colors">${COLORS.map(c => `<i class="${W.color === c ? 'on' : ''}" data-col="${c}" style="background:${c}"></i>`).join('')}</div><button class="btn sm" id="wp">Use a photo instead</button><input type="file" id="wf" accept="image/*" hidden>`
    if (W.step === 2) body = `<h2>Pick a look</h2><p class="mute">You can change this any time in Settings.</p><div class="chips">${THEMES.map(([id, n, g]) => `<div class="swatch ${W.theme === id ? 'on' : ''}" data-th="${id}"><i style="background:${g}"></i>${n}</div>`).join('')}</div><label class="lbl">Bubble shape</label><div class="chips">${[['round', 'Rounded'], ['pill', 'Pill'], ['square', 'Square']].map(([k, l]) => `<span class="chip ${W.bubble === k ? 'on' : ''}" data-bb="${k}">${l}</span>`).join('')}</div>`
    if (W.step === 3) body = `<h2>Safety and comfort</h2><p class="mute">Set your defaults. All of these can be changed later.</p>
      <div class="tgl"><div>Hide profanity<small>Swear words are masked until you tap them</small></div><label class="sw"><input type="checkbox" id="wpf" ${W.profanity ? 'checked' : ''}><span></span></label></div>
      <label class="lbl">Sensitive image shield</label><div class="chips">${[['blur', 'Blur adult images'], ['block', 'Block adult images'], ['off', 'Off']].map(([k, l]) => `<span class="chip ${W.shield === k ? 'on' : ''}" data-sh="${k}">${l}</span>`).join('')}</div>
      <div class="tgl"><div>Notifications<small>Alert me about new messages and calls</small></div><label class="sw"><input type="checkbox" id="wnt" ${W.notif ? 'checked' : ''}><span></span></label></div>
      <p class="mute sm" style="margin-top:10px">Location is never shared unless you start it, choose who sees it, and set a timer. You can remove or block anyone, any time.</p>`
    if (W.step === 4) body = `<h2>Start your first circle</h2><p class="mute">A circle is a private space for a group. Create one and invite people, or join one with an invite.</p><div class="chips" style="margin-bottom:12px"><span class="chip ${W.mode === 'create' ? 'on' : ''}" data-md="create">Create a circle</span><span class="chip ${W.mode === 'join' ? 'on' : ''}" data-md="join">I have an invite</span><span class="chip ${W.mode === 'skip' ? 'on' : ''}" data-md="skip">Skip for now</span></div>
      ${W.mode === 'create' ? `<input id="wc" value="${esc(W.circle)}" placeholder="Family, Friends, Road trip…" maxlength="60">` : ''}${W.mode === 'join' ? `<textarea id="wi" rows="3" placeholder="Paste an invite code or link">${esc(W.invite)}</textarea>` : ''}`
    m.innerHTML = `<div class="card">${dots}${body}<div class="foot">${W.step ? '<button class="btn" id="wb">Back</button>' : '<span></span>'}<button class="btn pri" id="wn2">${W.step === steps - 1 ? 'Finish' : W.step === 0 ? 'Get started' : 'Next'}</button></div></div>`
    if (W.step === 1) { const i = $('#wn', m); i && i.focus() }
  }
  const grab = () => {
    if (W.step === 1) { const v = $('#wn', m); if (v) W.name = v.value }
    if (W.step === 3) { W.profanity = $('#wpf', m).checked; W.notif = $('#wnt', m).checked }
    if (W.step === 4) { const c = $('#wc', m); if (c) W.circle = c.value; const i = $('#wi', m); if (i) W.invite = i.value }
  }
  m.onclick = async e => {
    const t = e.target
    if (t.dataset.av) { grab(); W.emoji = t.dataset.av; W.img = ''; draw() }
    else if (t.dataset.col) { grab(); W.color = t.dataset.col; draw() }
    else if (t.dataset.th) { W.theme = t.dataset.th; S.settings.theme = W.theme; applyLook(); draw() }
    else if (t.dataset.bb) { W.bubble = t.dataset.bb; S.settings.bubble = W.bubble; applyLook(); draw() }
    else if (t.dataset.sh) { grab(); W.shield = t.dataset.sh; draw() }
    else if (t.dataset.md) { grab(); W.mode = t.dataset.md; draw() }
    else if (t.id === 'wp') $('#wf', m).click()
    else if (t.id === 'wb') { grab(); W.step--; draw() }
    else if (t.id === 'wn2') {
      grab()
      if (W.step === 1 && !W.name.trim()) { toast('Please enter a name.', true); return }
      if (W.step === 4) {
        if (W.mode === 'join' && !parseInvite(W.invite)) { toast('That invite is not valid.', true); return }
        S.me = { name: W.name.trim(), emoji: W.emoji, color: W.color, img: W.img, status: '', pay: {}, handle: slug(W.name) || 'user' + uid().slice(0, 5), handleAt: Date.now() }
        Object.assign(S.settings, { theme: W.theme, bubble: W.bubble, profanity: W.profanity, shield: W.shield, notif: W.notif })
        await saveCfg(); applyLook(); m.remove(); sessionStorage.removeItem('orbit-invite'); startMailbox()
        if (W.notif && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission()
        render()
        await permDialog()
        if (W.mode === 'create') { await createCircle(W.circle || 'My Circle'); inviteDialog() } else if (W.mode === 'join') await joinByInvite(W.invite)
        return
      }
      W.step++; draw()
    }
  }
  m.onchange = async e => { if (e.target.id === 'wf' && e.target.files[0]) { W.img = await resizeImg(e.target.files[0], 128); draw() } }
  m.onkeydown = e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') $('#wn2', m).click() }
  draw()
}

// ===================================================================== GIF / emoji pickers
let pop = null
function closePop () { if (pop) { pop.remove(); pop = null } }
function showPop (el) { closePop(); pop = el; $('#composer').appendChild(el) }
function emojiPop () {
  const wrap = document.createElement('div'); wrap.className = 'pop'
  const p = document.createElement('emoji-picker'); p.dataSource = './emoji/data.json'; wrap.appendChild(p)
  p.addEventListener('emoji-click', e => { const ta = $('#msg'); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + e.detail.unicode + ta.value.slice(ta.selectionEnd); ta.focus(); ta.selectionStart = ta.selectionEnd = s + e.detail.unicode.length })
  showPop(wrap)
}
function gifPop () {
  const wrap = document.createElement('div'); wrap.className = 'pop gifs'
  wrap.innerHTML = `<div style="display:flex;gap:6px"><input id="gq" placeholder="${S.settings.giphy ? 'Search GIFs…' : 'Paste a GIF link, or add a Giphy key in Settings'}"><button class="btn sm" id="gup" title="Upload a GIF">Upload</button></div><div class="gifgrid" id="gg"></div><input type="file" id="gfile" accept="image/gif,image/webp,video/mp4" hidden>`
  showPop(wrap)
  const grid = $('#gg', wrap); let tm
  const sendUrl = async url => { try { const r = await fetch(url); const b = await r.blob(); closePop(); sendFile(new File([b], 'orbit.gif', { type: b.type || 'image/gif' })) } catch { toast('Could not fetch that GIF. Try uploading it instead.', true) } }
  const load = async q => {
    if (!S.settings.giphy) { grid.innerHTML = '<div class="mute sm">Add a free Giphy API key in Settings > Network to search GIFs here. You can also paste a direct GIF link above and press Enter, or tap Upload.</div>'; return }
    try {
      const u = q ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(S.settings.giphy)}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13` : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(S.settings.giphy)}&limit=24&rating=pg-13`
      const j = await (await fetch(u)).json(); grid.innerHTML = (j.data || []).map(g => `<img loading="lazy" src="${g.images.fixed_width_small.url}" data-full="${g.images.downsized.url}">`).join('') || '<div class="mute sm">No GIFs found.</div>'
    } catch { grid.innerHTML = '<div class="mute sm">GIF search is unavailable. Check your key and connection.</div>' }
  }
  load('')
  $('#gq', wrap).oninput = e => { clearTimeout(tm); tm = setTimeout(() => load(e.target.value.trim()), 400) }
  $('#gq', wrap).onkeydown = e => { const v = e.target.value.trim(); if (e.key === 'Enter' && /^https?:\/\//.test(v)) sendUrl(v) }
  grid.onclick = e => { const i = e.target.closest('img'); if (i) sendUrl(i.dataset.full) }
  $('#gup', wrap).onclick = () => $('#gfile', wrap).click()
  $('#gfile', wrap).onchange = e => { const f = e.target.files[0]; if (f) { closePop(); sendFile(f) } }
}

// ---------- voice messages
let vrec = null
async function voiceToggle () {
  const btn = $('#voiceBtn')
  if (vrec) { vrec.rec.stop(); return }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const chunks = []
    const mt = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) || ''
    const rec = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined); vrec = { rec }
    rec.ondataavailable = e => e.data.size && chunks.push(e.data)
    rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); const type = (rec.mimeType || 'audio/webm').split(';')[0]; vrec = null; btn.innerHTML = ic('mic', 22); btn.classList.remove('on'); if (chunks.length) sendFile(new File([new Blob(chunks, { type })], 'voice-message.' + (type.includes('mp4') ? 'm4a' : 'webm'), { type })) }
    rec.start(); btn.innerHTML = ic('stop', 22); btn.classList.add('on'); toast('Recording… tap again to send.')
  } catch (e) { toast('Microphone not available: ' + (e.message || e.name), true) }
}

// ===================================================================== events
function openPay (kind, v) {
  const urls = { cashapp: `https://cash.app/$${encodeURIComponent(v)}`, venmo: `https://venmo.com/${encodeURIComponent(v)}`, paypal: `https://paypal.me/${encodeURIComponent(v)}` }
  if (kind === 'zelle') { const m = modal(`<h2>Pay with Zelle</h2><p class="mute">Zelle has no payment links. Copy this and send it from your bank's app.</p><input readonly value="${esc(v)}"><p class="mute sm">Only pay people you know. Payments usually can't be reversed.</p><div class="foot"><button class="btn" data-x>Close</button><button class="btn pri" id="cz">Copy</button></div>`); $('#cz', m).onclick = () => { navigator.clipboard.writeText(v); toast('Copied') }; return }
  const m = modal(`<h2>Open ${kind === 'cashapp' ? 'Cash App' : kind === 'venmo' ? 'Venmo' : 'PayPal'}?</h2><p class="mute">You are leaving Orbit to pay <b>${esc(v)}</b>. Orbit never sees or handles the money.</p><p style="color:var(--warn)">⚠ Only pay people you know and trust. Scammers often ask for payment in chats, and payments can't be reversed.</p><div class="foot"><button class="btn" data-x>Cancel</button><button class="btn pri" id="gp">Continue</button></div>`)
  $('#gp', m).onclick = () => { window.open(urls[kind], '_blank', 'noopener'); m.remove() }
}
function openLink (url) {
  const k = linkRisk(url)
  if (!k.why.length) return window.open(url, '_blank', 'noopener,noreferrer')
  const m = modal(`<h2>Open this link?</h2><p class="mute">${esc(k.host || url)}</p><ul>${k.why.map(w => `<li style="color:var(--warn)">This link ${esc(w)}</li>`).join('')}</ul><div class="foot"><button class="btn pri" data-x>Don't open</button><button class="btn" id="go">Open anyway</button></div>`)
  $('#go', m).onclick = () => { window.open(url, '_blank', 'noopener,noreferrer'); m.remove() }
}
function lightbox (id) {
  const okImg = (f, from) => blobs[f.id] && ['image', 'video'].includes(fileKind(f.type, f.name)) && (from === S.uid || S.settings.shield === 'off' || shield[f.id] === 'ok' || S.revealImg.has(f.id))
  let imgs
  if (S.view === 'feed') imgs = feedItems().filter(it => it.file && okImg(it.file, it.from)).map(it => ({ file: it.file }))
  else { const r = cur(); if (!r) return; imgs = r.msgs.filter(m => m.file && m.kind !== 'comment' && okImg(m.file, m.from)).map(m => ({ file: m.file })) }
  let i = Math.max(0, imgs.findIndex(m => m.file.id === id))
  const lb = $('#lb')
  const show = () => { const m = imgs[i]; if (!m) return; const k = fileKind(m.file.type, m.file.name); lb.innerHTML = `<button class="ib" style="position:fixed;right:16px;top:12px;color:#fff" id="lbx" title="Close">${ic('x', 28)}</button><button class="ib" style="position:fixed;right:64px;top:14px;color:#fff" id="lbs" title="Save to device">${ic('down', 26)}</button>${imgs.length > 1 ? `<button class="ib" id="lbp" style="position:fixed;left:14px;color:#fff" title="Previous">${ic('back', 36)}</button><button class="ib" id="lbn" style="position:fixed;right:14px;color:#fff;transform:scaleX(-1)" title="Next">${ic('back', 36)}</button>` : ''}${k === 'video' ? `<video src="${blobs[m.file.id].url}" controls autoplay></video>` : `<img src="${blobs[m.file.id].url}">`}<div style="position:fixed;bottom:14px;color:#ccc">${esc(m.file.name)} · ${fmtB(m.file.size)} · <a href="${blobs[m.file.id].url}" download="${esc(m.file.name)}" style="color:#fff">Save</a></div>` }
  lb.classList.add('on'); show()
  lb.onclick = e => { const bt = e.target.closest('button'); if ((bt && bt.id === 'lbx') || e.target === lb) { lb.classList.remove('on'); lb.innerHTML = ''; return } if (bt && bt.id === 'lbs') { saveMedia(imgs[i].file.id); return } if (bt && bt.id === 'lbp') { i = (i - 1 + imgs.length) % imgs.length; show() } if (bt && bt.id === 'lbn') { i = (i + 1) % imgs.length; show() } }
}
async function textPreview (fid) {
  const b = await fileGet(fid); if (!b) return; const t = await b.slice(0, 200000).text()
  const m = modal(`<h2>Preview</h2><pre style="white-space:pre-wrap;word-break:break-word;max-height:60vh;overflow:auto;background:var(--bg2);padding:12px;border-radius:10px"></pre><div class="foot"><span></span><button class="btn" data-x>Close</button></div>`); $('pre', m).textContent = t
}

document.addEventListener('click', async e => {
  const t = e.target
  const a = t.closest('[data-a]')?.dataset.a
  if (a) {
    closePopIf(a)
    if (a === 'new') newDialog()
    else if (a === 'join') joinDialog()
    else if (a === 'settings') settingsDialog()
    else if (a === 'stopall') Object.keys(myShares).forEach(id => stopShare(id))
    else if (a === 'back') { S.mobileChat = false; S.panel = false; render() }
    else if (a === 'panel') { S.panel = !S.panel; render() }
    else if (a === 'prof') { S.settings.profanity = !S.settings.profanity; await saveCfg(); render() }
    else if (a === 'call') joinCall(S.active)
    else if (a === 'callv') joinCall(S.active, { video: false })
    else if (a === 'loc') locDialog()
    else if (a === 'stoploc') stopShare(S.active)
    else if (a === 'invite') inviteDialog()
    else if (a === 'find') findDialog()
    else if (a === 'fixloc') { const r2 = cur(); const sh = r2 && myShares[r2.c.id]; if (sh) pickSpotDialog(r2.c.id, sh.to, Math.max(60000, sh.until - Date.now()), sh.all) }
    else if (a === 'openmap') { S.panel = true; S.tab = 'map'; render() }
    else if (a === 'noreply') { S.reply = null; renderMain() }
    else if (a === 'send') { submitComposer($('#msg')) }
    else if (a === 'noedit') cancelEdit()
    else if (a === 'emoji') pop ? closePop() : emojiPop()
    else if (a === 'gif') pop ? closePop() : gifPop()
    else if (a === 'attach') $('#fileIn').click()
    else if (a === 'voice') voiceToggle()
    else if (a === 'studio') openStudio({ onSend: f => sendFile(f), maxSeconds: 60 })
    return
  }
  if (!t.closest('#ctx')) closeCtx()
  if (S.lpFired && Date.now() - S.lpFired < 600) { S.lpFired = 0; return }
  const mmb = t.closest('[data-mm]'); if (mmb) { const r2 = cur(); const m2 = r2 && r2.msgs.find(x => x.id === mmb.dataset.mm); if (m2) { const bb = mmb.getBoundingClientRect(); msgMenu(bb.left - 150, bb.bottom + 4, r2, m2) } return }
  const rg = t.closest('[data-ring]'); if (rg) { const mode = rg.dataset.ring; const cid = rg.dataset.cid; hideRing(); if (mode !== 'no' && R[cid]) { S.view = 'chats'; openCircle(cid); joinCall(cid, { video: mode === 'video' }) } return }
  const rmb = t.closest('[data-rm]'); if (rmb) { const bb = rmb.getBoundingClientRect(); return rowMenu(bb.left, bb.bottom + 4, rmb.dataset.rm) }
  const smb = t.closest('[data-sm]'); if (smb) { const [cid, mid] = smb.dataset.sm.split('|'); return jumpTo(cid, mid) }
  const pp = t.closest('.npop'); if (pp) { if (t.closest('[data-popx]')) pp.remove(); else { const cid = pp.dataset.pc; pp.remove(); if (S.circles.find(x => x.id === cid)) { S.view = 'chats'; openCircle(cid) } } return }
  const ia = t.closest('[data-ia]'); if (ia) { const it = S.invites.splice(+ia.dataset.ia, 1)[0]; if (it && ia.dataset.iv === 'yes') await joinByInvite(it.code, { dm: it.dm, name: it.name, from: it.from }); renderList(); return }
  const dcb = t.closest('[data-dc]'); if (dcb) { e.stopPropagation(); return deleteCircleDialog(dcb.dataset.dc) }
  const mnb = t.closest('[data-mn]'); if (mnb) { if (mnb.dataset.mn === 'feed') { S.view = 'feed'; S.feedNew = 0; S.mobileChat = true; feedSig = '' } else { S.view = 'chats'; S.mobileChat = false } render(); return }
  const seg = t.closest('[data-v]'); if (seg) { S.view = seg.dataset.v; if (S.view === 'feed') { S.feedNew = 0; S.mobileChat = true; feedSig = '' } else if (!S.active && S.circles[0]) S.active = S.circles[0].id; render(); return }
  const c = t.closest('[data-c]'); if (c && (c.classList.contains('crow') || c.classList.contains('on1'))) { S.view = 'chats'; return openCircle(c.dataset.c) }
  const ff = t.closest('[data-ff]'); if (ff) { S.feedFilter = ff.dataset.ff; feedSig = ''; renderFeed(); return }
  const au = t.closest('[data-aud]'); if (au) { const d = S.postDraft; d.cids = d.cids || new Set(S.circles.map(x => x.id)); d.cids.has(au.dataset.aud) ? d.cids.delete(au.dataset.aud) : d.cids.add(au.dataset.aud); feedSig = ''; renderFeed(); return }
  const pa = t.closest('[data-pa]'); if (pa) {
    const k = pa.dataset.pa
    if (k === 'photo') $('#pfile').click()
    if (k === 'cam') openStudio({ onSend: f => { S.postDraft.file = f; feedSig = ''; renderFeed() }, maxSeconds: 60 })
    if (k === 'rmfile') { S.postDraft.file = null; feedSig = ''; renderFeed() }
    if (k === 'post') sendPost()
    return
  }
  const sv = t.closest('[data-sv]'); if (sv) return saveMedia(sv.dataset.sv)
  const lk2 = t.closest('[data-like]'); if (lk2) return toggleLike(lk2.dataset.like)
  const cmt = t.closest('[data-cmt]'); if (cmt) { const id = cmt.dataset.cmt; S.feedOpen.has(id) ? S.feedOpen.delete(id) : S.feedOpen.add(id); feedSig = ''; renderFeed(); return }
  const csb = t.closest('[data-cs]'); if (csb) return sendComment(csb.dataset.cs)
  const dp = t.closest('[data-delpost]'); if (dp) return deletePost(dp.dataset.delpost)
  const tab = t.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; return renderPanel() }
  const act = t.closest('[data-act]')
  if (act) {
    const r = cur(); const m = r.msgs.find(x => x.id === act.dataset.m)
    if (act.dataset.act === 'reply' && m) { S.reply = m; renderMain(); $('#msg').focus() }
    if (act.dataset.act === 'react' && m) { const has = (m.reacts[act.dataset.e] || []).includes(S.uid); applyReact(r, m.id, act.dataset.e, S.uid, !has); r.A.react.send({ mid: m.id, e: act.dataset.e, on: !has }).catch(() => {}) }
    if (act.dataset.act === 'del' && m && confirm('Delete this message for everyone?')) { removeMsg(r, m.id, S.uid); r.A.del.send({ id: m.id }).catch(() => {}) }
    if (act.dataset.act === 'edit' && m) startEdit(r, m)
    if (act.dataset.act === 'save' && m && m.file) saveMedia(m.file.id)
    if (act.dataset.act === 'block') blockUser(act.dataset.u)
    return
  }
  const rx = t.closest('[data-rx]'); if (rx) { const r = cur(); const m = r.msgs.find(x => x.id === rx.dataset.m); const has = (m.reacts[rx.dataset.rx] || []).includes(S.uid); applyReact(r, m.id, rx.dataset.rx, S.uid, !has); r.A.react.send({ mid: m.id, e: rx.dataset.rx, on: !has }).catch(() => {}); return }
  const rev = t.closest('[data-rev]'); if (rev) { S.revealProf.add(rev.dataset.rev); if (S.view === 'feed') { feedSig = ''; renderFeed() } else renderChat(); return }
  const rvi = t.closest('[data-rvimg]'); if (rvi) { S.revealImg.add(rvi.dataset.rvimg); if (S.view === 'feed') renderFeed(); else { renderChat(); renderPanel() } return }
  const lbx = t.closest('[data-lb]'); if (lbx) return lightbox(lbx.dataset.lb)
  const dl = t.closest('[data-dl]'); if (dl) { for (const r of Object.values(R)) { const m = r.msgs.find(x => x.id === dl.dataset.dl); if (m) { tryFetch(r, m, null, true); break } } return }
  const tx = t.closest('[data-txt]'); if (tx) return textPreview(tx.dataset.txt)
  const lk = t.closest('a[data-url]'); if (lk) { e.preventDefault(); return openLink(lk.dataset.url) }
  const pay = t.closest('[data-pay]'); if (pay && pay.tagName === 'BUTTON') return openPay(pay.dataset.pay, pay.dataset.v)
  const mem = t.closest('[data-mem]'); if (mem) {
    const u = mem.dataset.u; const r = cur()
    if (mem.dataset.mem === 'block') blockUser(u)
    if (mem.dataset.mem === 'unblock') { delete S.blocked[u]; await saveCfg(); render() }
    if (mem.dataset.mem === 'dm') { const pr = r.peers[u]; if (!pr) { toast('They are offline right now.', true); return } startDM({ uid: u, ...profOf(r, u), send: pl => r.A.inv.send(pl, { target: pr }) }); return }
    if (mem.dataset.mem === 'ban' && confirm(`Remove ${profOf(r, u).name} from "${r.c.name}"? They will no longer be able to read or send anything here.`)) { try { await r.room.ban(u, { reason: 'removed by admin' }); const nm = profOf(r, u).name; delete r.users[u]; delete r.c.members[u]; saveCfg(); sysMsg(r, nm + ' was removed.'); render() } catch (er) { toast('Could not remove: ' + er.message, true) } }
    return
  }
  const bg = t.closest('[data-bg]'); if (bg) { const r = cur(); if (bg.dataset.bg === 'upload') return $('#bgFile').click(); r.c.bg = { ...(r.c.bg || {}), id: bg.dataset.bg }; await saveCfg(); applyBg(); renderPanel(); return }
  const ttl = t.closest('[data-ttl]'); if (ttl) { $$('[data-ttl]').forEach(x => x.classList.toggle('on', x === ttl)); return }
  const lv = t.closest('[data-lv]'); if (lv) return leaveCircle(lv.dataset.lv)
  if (t.id === 'cSave') { const r = cur(); const on = $('[data-ttl].on'); const name = $('#cName').value.trim().slice(0, 60) || r.c.name; try { await r.cstate.set({ name, ttl: on ? +on.dataset.ttl : 0 }); toast('Saved') } catch (er) { toast('Only the admin can change this.', true) } return }
  if (t.id === 'bShot') return
  if (pop && !t.closest('.pop') && !t.closest('[data-a]')) closePop()
})
function closePopIf (a) { if (!['emoji', 'gif'].includes(a)) closePop() }
document.addEventListener('input', e => { if (e.target.id === 'bgDim' || e.target.id === 'bgBlur') { const r = cur(); r.c.bg = { ...(r.c.bg || {}), dim: $('#bgDim').value / 100, blur: +$('#bgBlur').value }; applyBg(); saveCfg() } })
document.addEventListener('change', async e => {
  if (e.target.id === 'bgFile' && e.target.files[0]) { const r = cur(); await filePut('bg:' + r.c.id, e.target.files[0]); r.c.bg = { ...(r.c.bg || {}), id: 'custom' }; await saveCfg(); applyBg(); renderPanel() }
})
async function blockUser (u) {
  const r = cur(); const p = r ? profOf(r, u) : { name: u }
  if (!confirm(`Block ${p.name}? You won't see their messages, files, calls or location in any circle. You can unblock them in Settings.`)) return
  S.blocked[u] = { name: p.name, ts: Date.now() }; await saveCfg(); dropTiles(u); Object.values(R).forEach(x => { delete x.locs[u]; delete x.callUsers[u] }); render(); toast(p.name + ' is blocked.')
}
$('#callEnd').innerHTML = ic('phoneoff', 22); $('#bScreen').innerHTML = ic('monitor', 22); $('#bInv').innerHTML = ic('userplus', 22)
$('#cDock').innerHTML = ic('panel', 16); $('#cMin').innerHTML = ic('down', 16); $('#cMax').innerHTML = ic('expand', 16)
$('#callEnd').onclick = () => leaveCall($('#call').dataset.cid)
$('#bMic').onclick = toggleMic
$('#bCam').onclick = () => { const r = R[$('#call').dataset.cid]; if (r && r.call) setCamera(r, !r.call.camOn) }
$('#bScreen').onclick = shareScreen
$('#bInv').onclick = e => { e.stopPropagation(); callInviteMenu(e.currentTarget) }
$('#cDock').onclick = () => { S.callSize = (S.callSize || 'dock') === 'dock' ? 'md' : 'dock'; updateCallBtns() }
$('#cMin').onclick = () => { S.callSize = S.callSize === 'sm' ? 'md' : 'sm'; updateCallBtns() }
$('#cMax').onclick = () => { S.callSize = S.callSize === 'lg' ? 'md' : 'lg'; updateCallBtns() }
if (location.hostname === '127.0.0.1' && +location.port >= 47821 && +location.port < 47831) { const pg = () => fetch('__ping').catch(() => {}); pg(); setInterval(pg, 10000); addEventListener('pagehide', () => { try { navigator.sendBeacon('__bye') } catch {} }) }
window.addEventListener('beforeunload', () => Object.keys(myShares).forEach(id => stopShare(id, true)))

// ===================================================================== boot
function permDialog () {
  return new Promise(res => {
    const m = modal(`<h2>Allow Orbit to use your location?</h2><p class="mute">This lets you share where you are with people in your circles. It only happens when you press <b>Share location</b>, only people you choose can see it, and you can stop any time. You can change this later in Settings.</p>
      <div class="stackbtns"><button class="btn pri" id="pmOk">${ic('pin', 16)} Allow location</button><button class="btn" id="pmNo">Not now</button></div>`)
    S.settings.permAsked = true; saveCfg()
    const done = () => { m.remove(); res() }
    $('#pmNo', m).onclick = done
    $('#pmOk', m).onclick = () => {
      $('#pmOk', m).disabled = true; $('#pmOk', m).textContent = 'Checking…'
      if (!geo.ok) { toast('Location is not available on this device.', true); return done() }
      geo.get(() => { S.settings.locOk = true; saveCfg(); toast('Location allowed. You can share it from any chat.'); done() },
        e => { toast('Could not turn on location: ' + (e.message || 'denied') + '. On Windows, enable Location services in Settings → Privacy.', true); done() }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 })
    }
    m.addEventListener('click', e => { if (e.target === m) done() })
  })
}
async function boot () {
  try { if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) document.body.classList.add('native') } catch { /* ignore */ }
  const cfg = await kvGet('cfg')
  if (cfg) { S.me = cfg.me; Object.assign(S.settings, cfg.settings || {}); S.circles = cfg.circles || []; S.blocked = cfg.blocked || {} }
  applyLook()
  const hash = location.hash.startsWith('#join=') ? location.hash : ''
  if (hash) { sessionStorage.setItem('orbit-invite', hash); history.replaceState(null, '', location.pathname + location.search) }
  if (!S.me) { render(); wizard(); return }
  if (!S.me.handle) { S.me.handle = slug(S.me.name) || 'user' + uid().slice(0, 5); S.me.handleAt = Date.now(); await saveCfg() }
  if (!S.me.handleAt) { S.me.handleAt = Date.now(); await saveCfg() }
  render()
  startMailbox()
  if (!S.settings.permAsked) setTimeout(permDialog, 1200)
  for (const c of S.circles) connect(c).catch(e => console.error(e))
  setTimeout(relayPullAll, 2500); setTimeout(setupPush, 4000)
  const inv = sessionStorage.getItem('orbit-invite'); if (inv) { sessionStorage.removeItem('orbit-invite'); await joinByInvite(inv) }
  if (!S.active && S.circles[0] && window.innerWidth > 820) openCircle(S.circles[0].id)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {})
  window.__orbit = { S, R, relayPullAll, relayInit }
}
// ---- context menus, long-press, keyboard, search box
const msgFromEl = el => { const mm = el.closest('.m'); const r = cur(); if (!mm || !r) return null; return { r, m: r.msgs.find(x => x.id === mm.id.slice(2)) } }
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.crow[data-c]'); if (row) { e.preventDefault(); return rowMenu(e.clientX, e.clientY, row.dataset.c) }
  const bub = e.target.closest('#chat .bub'); if (bub && !e.target.closest('a,video,audio')) { const x = msgFromEl(bub); if (x && x.m && x.m.kind !== 'sys') { e.preventDefault(); msgMenu(e.clientX, e.clientY, x.r, x.m) } }
})
let lpT = null
document.addEventListener('touchstart', e => {
  const bub = e.target.closest('#chat .bub'); const row = e.target.closest('.crow[data-c]'); if (!bub && !row) return
  const t0 = e.touches[0]; clearTimeout(lpT)
  lpT = setTimeout(() => {
    if (navigator.vibrate) navigator.vibrate(15)
    if (row) { S.lpFired = Date.now(); rowMenu(t0.clientX, t0.clientY, row.dataset.c); return }
    const x = msgFromEl(bub); if (x && x.m && x.m.kind !== 'sys') { S.lpFired = Date.now(); msgMenu(t0.clientX, t0.clientY, x.r, x.m) }
  }, 450)
}, { passive: true })
for (const ev of ['touchend', 'touchmove', 'touchcancel']) document.addEventListener(ev, () => clearTimeout(lpT), { passive: true })
document.addEventListener('input', e => { if (e.target.id === 'sq') { S.q = e.target.value; renderList() } })
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); S.mobileChat = false; render(); const i = $('#sq'); i && i.focus(); return }
  if (e.key === 'Escape') {
    if ($('#ctx')) return closeCtx()
    if (S.editing) { cancelEdit(); return }
    if (S.reply && document.activeElement && document.activeElement.id === 'msg') { S.reply = null; renderMain(); return }
    const lb = $('#lb'); if (lb && lb.classList.contains('on')) { lb.classList.remove('on'); lb.innerHTML = ''; return }
    const md = [...document.querySelectorAll('.modal')].pop(); if (md && md.id !== 'wiz') return md.remove()
    if (S.q) { S.q = ''; renderList() }
    return
  }
  if (e.key === 'ArrowUp' && e.target.id === 'msg' && !e.target.value) {
    const r = cur(); const m = r && [...r.msgs].reverse().find(x => x.from === S.uid && x.kind === 'text'); if (m) { e.preventDefault(); startEdit(r, m) }
  }
})
document.addEventListener('visibilitychange', () => { const r = cur(); if (r && !document.hidden) sendSeen(r) })
addEventListener('focus', () => { const r = cur(); if (r) sendSeen(r) })

boot()
