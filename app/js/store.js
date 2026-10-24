import { LIMITS, sanitizeWorkout, sanitizeHistoryEntry, sanitizeSettings } from './model.js';

const KEY = { workouts: 'kiai.workouts', history: 'kiai.history', settings: 'kiai.settings' };

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const store = {
  workouts() {
    const arr = read(KEY.workouts);
    return Array.isArray(arr) ? arr.slice(0, LIMITS.workouts).map(sanitizeWorkout).filter(Boolean) : null;
  },
  saveWorkouts(list) { return write(KEY.workouts, list.slice(0, LIMITS.workouts)); },

  history() {
    const arr = read(KEY.history);
    return Array.isArray(arr) ? arr.map(sanitizeHistoryEntry).filter(Boolean) : [];
  },
  addHistory(entry) {
    const list = [sanitizeHistoryEntry(entry), ...this.history()].filter(Boolean).slice(0, LIMITS.history);
    return write(KEY.history, list);
  },
  saveHistory(list) { return write(KEY.history, list.slice(0, LIMITS.history)); },

  settings() { return sanitizeSettings(read(KEY.settings)); },
  saveSettings(s) { return write(KEY.settings, sanitizeSettings(s)); },
};
