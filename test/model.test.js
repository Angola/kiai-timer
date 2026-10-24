import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeWorkout, sanitizeSettings, parseBackup, LIMITS } from '../app/js/model.js';

test('sanitizeWorkout clamps and coerces hostile input', () => {
  const w = sanitizeWorkout({
    id: '../../etc', name: 'x'.repeat(500) + '\u0000', color: 'url(javascript:alert(1))',
    prepare: -5, rounds: 1e9, sets: 'abc', setRest: NaN, cooldown: Infinity,
    intervals: [{ type: '<img>', name: 42, seconds: 0 }, null, 'bad'],
    __proto__: { polluted: true },
  });
  assert.notEqual(w.id, '../../etc');
  assert.equal(w.name.length, LIMITS.name);
  assert.equal(w.color, '#ff5a3c');
  assert.equal(w.prepare, 0);
  assert.equal(w.rounds, LIMITS.rounds);
  assert.equal(w.sets, 1);
  assert.equal(w.setRest, 60);
  assert.equal(w.cooldown, 0);
  assert.deepEqual(w.intervals, [{ type: 'work', name: '', seconds: 1 }]);
  assert.equal(Object.hasOwn(w, 'polluted'), false);
});

test('workout without intervals is rejected', () => {
  assert.equal(sanitizeWorkout({ name: 'a', intervals: [] }), null);
  assert.equal(sanitizeWorkout('nope'), null);
});

test('settings only keep known keys', () => {
  const s = sanitizeSettings({ sound: false, lang: 'xx', evil: 1 });
  assert.equal(s.sound, false);
  assert.equal(s.lang, 'auto');
  assert.equal('evil' in s, false);
});

test('parseBackup validates format', () => {
  assert.throws(() => parseBackup('{}'));
  assert.throws(() => parseBackup('not json'));
  assert.throws(() => parseBackup('x'.repeat(1_000_001)));
  const ok = parseBackup(JSON.stringify({
    app: 'kiai-timer', workouts: [{ name: 'A', intervals: [{ type: 'work', seconds: 20 }] }, { bad: 1 }],
    history: [{ name: 'A', at: 1, seconds: 100, completed: true }],
  }));
  assert.equal(ok.workouts.length, 1);
  assert.equal(ok.history.length, 1);
});
