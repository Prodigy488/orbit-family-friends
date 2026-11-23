import { ic } from './icons.js'
// Camera Studio: photo + short-video capture with live filters, stickers and captions.
// Filters are drawn on a canvas, so the recorded file contains the effect (what you see is what you send).
const HAS_FILTER = (() => { try { return 'filter' in document.createElement('canvas').getContext('2d') } catch { return false } })()

const FILTERS = [
  { id: 'none', name: 'Normal', css: '' },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.55) contrast(1.1)' },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.25)', post: (c, w, h) => vignette(c, w, h, 0.55) },
  { id: 'vintage', name: 'Vintage', css: 'sepia(.55) contrast(.95) saturate(1.2)', post: (c, w, h, t) => { vignette(c, w, h, .45); grain(c, w, h, .12) } },
  { id: 'warm', name: 'Warm', css: 'sepia(.25) saturate(1.4) brightness(1.05)', post: (c, w, h) => tint(c, w, h, 'rgba(255,150,60,.14)') },
  { id: 'cool', name: 'Cool', css: 'saturate(1.2) hue-rotate(-12deg)', post: (c, w, h) => tint(c, w, h, 'rgba(60,140,255,.16)') },
  { id: 'dream', name: 'Dreamy', css: 'brightness(1.08) saturate(1.2)', pre: 'glow' },
  { id: 'smooth', name: 'Smooth', css: 'brightness(1.04)', pre: 'smooth' },
  { id: 'neon', name: 'Neon', css: 'contrast(1.35) saturate(2)', post: (c, w, h) => { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, 'rgba(255,0,200,.35)'); g.addColorStop(1, 'rgba(0,220,255,.35)'); c.globalCompositeOperation = 'overlay'; c.fillStyle = g; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over' } },
  { id: 'pixel', name: 'Pixel', pre: 'pixel' },
  { id: 'glitch', name: 'Glitch', pre: 'glitch' },
  { id: 'vhs', name: 'VHS', css: 'saturate(1.3) contrast(1.1)', post: (c, w, h, t) => { scan(c, w, h); grain(c, w, h, .18); tint(c, w, h, 'rgba(120,80,255,.08)') } },
  { id: 'mirror', name: 'Mirror', pre: 'mirror' },
  { id: 'fade', name: 'Fade', css: 'contrast(.85) brightness(1.15) saturate(.8)' }
]

function vignette (c, w, h, a) { const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); c.fillStyle = g; c.fillRect(0, 0, w, h) }
function tint (c, w, h, col) { c.globalCompositeOperation = 'overlay'; c.fillStyle = col; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over' }
function scan (c, w, h) { c.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1) }
let grainCv
function grain (c, w, h, a) {
  if (!grainCv) { grainCv = document.createElement('canvas'); grainCv.width = grainCv.height = 128 }
  const g = grainCv.getContext('2d'); const d = g.createImageData(128, 128)
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 }
  g.putImageData(d, 0, 0)
  c.globalAlpha = a; c.globalCompositeOperation = 'overlay'
  for (let x = 0; x < w; x += 128) for (let y = 0; y < h; y += 128) c.drawImage(grainCv, x, y)
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'
}

// draws the camera frame into (cx) at size w x h with "cover" fit, applying the chosen filter
function paint (cx, video, w, h, f, mirrorSelf, t, tmp) {
  const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return
  const k = Math.max(w / vw, h / vh); const dw = vw * k, dh = vh * k; const dx = (w - dw) / 2, dy = (h - dh) / 2
  cx.save()
  if (mirrorSelf) { cx.translate(w, 0); cx.scale(-1, 1) }
  cx.filter = HAS_FILTER && f.css ? f.css : 'none'
  if (f.pre === 'pixel') {
    const s = 0.045; const tw = Math.max(8, w * s | 0), th = Math.max(8, h * s | 0)
    tmp.width = tw; tmp.height = th; tmp.getContext('2d').drawImage(video, 0, 0, vw, vh, 0, 0, tw, th)
    cx.imageSmoothingEnabled = false; cx.drawImage(tmp, 0, 0, tw, th, 0, 0, w, h); cx.imageSmoothingEnabled = true
  } else if (f.pre === 'glitch') {
    cx.drawImage(video, dx, dy, dw, dh)
    const n = 3 + (t / 120 | 0) % 3
    for (let i = 0; i < n; i++) {
      const sy = ((Math.sin(t / 200 + i * 7) * .5 + .5) * h) | 0; const sh = 12 + (i * 17) % 40; const off = (Math.sin(t / 90 + i) * 28) | 0
      cx.drawImage(cx.canvas, 0, sy, w, sh, off, sy, w, sh)
    }
    cx.globalCompositeOperation = 'screen'; cx.globalAlpha = .35
    cx.drawImage(video, dx + 6, dy, dw, dh); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'
  } else if (f.pre === 'mirror') {
    cx.drawImage(video, dx, dy, dw, dh)
    cx.restore(); cx.save(); cx.translate(w, 0); cx.scale(-1, 1)
    cx.drawImage(cx.canvas, 0, 0, w / 2, h, 0, 0, w / 2, h)
  } else {
    cx.drawImage(video, dx, dy, dw, dh)
    if (f.pre === 'glow') { cx.filter = HAS_FILTER ? 'blur(10px) brightness(1.3)' : 'none'; cx.globalCompositeOperation = 'screen'; cx.globalAlpha = .45; cx.drawImage(video, dx, dy, dw, dh); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over' }
    if (f.pre === 'smooth') { cx.filter = HAS_FILTER ? 'blur(3px)' : 'none'; cx.globalAlpha = .45; cx.drawImage(video, dx, dy, dw, dh); cx.globalAlpha = 1 }
  }
  cx.restore(); cx.filter = 'none'
  if (f.post) f.post(cx, w, h, t)
}

const STICKERS = ['😀', '😍', '😎', '🥳', '🔥', '❤️', '✨', '👑', '🌈', '🎉', '👀', '💯', '🐶', '🐱', '🦄', '🍕']
const ASPECTS = { '9:16': 9 / 16, '1:1': 1, '16:9': 16 / 9 }

export function openStudio ({ onSend, maxSeconds = 60 }) {
  const root = document.createElement('div')
  root.className = 'modal'; root.style.background = '#05070b'; root.style.padding = '0'
  root.innerHTML = `
  <div id="st" style="display:flex;flex-direction:column;width:100%;height:100%;max-width:960px;margin:auto">
    <div style="display:flex;align-items:center;gap:6px;padding:10px 14px">
      <b style="flex:1">Camera Studio</b>
      <button class="ib" data-a="flip" title="Flip camera">${ic('flip', 22)}</button>
      <button class="ib" data-a="aspect" title="Change shape (9:16, square, wide)">${ic('panel', 20)} <span id="asp">9:16</span></button>
      <button class="ib" data-a="close" title="Close">${ic('x', 22)}</button>
    </div>
    <div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative">
      <canvas id="cv" style="max-width:100%;max-height:100%;border-radius:14px;touch-action:none;background:#000"></canvas>
      <div id="cd" style="position:absolute;font-size:96px;font-weight:800;color:#fff;text-shadow:0 0 20px #000;display:none"></div>
      <div id="rec" style="position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#d93a3a;border-radius:12px;padding:2px 12px;display:none"><span id="rt">0:00</span></div>
      <div id="err" style="position:absolute;color:#ff9a9a;text-align:center;padding:20px;display:none"></div>
    </div>
    <div id="filters" style="display:flex;gap:8px;overflow:auto;padding:10px 12px"></div>
    <div id="tools" style="display:flex;gap:8px;align-items:center;padding:0 12px 6px;flex-wrap:wrap">
      <div id="stk" style="display:flex;gap:4px;overflow:auto;flex:1"></div>
      <input id="cap" placeholder="Caption…" style="max-width:190px">
      <button class="btn sm" data-a="undo">Undo sticker</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:18px;padding:10px 14px 16px">
      <div class="chips" id="mode"><span class="chip on" data-m="video">Video</span><span class="chip" data-m="photo">Photo</span></div>
      <button id="shutter" style="width:72px;height:72px;border-radius:50%;border:5px solid #fff;background:#e23d3d"></button>
      <div class="chips" id="timer"><span class="chip on" data-s="0">No timer</span><span class="chip" data-s="3">3s</span></div>
    </div>
  </div>`
  document.body.appendChild(root)
  const $ = s => root.querySelector(s)
  const cv = $('#cv'); const cx = cv.getContext('2d', { alpha: false })
  const tmp = document.createElement('canvas')
  const video = document.createElement('video'); video.playsInline = true; video.muted = true
  let stream, facing = 'user', mode = 'video', filter = FILTERS[0], aspect = window.innerHeight > window.innerWidth ? '9:16' : '16:9'
  let timerSec = 0; let stickers = []; let caption = ''; let raf = 0; let recorder, chunks = [], recStart = 0, recTick = 0, recording = false
  let dragging = null; let closed = false; let previewing = false; let audioTrack = null

  $('#asp').textContent = aspect
  $('#filters').innerHTML = FILTERS.map(f => `<div class="chip${f === filter ? ' on' : ''}" data-f="${f.id}">${f.name}</div>`).join('')
  $('#stk').innerHTML = STICKERS.map(s => `<button class="ib" data-s="${s}">${s}</button>`).join('')

  function size () {
    const maxH = Math.min(root.clientHeight - 300, 900); const r = ASPECTS[aspect]
    const hgt = Math.max(240, aspect === '9:16' ? Math.min(1280, maxH * 1.6) : aspect === '1:1' ? 720 : 720)
    let w, h
    if (aspect === '16:9') { w = 1280; h = 720 } else if (aspect === '1:1') { w = h = 720 } else { w = 720; h = 1280 }
    cv.width = w; cv.height = h
    cv.style.aspectRatio = String(r)
    cv.style.height = aspect === '16:9' ? 'auto' : '100%'
    cv.style.width = aspect === '16:9' ? '100%' : 'auto'
  }

  async function start () {
    if (stream) stream.getTracks().forEach(t => t.stop())
    $('#err').style.display = 'none'
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } }) } catch (e2) {
        $('#err').style.display = 'block'; $('#err').textContent = 'Camera unavailable: ' + (e2.message || e2.name) + '. Check browser permissions.'; return
      }
    }
    audioTrack = stream.getAudioTracks()[0] || null
    video.srcObject = stream; await video.play().catch(() => {})
    size(); loop()
  }

  function draw (t) {
    if (previewing) return
    const w = cv.width, h = cv.height
    cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h)
    paint(cx, video, w, h, filter, facing === 'user', t, tmp)
    for (const s of stickers) { cx.font = `${s.size}px sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(s.e, s.x * w, s.y * h) }
    if (caption) {
      const fs = Math.round(w * 0.06); cx.font = `800 ${fs}px sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'
      cx.lineWidth = fs / 6; cx.strokeStyle = 'rgba(0,0,0,.85)'; cx.fillStyle = '#fff'
      const words = caption.split(' '); let line = ''; const lines = []
      for (const wd of words) { const test = line ? line + ' ' + wd : wd; if (cx.measureText(test).width > w * .86 && line) { lines.push(line); line = wd } else line = test }
      lines.push(line)
      lines.forEach((l, i) => { const y = h * .82 - (lines.length - 1 - i) * fs * 1.2; cx.strokeText(l, w / 2, y); cx.fillText(l, w / 2, y) })
    }
  }
  function loop () { cancelAnimationFrame(raf); const f = t => { if (closed) return; draw(t); raf = requestAnimationFrame(f) }; raf = requestAnimationFrame(f) }

  // --- sticker placement / dragging
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } }
  cv.onpointerdown = e => {
    const p = pos(e); let best = null; let bd = 0.12
    for (const s of stickers) { const d = Math.hypot(s.x - p.x, (s.y - p.y) * (cv.height / cv.width)); if (d < bd) { bd = d; best = s } }
    dragging = best; if (best) cv.setPointerCapture(e.pointerId)
  }
  cv.onpointermove = e => { if (dragging) { const p = pos(e); dragging.x = p.x; dragging.y = p.y } }
  cv.onpointerup = () => { dragging = null }

  // --- controls
  root.onclick = e => {
    const f = e.target.closest('[data-f]'); if (f) { filter = FILTERS.find(x => x.id === f.dataset.f); root.querySelectorAll('[data-f]').forEach(c => c.classList.toggle('on', c === f)); return }
    const s = e.target.closest('#stk [data-s]'); if (s) { stickers.push({ e: s.dataset.s, x: .5, y: .45, size: Math.round(cv.width * .16) }); return }
    const m = e.target.closest('#mode [data-m]'); if (m) { mode = m.dataset.m; root.querySelectorAll('#mode .chip').forEach(c => c.classList.toggle('on', c === m)); $('#shutter').style.background = mode === 'video' ? '#e23d3d' : '#fff'; return }
    const tm = e.target.closest('#timer [data-s]'); if (tm) { timerSec = +tm.dataset.s; root.querySelectorAll('#timer .chip').forEach(c => c.classList.toggle('on', c === tm)); return }
    const a = e.target.closest('[data-a]'); if (!a) return
    if (a.dataset.a === 'close') close()
    if (a.dataset.a === 'flip') { if (recording) return; facing = facing === 'user' ? 'environment' : 'user'; start() }
    if (a.dataset.a === 'aspect') { if (recording) return; const k = Object.keys(ASPECTS); aspect = k[(k.indexOf(aspect) + 1) % k.length]; $('#asp').textContent = aspect; size() }
    if (a.dataset.a === 'undo') stickers.pop()
  }
  $('#cap').oninput = e => { caption = e.target.value.slice(0, 80) }

  const wait = ms => new Promise(r => setTimeout(r, ms))
  async function countdown () {
    if (!timerSec) return
    const el = $('#cd'); el.style.display = 'block'
    for (let i = timerSec; i > 0; i--) { el.textContent = i; await wait(1000) }
    el.style.display = 'none'
  }

  $('#shutter').onclick = async () => {
    if (recording) return stopRec()
    await countdown(); if (closed) return
    if (mode === 'photo') {
      cv.toBlob(b => review(b, 'image/jpeg', 'photo'), 'image/jpeg', 0.92)
    } else startRec()
  }

  function pickMime () {
    for (const m of ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m
    return ''
  }
  function startRec () {
    const out = cv.captureStream(30)
    if (audioTrack) out.addTrack(audioTrack)
    const mt = pickMime()
    try { recorder = new MediaRecorder(out, mt ? { mimeType: mt, videoBitsPerSecond: 4_000_000 } : undefined) } catch (e) { $('#err').style.display = 'block'; $('#err').textContent = 'Recording is not supported in this browser.'; return }
    chunks = []; recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    recorder.onstop = () => { const type = recorder.mimeType || mt || 'video/webm'; review(new Blob(chunks, { type }), type, 'video') }
    recorder.start(250); recording = true; recStart = Date.now()
    $('#rec').style.display = 'block'; $('#shutter').style.borderRadius = '14px'
    recTick = setInterval(() => {
      const s = (Date.now() - recStart) / 1000; $('#rt').textContent = `${s / 60 | 0}:${String(s % 60 | 0).padStart(2, '0')} / ${maxSeconds}s`
      if (s >= maxSeconds) stopRec()
    }, 200)
  }
  function stopRec () {
    clearInterval(recTick); recording = false; $('#rec').style.display = 'none'; $('#shutter').style.borderRadius = '50%'
    try { recorder.stop() } catch { /* already stopped */ }
  }

  function review (blob, type, kind) {
    previewing = true
    const url = URL.createObjectURL(blob)
    const ext = type.includes('mp4') ? 'mp4' : type.includes('webm') ? 'webm' : 'jpg'
    const ov = document.createElement('div')
    ov.style.cssText = 'position:absolute;inset:0;background:#05070b;display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px;z-index:5'
    ov.innerHTML = `${kind === 'video' ? `<video src="${url}" autoplay loop playsinline controls style="flex:1;min-height:0;max-width:100%;border-radius:14px"></video>` : `<img src="${url}" style="flex:1;min-height:0;max-width:100%;border-radius:14px;object-fit:contain">`}
      <div style="display:flex;gap:10px"><button class="btn" data-r="retake">Retake</button><button class="btn" data-r="save">Save to device</button><button class="btn pri" data-r="send">Send</button></div>`
    root.querySelector('#st').appendChild(ov)
    ov.onclick = e => {
      const r = e.target.dataset.r; if (!r) return
      if (r === 'retake') { ov.remove(); URL.revokeObjectURL(url); previewing = false }
      if (r === 'save') { const a = document.createElement('a'); a.href = url; a.download = `orbit-${Date.now()}.${ext}`; a.click() }
      if (r === 'send') { const file = new File([blob], `orbit-${kind}-${Date.now()}.${ext}`, { type: type.split(';')[0] }); close(); onSend(file) }
    }
  }

  function close () {
    closed = true; cancelAnimationFrame(raf); clearInterval(recTick)
    if (recording) { try { recorder.stop() } catch { /* ignore */ } }
    if (stream) stream.getTracks().forEach(t => t.stop())
    root.remove()
  }
  window.addEventListener('resize', () => { if (!closed && !recording) size() })
  start()
  return { close }
}
