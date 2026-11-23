// Original synthesized alert sounds, styled after classic desktop messengers.
// Sets: msn (bubbly chimes), im (doorbell / door / buzzer), soft (single ping).
let ctx
const AC = () => { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx }

function tone (a, out, { f, t = 0, d = 0.3, type = 'sine', g = 0.5, to, atk = 0.008, vib }) {
  const o = a.createOscillator(); const e = a.createGain()
  o.type = type; o.frequency.setValueAtTime(f, a.currentTime + t)
  if (to) o.frequency.exponentialRampToValueAtTime(to, a.currentTime + t + d)
  if (vib) { const l = a.createOscillator(); const lg = a.createGain(); l.frequency.value = vib[0]; lg.gain.value = vib[1]; l.connect(lg); lg.connect(o.frequency); l.start(a.currentTime + t); l.stop(a.currentTime + t + d + 0.05) }
  e.gain.setValueAtTime(0.0001, a.currentTime + t)
  e.gain.exponentialRampToValueAtTime(g, a.currentTime + t + atk)
  e.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + d)
  o.connect(e); e.connect(out); o.start(a.currentTime + t); o.stop(a.currentTime + t + d + 0.05)
}
// bell = sine + inharmonic partials with long decay
function bell (a, out, f, t, d, g) {
  tone(a, out, { f, t, d, g })
  tone(a, out, { f: f * 2.76, t, d: d * 0.5, g: g * 0.35 })
  tone(a, out, { f: f * 5.4, t, d: d * 0.25, g: g * 0.15 })
}

const SETS = {
  msn: {
    // two quick rising bubble notes
    msg: (a, o) => { tone(a, o, { f: 880, to: 1175, t: 0, d: 0.16, g: 0.45, type: 'sine' }); tone(a, o, { f: 1319, to: 1568, t: 0.11, d: 0.28, g: 0.4, type: 'triangle' }); tone(a, o, { f: 2637, t: 0.11, d: 0.12, g: 0.08 }) },
    // sign-in arpeggio
    online: (a, o) => { [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(a, o, { f, t: i * 0.085, d: 0.34, g: 0.34, type: 'sine' }); tone(a, o, { f: f * 2, t: i * 0.085, d: 0.15, g: 0.07 }) }) },
    call: (a, o) => { for (let k = 0; k < 4; k++) { tone(a, o, { f: 988, t: k * 0.55, d: 0.16, g: 0.4 }); tone(a, o, { f: 1319, t: k * 0.55 + 0.17, d: 0.2, g: 0.4 }) } }
  },
  im: {
    // two-tone doorbell
    msg: (a, o) => { bell(a, o, 988, 0, 0.7, 0.45); bell(a, o, 740, 0.28, 0.9, 0.45) },
    // creaky door opening
    online: (a, o) => { tone(a, o, { f: 150, to: 380, t: 0, d: 0.55, g: 0.22, type: 'sawtooth', vib: [31, 12] }); tone(a, o, { f: 90, t: 0.58, d: 0.18, g: 0.35, type: 'sine' }) },
    // buzzer
    call: (a, o) => { for (let k = 0; k < 3; k++) { tone(a, o, { f: 110, t: k * 0.8, d: 0.55, g: 0.3, type: 'square' }); tone(a, o, { f: 117, t: k * 0.8, d: 0.55, g: 0.3, type: 'square' }) } }
  },
  soft: {
    msg: (a, o) => tone(a, o, { f: 784, t: 0, d: 0.3, g: 0.35 }),
    online: (a, o) => { tone(a, o, { f: 587, t: 0, d: 0.2, g: 0.3 }); tone(a, o, { f: 880, t: 0.12, d: 0.3, g: 0.3 }) },
    call: (a, o) => { for (let k = 0; k < 3; k++) tone(a, o, { f: 700, t: k * 0.6, d: 0.3, g: 0.35 }) }
  }
}

export function play (set, kind, volume = 0.7) {
  const a = AC(); const out = a.createGain(); out.gain.value = Math.max(0, Math.min(1, volume)) * 0.9; out.connect(a.destination)
  const s = SETS[set] || SETS.msn; (s[kind] || s.msg)(a, out)
}
