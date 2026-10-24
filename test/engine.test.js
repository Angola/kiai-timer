import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, totalSeconds, Runner, formatTime, parseTime } from '../app/js/engine.js';

const tabata = {
  prepare: 10, rounds: 8, sets: 1, setRest: 60, cooldown: 0,
  intervals: [{ type: 'work', name: '', seconds: 20 }, { type: 'rest', name: '', seconds: 10 }],
};

test('timeline drops trailing rest', () => {
  const tl = buildTimeline(tabata);
  assert.equal(tl.length, 1 + 8 * 2 - 1);
  assert.equal(tl.at(-1).phase, 'work');
  assert.equal(totalSeconds(tl), 10 + 8 * 30 - 10);
});

test('sets insert set-rest between, not after last', () => {
  const tl = buildTimeline({ ...tabata, prepare: 0, rounds: 2, sets: 3, setRest: 30, cooldown: 60 });
  const phases = tl.map(s => s.phase);
  assert.equal(phases.filter(p => p === 'setRest').length, 2);
  assert.deepEqual(phases.slice(-2), ['work', 'cooldown']);
  assert.deepEqual(tl.map(s => s.set), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3]);
});

test('zero-length segments are skipped', () => {
  const tl = buildTimeline({ ...tabata, prepare: 0, rounds: 1 });
  assert.equal(tl.length, 1);
});

function fakeClock() {
  let t = 1000;
  const now = () => t;
  now.advance = ms => { t += ms; };
  return now;
}

test('runner advances by wall clock and catches up after long gap', () => {
  const clock = fakeClock();
  const r = new Runner(buildTimeline(tabata), clock);
  r.start();
  clock.advance(5000);
  r.update();
  assert.equal(r.snapshot().index, 0);
  assert.equal(r.snapshot().remainingMs, 5000);
  // Jump 10s (prepare) + 20s (work) + 3s into first rest, in one go (e.g. tab suspended).
  clock.advance(5000 + 20000 + 3000);
  assert.equal(r.update(), 2);
  const s = r.snapshot();
  assert.equal(s.segment.phase, 'rest');
  assert.equal(s.remainingMs, 7000);
  assert.equal(s.elapsedTotalMs, 33000);
});

test('pause freezes time; resume continues', () => {
  const clock = fakeClock();
  const r = new Runner(buildTimeline(tabata), clock);
  r.start();
  clock.advance(4000);
  r.pause();
  clock.advance(60000);
  r.update();
  assert.equal(r.snapshot().remainingMs, 6000);
  assert.equal(r.running, false);
  r.resume();
  clock.advance(1000);
  assert.equal(r.snapshot().remainingMs, 5000);
});

test('skip / prev', () => {
  const clock = fakeClock();
  const r = new Runner(buildTimeline(tabata), clock);
  r.start();
  r.skip();
  assert.equal(r.snapshot().segment.phase, 'work');
  assert.equal(r.snapshot().elapsedTotalMs, 10000);
  clock.advance(5000);
  r.prev(); // >2s in: restart current
  assert.equal(r.snapshot().index, 1);
  assert.equal(r.snapshot().remainingMs, 20000);
  r.prev(); // at start: go back
  assert.equal(r.snapshot().index, 0);
});

test('runner finishes', () => {
  const clock = fakeClock();
  const r = new Runner(buildTimeline(tabata), clock);
  r.start();
  clock.advance(10_000_000);
  r.update();
  assert.equal(r.finished, true);
  assert.equal(r.snapshot().elapsedTotalMs, r.total);
});

test('skip while paused stays paused', () => {
  const clock = fakeClock();
  const r = new Runner(buildTimeline(tabata), clock);
  r.start();
  r.pause();
  r.skip();
  clock.advance(5000);
  assert.equal(r.snapshot().remainingMs, 20000);
});

test('format / parse time', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(75), '1:15');
  assert.equal(formatTime(3725), '1:02:05');
  assert.equal(parseTime('1:15'), 75);
  assert.equal(parseTime('45'), 45);
  assert.ok(Number.isNaN(parseTime('1:x')));
  assert.ok(Number.isNaN(parseTime('<script>')));
});
