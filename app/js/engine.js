// Pure timer logic. No DOM access so it can be unit-tested under Node.

export const PHASES = ['prepare', 'work', 'rest', 'setRest', 'cooldown'];

/**
 * Expand a workout definition into a flat list of timed segments.
 * Trailing rest at the very end of the main block is dropped (nobody wants to
 * rest after the last rep before cooldown / finish).
 */
export function buildTimeline(w) {
  const segs = [];
  const push = (phase, label, duration, set, round) => {
    if (duration > 0) segs.push({ phase, label, duration, set, round });
  };

  push('prepare', '', w.prepare, 1, 1);
  for (let s = 1; s <= w.sets; s++) {
    for (let r = 1; r <= w.rounds; r++) {
      for (const iv of w.intervals) push(iv.type, iv.name, iv.seconds, s, r);
    }
    if (s < w.sets) push('setRest', '', w.setRest, s, w.rounds);
  }
  while (segs.length && (segs.at(-1).phase === 'rest' || segs.at(-1).phase === 'setRest')) segs.pop();
  push('cooldown', '', w.cooldown, w.sets, w.rounds);
  return segs;
}

export function totalSeconds(timeline) {
  return timeline.reduce((sum, s) => sum + s.duration, 0);
}

/**
 * Wall-clock based runner: position is always derived from timestamps, so a
 * throttled or suspended tab catches up correctly instead of drifting.
 */
export class Runner {
  constructor(timeline, now = () => performance.now()) {
    this.timeline = timeline;
    this.now = now;
    this.total = totalSeconds(timeline) * 1000;
    this.index = 0;
    this.segStart = 0;     // timestamp the current segment (virtually) began
    this.doneBefore = 0;   // ms of segments fully completed before index
    this.pausedAt = null;
    this.started = false;
    this.finished = timeline.length === 0;
  }

  get running() { return this.started && this.pausedAt === null && !this.finished; }

  start() {
    if (this.started) return;
    this.started = true;
    this.segStart = this.now();
  }

  pause() {
    if (this.running) this.pausedAt = this.now();
  }

  resume() {
    if (this.pausedAt === null) return;
    this.segStart += this.now() - this.pausedAt;
    this.pausedAt = null;
  }

  /** Elapsed ms within the current segment. */
  segElapsed() {
    if (!this.started) return 0;
    const t = this.pausedAt ?? this.now();
    return Math.max(0, t - this.segStart);
  }

  /**
   * Advance past any segments whose time has run out.
   * Returns the number of segment boundaries crossed (0 if none).
   */
  update() {
    if (!this.started || this.finished) return 0;
    let crossed = 0;
    let el = this.segElapsed();
    while (!this.finished && el >= this.timeline[this.index].duration * 1000) {
      const d = this.timeline[this.index].duration * 1000;
      this.segStart += d;
      this.doneBefore += d;
      el -= d;
      crossed++;
      this.#advance();
    }
    return crossed;
  }

  #advance() {
    if (this.index >= this.timeline.length - 1) {
      this.finished = true;
      this.index = this.timeline.length - 1;
      this.pausedAt = null;
    } else {
      this.index++;
    }
  }

  #jumpTo(i) {
    this.doneBefore = this.timeline.slice(0, i).reduce((s, x) => s + x.duration * 1000, 0);
    this.index = i;
    const t = this.now();
    this.segStart = t;
    if (this.pausedAt !== null) this.pausedAt = t;
  }

  skip() {
    if (this.finished) return;
    if (this.index >= this.timeline.length - 1) {
      this.doneBefore = this.total;
      this.finished = true;
      this.pausedAt = null;
      return;
    }
    this.#jumpTo(this.index + 1);
  }

  /** Restart current segment, or go back one if we're near its start. */
  prev() {
    if (this.finished) return;
    const target = this.segElapsed() > 2000 || this.index === 0 ? this.index : this.index - 1;
    this.#jumpTo(target);
  }

  snapshot() {
    const seg = this.timeline[this.index];
    if (!seg) return { finished: true, remainingMs: 0, elapsedTotalMs: 0, totalMs: 0, progress: 1 };
    const el = this.finished ? seg.duration * 1000 : Math.min(this.segElapsed(), seg.duration * 1000);
    const remainingMs = seg.duration * 1000 - el;
    const elapsedTotalMs = this.finished ? this.total : this.doneBefore + el;
    return {
      index: this.index,
      segment: seg,
      next: this.timeline[this.index + 1] ?? null,
      remainingMs,
      progress: el / (seg.duration * 1000),
      elapsedTotalMs,
      totalMs: this.total,
      finished: this.finished,
      running: this.running,
    };
  }
}

export function formatTime(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Zero-padded clock for list values: "00:30", "12:05", "1:02:05". */
export function formatClock(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Parse "m:ss", "h:mm:ss" or plain seconds. Returns NaN when invalid. */
export function parseTime(str) {
  const parts = String(str).trim().split(':');
  if (parts.length > 3 || parts.some(p => !/^\d{1,4}$/.test(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}
