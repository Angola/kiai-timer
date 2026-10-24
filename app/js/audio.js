// Synthesised cues (Web Audio) + optional speech. No audio files needed.

let ctx = null;
let master = null;
let volume = 1;
// Pre-compressor drive at 100%; the compressor tames the peaks this creates.
const GAIN = 1.6;

/** Must be called from a user gesture (iOS/Safari autoplay policy). */
export function unlockAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Compressor lets us drive the level hard without clipping/distortion.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 6;
      comp.ratio.value = 8;
      comp.attack.value = 0.002;
      comp.release.value = 0.1;
      master = ctx.createGain();
      master.gain.value = volume * GAIN;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

/** 0..1 */
export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  if (master) master.gain.value = volume * GAIN;
}

// Soft chime: sine fundamental + octave sine + a little triangle for body.
// Smooth attack and a natural exponential fade (no clicks, no harsh edges);
// the compressor on the master bus keeps the overall level high.
const PARTIALS = [['sine', 1, 1], ['sine', 2, 0.3], ['triangle', 1, 0.35]];

function tone(freq, ms, when = 0) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + when;
  const dur = ms / 1000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(1, t0 + 0.015);
  env.gain.setTargetAtTime(0.0001, t0 + 0.04, dur / 3.5);
  env.connect(master);
  for (const [type, mult, level] of PARTIALS) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq * mult;
    g.gain.value = level;
    osc.connect(g).connect(env);
    osc.start(t0);
    osc.stop(t0 + dur + 0.3);
  }
}

export const cue = {
  tick: () => tone(880, 260),
  work: () => { tone(1046, 300); tone(1568, 650, 0.16); },
  rest: () => { tone(1318, 300); tone(880, 650, 0.16); },
  finish: () => [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, i === 3 ? 1200 : 400, i * 0.18)),
};

// ---------- speech (free, built-in OS/browser voices only) ----------

let voices = [];
const voiceListeners = new Set();
if ('speechSynthesis' in window) {
  const load = () => {
    voices = speechSynthesis.getVoices();
    voiceListeners.forEach(fn => fn());
  };
  load();
  speechSynthesis.addEventListener?.('voiceschanged', load);
}

/** Subscribe to voice list changes; returns an unsubscribe function. */
export const onVoicesChanged = fn => {
  voiceListeners.add(fn);
  return () => voiceListeners.delete(fn);
};

// Higher = more natural. Neural/online voices (Edge "Natural", Google, Apple
// Enhanced/Premium) sound far smoother than the legacy offline engines.
function quality(v) {
  const n = v.name;
  let s = 0;
  if (/natural|neural|online/i.test(n)) s += 10;
  if (/google/i.test(n)) s += 8;
  if (/enhanced|premium|siri/i.test(n)) s += 6;
  if (/nanami|keita|kyoko|o-ren|otoya|aria|jenny|samantha/i.test(n)) s += 2;
  if (/compact|espeak/i.test(n)) s -= 5;
  return s;
}

/** Voices for a language, best first. */
export function voicesFor(lang) {
  return voices
    .filter(v => v.lang?.toLowerCase().replace('_', '-').startsWith(lang))
    .sort((a, b) => quality(b) - quality(a));
}

export function speak(text, lang, voiceURI = '') {
  if (!text || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const list = voicesFor(lang);
  const v = list.find(x => x.voiceURI === voiceURI) ?? list[0];
  if (v) u.voice = v;
  u.rate = 1;
  u.pitch = 1;
  speechSynthesis.speak(u);
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
