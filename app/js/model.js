// Workout data model + strict sanitising. Everything read from storage or an
// imported file passes through here, so the rest of the app can trust shapes.

export const LIMITS = {
  name: 60,
  intervals: 50,
  seconds: 5999,     // 99:59
  rounds: 99,
  sets: 20,
  workouts: 200,
  history: 500,
  exercises: 100,
};

// Flat palette, dark enough for white text on top.
export const COLORS = ['#e5533d', '#d9730d', '#13896f', '#2a78c8', '#8e4ec6', '#d23f7c'];
// v1 colours, mapped so existing workouts keep their hue.
const LEGACY_COLORS = {
  '#ff5a3c': '#e5533d', '#ffb020': '#d9730d', '#22c3a6': '#13896f',
  '#3d8bfd': '#2a78c8', '#a66cff': '#8e4ec6', '#ff4f9a': '#d23f7c',
};

const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const cleanStr = (v, max, fallback = '') =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : fallback;

export const newId = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

export function sanitizeInterval(iv) {
  if (!iv || typeof iv !== 'object') return null;
  return {
    type: iv.type === 'rest' ? 'rest' : 'work',
    name: cleanStr(iv.name, LIMITS.name),
    seconds: clampInt(iv.seconds, 1, LIMITS.seconds, 30),
  };
}

export function sanitizeWorkout(w) {
  if (!w || typeof w !== 'object') return null;
  const intervals = (Array.isArray(w.intervals) ? w.intervals : [])
    .slice(0, LIMITS.intervals)
    .map(sanitizeInterval)
    .filter(Boolean);
  if (!intervals.length) return null;
  return {
    id: typeof w.id === 'string' && /^[\w-]{1,64}$/.test(w.id) ? w.id : newId(),
    name: cleanStr(w.name, LIMITS.name) || 'Workout',
    color: COLORS.includes(w.color) ? w.color : LEGACY_COLORS[w.color] ?? COLORS[0],
    prepare: clampInt(w.prepare, 0, LIMITS.seconds, 10),
    rounds: clampInt(w.rounds, 1, LIMITS.rounds, 1),
    sets: clampInt(w.sets, 1, LIMITS.sets, 1),
    setRest: clampInt(w.setRest, 0, LIMITS.seconds, 60),
    cooldown: clampInt(w.cooldown, 0, LIMITS.seconds, 0),
    intervals,
    updatedAt: clampInt(w.updatedAt, 0, 8.64e15, Date.now()),
  };
}

export function sanitizeHistoryEntry(h) {
  if (!h || typeof h !== 'object') return null;
  return {
    name: cleanStr(h.name, LIMITS.name) || 'Workout',
    at: clampInt(h.at, 0, 8.64e15, 0),
    seconds: clampInt(h.seconds, 0, 86400 * 7, 0),
    completed: h.completed === true,
  };
}

export const DEFAULT_SETTINGS = {
  sound: true,
  voice: true,
  vibrate: true,
  wakeLock: true,
  lang: 'auto',
  volume: 100,
  voiceURI: '',  // '' = automatic best voice
};

export function sanitizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  if (!s || typeof s !== 'object') return out;
  for (const k of ['sound', 'voice', 'vibrate', 'wakeLock']) if (typeof s[k] === 'boolean') out[k] = s[k];
  if (['auto', 'ja', 'en'].includes(s.lang)) out.lang = s.lang;
  out.volume = clampInt(s.volume, 0, 100, DEFAULT_SETTINGS.volume);
  // Only ever compared against speechSynthesis.getVoices(), never rendered as HTML.
  out.voiceURI = cleanStr(s.voiceURI, 300);
  return out;
}

/** User-defined exercise names: unique, non-empty, length/count limited. */
export function sanitizeExercises(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const v of list) {
    const name = cleanStr(v, LIMITS.name);
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= LIMITS.exercises) break;
  }
  return out;
}

/** Parse an exported backup file. Throws on anything unexpected. */
export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('too large');
  const data = JSON.parse(text);
  if (!data || data.app !== 'kiai-timer' || !Array.isArray(data.workouts)) throw new Error('bad format');
  const workouts = data.workouts.slice(0, LIMITS.workouts).map(sanitizeWorkout).filter(Boolean);
  const history = (Array.isArray(data.history) ? data.history : [])
    .slice(0, LIMITS.history).map(sanitizeHistoryEntry).filter(Boolean);
  return { workouts, history, exercises: sanitizeExercises(data.exercises) };
}
