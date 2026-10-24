// Synthesised cues (Web Audio) + optional speech. No audio files needed.

let ctx = null;

/** Must be called from a user gesture (iOS/Safari autoplay policy). */
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq, ms, when = 0, gain = 0.25) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.02);
}

export const cue = {
  tick: () => tone(880, 120),
  work: () => { tone(1320, 160); tone(1760, 260, 0.17); },
  rest: () => { tone(880, 160); tone(660, 260, 0.17); },
  finish: () => [0, 0.18, 0.36, 0.6].forEach((d, i) => tone([1047, 1319, 1568, 2093][i], 220, d)),
};

let voices = [];
if ('speechSynthesis' in window) {
  const load = () => { voices = speechSynthesis.getVoices(); };
  load();
  speechSynthesis.addEventListener?.('voiceschanged', load);
}

export function speak(text, lang) {
  if (!text || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const v = voices.find(v => v.lang?.toLowerCase().startsWith(lang));
  if (v) u.voice = v;
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
