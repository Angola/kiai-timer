import { buildTimeline, totalSeconds, Runner, formatTime, parseTime } from './engine.js';
import { COLORS, LIMITS, newId, sanitizeWorkout, parseBackup } from './model.js';
import { store } from './store.js';
import { t, setLang, getLang } from './i18n.js';
import { presets } from './presets.js';
import { unlockAudio, cue, speak, vibrate } from './audio.js';

// ---------- tiny DOM helper (text only, never innerHTML) ----------

const SVG_NS = 'http://www.w3.org/2000/svg';

function h(tag, props = {}, ...children) {
  const el = tag.startsWith('svg:') ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k in el && !(el instanceof SVGElement)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const $ = sel => document.querySelector(sel);

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/** Button that needs a second tap within 3s to fire. Avoids blocking confirm() dialogs. */
function confirmButton(label, onConfirm, cls = 'btn danger') {
  let armed = false;
  let timer;
  const btn = h('button', {
    class: cls, type: 'button',
    onclick: () => {
      if (armed) { clearTimeout(timer); onConfirm(); return; }
      armed = true;
      btn.textContent = t('confirmDelete');
      btn.classList.add('armed');
      timer = setTimeout(() => { armed = false; btn.textContent = label; btn.classList.remove('armed'); }, 3000);
    },
  }, label);
  return btn;
}

// ---------- state ----------

let settings = store.settings();
setLang(settings.lang);

let workouts = store.workouts();
if (!workouts) {
  workouts = [];
  store.saveWorkouts(workouts);
}

let view = 'home';

function persistWorkouts() {
  if (!store.saveWorkouts(workouts)) toast('Storage full');
}

const PHASE_COLOR = {
  prepare: '#ffb020', work: '#ff5a3c', rest: '#22c3a6', setRest: '#3d8bfd', cooldown: '#a66cff',
};

function summary(w) {
  const tl = buildTimeline(w);
  const parts = w.intervals.length <= 3
    ? w.intervals.map(iv => formatTime(iv.seconds)).join(' / ')
    : `${w.intervals.length} ${t('intervals')}`;
  const reps = [w.rounds > 1 ? `${w.rounds}×` : '', w.sets > 1 ? ` ${w.sets} ${t('sets')}` : ''].join('');
  return `${reps} (${parts}) · ${formatTime(totalSeconds(tl))}`.trim();
}

// ---------- navigation ----------

function navigate(v) {
  view = v;
  render();
}

function render() {
  document.title = t('appName');
  for (const btn of document.querySelectorAll('#tabs button')) {
    btn.textContent = t(btn.dataset.view === 'home' ? 'workouts' : btn.dataset.view);
    btn.setAttribute('aria-current', btn.dataset.view === view ? 'page' : 'false');
  }
  const main = $('#view');
  main.replaceChildren(
    view === 'home' ? homeView() : view === 'history' ? historyView() : settingsView(),
  );
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------- home ----------

function workoutCard(w, { isPreset }) {
  const actions = isPreset
    ? [h('button', { class: 'btn ghost', type: 'button', onclick: () => duplicate(w) }, t('duplicate'))]
    : [
        h('button', { class: 'btn ghost', type: 'button', onclick: () => openEditor(w) }, t('edit')),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => duplicate(w) }, t('duplicate')),
        confirmButton(t('delete'), () => {
          workouts = workouts.filter(x => x.id !== w.id);
          persistWorkouts();
          render();
        }, 'btn ghost danger'),
      ];
  return h('article', { class: 'card', style: { '--accent': w.color } },
    h('div', { class: 'card-main' },
      h('div', { class: 'card-text' },
        h('h3', {}, w.name),
        h('p', { class: 'muted' }, summary(w)),
      ),
      h('button', {
        class: 'play', type: 'button', 'aria-label': `${t('start')}: ${w.name}`,
        onclick: () => startRun(w),
      }, h('span', { 'aria-hidden': 'true' }, '▶')),
    ),
    h('div', { class: 'card-actions' }, actions),
  );
}

function duplicate(w) {
  const copy = sanitizeWorkout({ ...structuredClone(w), id: newId(), updatedAt: Date.now() });
  if (!copy) return;
  workouts.unshift(copy);
  persistWorkouts();
  openEditor(copy);
}

function homeView() {
  return h('div', { class: 'stack' },
    h('div', { class: 'section-head' },
      h('h2', {}, t('myWorkouts')),
      h('button', { class: 'btn primary', type: 'button', onclick: () => openEditor(null) }, t('newWorkout')),
    ),
    workouts.length
      ? h('div', { class: 'cards' }, workouts.map(w => workoutCard(w, { isPreset: false })))
      : h('p', { class: 'empty' }, t('noWorkouts')),
    h('div', { class: 'section-head' }, h('h2', {}, t('presets'))),
    h('div', { class: 'cards' }, presets().map(p => workoutCard(sanitizeWorkout(p), { isPreset: true }))),
  );
}

// ---------- editor ----------

function durationField(label, value, onChange, { min = 0 } = {}) {
  const input = h('input', {
    type: 'text', inputMode: 'numeric', class: 'time-input', value: formatTime(value),
    'aria-label': label, autocomplete: 'off', maxLength: 8,
  });
  const set = v => {
    value = Math.min(LIMITS.seconds, Math.max(min, v));
    input.value = formatTime(value);
    onChange(value);
  };
  input.addEventListener('change', () => {
    const v = parseTime(input.value);
    set(Number.isNaN(v) ? value : v);
  });
  input.addEventListener('focus', () => input.select());
  // 5s steps up to 2 minutes, 15s steps above.
  return h('div', { class: 'field' },
    label ? h('span', { class: 'field-label' }, label) : null,
    h('div', { class: 'stepper' },
      h('button', { type: 'button', class: 'step', 'aria-label': `${label} −`, onclick: () => set(value - (value > 120 ? 15 : 5)) }, '−'),
      input,
      h('button', { type: 'button', class: 'step', 'aria-label': `${label} +`, onclick: () => set(value + (value >= 120 ? 15 : 5)) }, '+'),
    ),
  );
}

function countField(label, value, max, onChange) {
  const out = h('output', { class: 'count' }, String(value));
  const set = v => {
    value = Math.min(max, Math.max(1, v));
    out.textContent = String(value);
    onChange(value);
  };
  return h('div', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    h('div', { class: 'stepper' },
      h('button', { type: 'button', class: 'step', 'aria-label': `${label} −`, onclick: () => set(value - 1) }, '−'),
      out,
      h('button', { type: 'button', class: 'step', 'aria-label': `${label} +`, onclick: () => set(value + 1) }, '+'),
    ),
  );
}

function openEditor(existing) {
  const draft = existing
    ? structuredClone(existing)
    : {
        id: newId(), name: '', color: COLORS[workouts.length % COLORS.length],
        prepare: 10, rounds: 8, sets: 1, setRest: 60, cooldown: 0,
        intervals: [{ type: 'work', name: '', seconds: 30 }, { type: 'rest', name: '', seconds: 15 }],
      };
  const dlg = $('#editor');
  const totalEl = h('strong', {});
  const updateTotal = () => {
    const w = sanitizeWorkout(draft);
    totalEl.textContent = w ? formatTime(totalSeconds(buildTimeline(w))) : '0:00';
  };

  const build = () => {
    const intervalsList = h('ol', { class: 'intervals' },
      draft.intervals.map((iv, i) => h('li', { class: `interval ${iv.type}` },
        h('div', { class: 'interval-top' },
          h('select', {
            'aria-label': t('intervals'),
            onchange: e => { iv.type = e.target.value; build(); },
          },
            h('option', { value: 'work', selected: iv.type === 'work' }, t('work')),
            h('option', { value: 'rest', selected: iv.type === 'rest' }, t('rest')),
          ),
          h('input', {
            type: 'text', value: iv.name, maxLength: LIMITS.name, class: 'name-input',
            placeholder: t(iv.type), 'aria-label': t('name'),
            oninput: e => { iv.name = e.target.value; },
          }),
        ),
        h('div', { class: 'interval-bottom' },
          durationField('', iv.seconds, v => { iv.seconds = v; updateTotal(); }, { min: 1 }),
          h('div', { class: 'row-actions' },
            h('button', { type: 'button', class: 'icon', 'aria-label': '↑', disabled: i === 0,
              onclick: () => { [draft.intervals[i - 1], draft.intervals[i]] = [draft.intervals[i], draft.intervals[i - 1]]; build(); } }, '↑'),
            h('button', { type: 'button', class: 'icon', 'aria-label': '↓', disabled: i === draft.intervals.length - 1,
              onclick: () => { [draft.intervals[i + 1], draft.intervals[i]] = [draft.intervals[i], draft.intervals[i + 1]]; build(); } }, '↓'),
            h('button', { type: 'button', class: 'icon danger', 'aria-label': t('delete'), disabled: draft.intervals.length === 1,
              onclick: () => { draft.intervals.splice(i, 1); build(); } }, '✕'),
          ),
        ),
      )),
    );

    const addBtn = (type, label) => h('button', {
      type: 'button', class: 'btn ghost', disabled: draft.intervals.length >= LIMITS.intervals,
      onclick: () => { draft.intervals.push({ type, name: '', seconds: type === 'work' ? 30 : 15 }); build(); },
    }, label);

    dlg.replaceChildren(h('form', {
      class: 'editor', method: 'dialog',
      onsubmit: e => {
        e.preventDefault();
        const w = sanitizeWorkout({ ...draft, name: draft.name.trim() || t('untitled'), updatedAt: Date.now() });
        if (!w) return;
        const idx = workouts.findIndex(x => x.id === w.id);
        if (idx >= 0) workouts[idx] = w; else workouts.unshift(w);
        persistWorkouts();
        dlg.close();
        toast(t('saved'));
        navigate('home');
      },
    },
      h('header', { class: 'editor-head' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, t('cancel')),
        h('span', { class: 'muted' }, `${t('total')} `, totalEl),
        h('button', { type: 'submit', class: 'btn primary' }, t('save')),
      ),
      h('div', { class: 'editor-body stack' },
        h('label', { class: 'field' },
          h('span', { class: 'field-label' }, t('name')),
          h('input', {
            type: 'text', value: draft.name, maxLength: LIMITS.name, placeholder: t('untitled'),
            class: 'name-input big', oninput: e => { draft.name = e.target.value; },
          }),
        ),
        h('div', { class: 'field' },
          h('span', { class: 'field-label' }, t('color')),
          h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t('color') },
            COLORS.map(c => h('button', {
              type: 'button', class: 'swatch', style: { '--c': c }, role: 'radio',
              'aria-checked': String(draft.color === c), 'aria-label': c,
              onclick: () => { draft.color = c; build(); },
            })),
          ),
        ),
        durationField(t('prepare'), draft.prepare, v => { draft.prepare = v; updateTotal(); }),
        h('h3', { class: 'sub' }, t('intervals')),
        intervalsList,
        h('div', { class: 'row' }, addBtn('work', t('addWork')), addBtn('rest', t('addRest'))),
        h('div', { class: 'grid2' },
          countField(t('rounds'), draft.rounds, LIMITS.rounds, v => { draft.rounds = v; updateTotal(); }),
          countField(t('sets'), draft.sets, LIMITS.sets, v => { draft.sets = v; build(); }),
        ),
        draft.sets > 1 ? durationField(t('setRest'), draft.setRest, v => { draft.setRest = v; updateTotal(); }) : null,
        durationField(t('cooldown'), draft.cooldown, v => { draft.cooldown = v; updateTotal(); }),
      ),
    ));
    updateTotal();
  };

  build();
  if (!dlg.open) dlg.showModal();
}

// ---------- runner ----------

let run = null;  // { runner, workout, els, timers, lastIndex, lastSec, ... }
let wakeLock = null;

async function requestWakeLock() {
  if (!settings.wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* denied or unsupported: harmless */ }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

function phaseName(seg) {
  return seg.phase === 'work' || seg.phase === 'rest' ? (seg.label || t(seg.phase)) : t(seg.phase);
}

function announce(seg, next) {
  const voice = settings.voice;
  if (seg.phase === 'work') {
    if (settings.sound) cue.work();
    if (settings.vibrate) vibrate([200, 80, 200]);
    if (voice) speak(seg.label || t('v_go'), getLang());
  } else {
    if (settings.sound) cue.rest();
    if (settings.vibrate) vibrate(300);
    if (voice) {
      let text = seg.phase === 'prepare' ? t('prepare') : seg.phase === 'cooldown' ? t('cooldown') : t('v_rest');
      if (next?.phase === 'work' && next.label) text += `. ${t('next')}, ${next.label}`;
      speak(text, getLang());
    }
  }
}

function startRun(workout) {
  unlockAudio();
  const timeline = buildTimeline(workout);
  if (!timeline.length) return;
  const runner = new Runner(timeline);
  const maxRound = workout.rounds;
  const maxSet = workout.sets;

  const R = 46;
  const C = 2 * Math.PI * R;
  const ring = h('svg:circle', { class: 'ring-fg', cx: 50, cy: 50, r: R, 'stroke-dasharray': C, 'stroke-dashoffset': 0 });
  const els = {
    phase: h('div', { class: 'run-phase' }),
    time: h('div', { class: 'run-time', role: 'timer', 'aria-live': 'off' }),
    label: h('div', { class: 'run-label' }),
    counters: h('div', { class: 'run-counters' }),
    next: h('div', { class: 'run-next' }),
    bar: h('div', { class: 'bar-fill' }),
    elapsed: h('span', {}),
    remaining: h('span', {}),
    toggle: h('button', { type: 'button', class: 'ctrl main', onclick: () => togglePause() }),
  };

  const stopBtn = h('button', {
    type: 'button', class: 'btn ghost', onclick: () => {
      if (runner.finished || !runner.started || runner.snapshot().elapsedTotalMs < 3000) return endRun(false);
      if (stopBtn.classList.contains('armed')) return endRun(false);
      stopBtn.classList.add('armed');
      stopBtn.textContent = t('confirmStop');
      setTimeout(() => { stopBtn.classList.remove('armed'); stopBtn.textContent = t('stop'); }, 3000);
    },
  }, t('stop'));

  const root = $('#run');
  root.replaceChildren(
    h('header', { class: 'run-head' }, stopBtn, h('span', { class: 'run-title' }, workout.name), h('span', {})),
    h('div', { class: 'ring-wrap' },
      h('svg:svg', { viewBox: '0 0 100 100', class: 'ring', 'aria-hidden': 'true' },
        h('svg:circle', { class: 'ring-bg', cx: 50, cy: 50, r: R }), ring),
      h('div', { class: 'ring-center' }, els.phase, els.time, els.label),
    ),
    els.counters,
    els.next,
    h('div', { class: 'run-total' },
      h('div', { class: 'bar' }, els.bar),
      h('div', { class: 'bar-labels' }, els.elapsed, els.remaining),
    ),
    h('div', { class: 'controls' },
      h('button', { type: 'button', class: 'ctrl', 'aria-label': t('previous'), onclick: () => { runner.prev(); frame(true); } }, '⏮'),
      els.toggle,
      h('button', { type: 'button', class: 'ctrl', 'aria-label': t('skip'), onclick: () => { runner.skip(); frame(true); } }, '⏭'),
    ),
  );
  root.hidden = false;
  document.body.classList.add('running');

  run = { runner, workout, els, ring, C, maxRound, maxSet, lastIndex: -1, lastSec: -1, halfSaid: -1, raf: 0, interval: 0 };

  const frame = (forceAnnounce = false) => {
    if (!run) return;
    runner.update();
    const s = runner.snapshot();
    if (s.finished) return finishRun();

    const seg = s.segment;
    const sec = Math.ceil(s.remainingMs / 1000);
    if (s.index !== run.lastIndex || forceAnnounce === true) {
      if (s.index !== run.lastIndex) announce(seg, s.next);
      run.lastIndex = s.index;
      run.lastSec = sec;
    } else if (sec !== run.lastSec) {
      run.lastSec = sec;
      if (s.running && sec <= 3 && sec >= 1 && seg.duration > 3) {
        if (settings.sound) cue.tick();
        if (settings.vibrate) vibrate(60);
      }
      if (s.running && settings.voice && seg.phase === 'work' && seg.duration >= 60
          && sec === Math.floor(seg.duration / 2) && run.halfSaid !== s.index) {
        run.halfSaid = s.index;
        speak(t('v_half'), getLang());
      }
    }

    root.style.setProperty('--phase', PHASE_COLOR[seg.phase]);
    els.phase.textContent = t(seg.phase);
    els.time.textContent = formatTime(sec);
    els.label.textContent = seg.label;
    els.counters.textContent = [
      run.maxRound > 1 ? t('roundOf', { a: seg.round, b: run.maxRound }) : null,
      run.maxSet > 1 ? t('setOf', { a: seg.set, b: run.maxSet }) : null,
    ].filter(Boolean).join(' · ');
    els.next.textContent = s.next ? `${t('next')}: ${phaseName(s.next)} ${formatTime(s.next.duration)}` : `${t('next')}: ${t('finish')}`;
    ring.setAttribute('stroke-dashoffset', String(C * s.progress));
    els.bar.style.setProperty('width', `${(s.elapsedTotalMs / s.totalMs) * 100}%`);
    els.elapsed.textContent = `${t('elapsed')} ${formatTime(Math.floor(s.elapsedTotalMs / 1000))}`;
    els.remaining.textContent = `${t('remaining')} ${formatTime(Math.ceil((s.totalMs - s.elapsedTotalMs) / 1000))}`;
    const running = s.running || !runner.started;
    els.toggle.textContent = s.running ? '❚❚' : '▶';
    els.toggle.setAttribute('aria-label', s.running ? t('pause') : t('resume'));
    root.classList.toggle('paused', !running);
  };

  const loop = () => { frame(); if (run) run.raf = requestAnimationFrame(loop); };
  run.frame = frame;
  // rAF drives smooth rendering; the interval keeps cues firing when rAF is throttled.
  run.interval = setInterval(() => frame(), 250);
  runner.start();
  requestWakeLock();
  loop();
}

function togglePause() {
  if (!run) return;
  const r = run.runner;
  unlockAudio();
  if (r.running) {
    r.pause();
    try { speechSynthesis.cancel(); } catch { /* unsupported */ }
  } else {
    r.resume();
  }
  run.frame();
}

function finishRun() {
  if (!run) return;
  const { workout, runner } = run;
  if (settings.sound) cue.finish();
  if (settings.vibrate) vibrate([300, 100, 300, 100, 500]);
  if (settings.voice) speak(t('v_done'), getLang());
  store.addHistory({ name: workout.name, at: Date.now(), seconds: Math.round(runner.total / 1000), completed: true });
  teardown();
  const root = $('#run');
  root.style.setProperty('--phase', PHASE_COLOR.work);
  root.replaceChildren(h('div', { class: 'done' },
    h('div', { class: 'done-mark', 'aria-hidden': 'true' }, '✓'),
    h('h2', {}, t('done')),
    h('p', { class: 'muted' }, `${workout.name} · ${formatTime(runner.total / 1000)}`),
    h('button', { type: 'button', class: 'btn primary', onclick: closeRun }, t('back')),
  ));
  root.querySelector('button').focus();
}

function endRun(completed) {
  if (!run) return;
  const s = run.runner.snapshot();
  if (!completed && s.elapsedTotalMs >= 10000) {
    store.addHistory({ name: run.workout.name, at: Date.now(), seconds: Math.round(s.elapsedTotalMs / 1000), completed: false });
  }
  teardown();
  closeRun();
}

function teardown() {
  if (!run) return;
  cancelAnimationFrame(run.raf);
  clearInterval(run.interval);
  run = null;
  releaseWakeLock();
}

function closeRun() {
  try { speechSynthesis.cancel(); } catch { /* none */ }
  $('#run').hidden = true;
  document.body.classList.remove('running');
  render();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && run) {
    if (!wakeLock) requestWakeLock();
    run.frame();
  }
});

document.addEventListener('keydown', e => {
  if (!run || e.target.closest?.('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  else if (e.code === 'ArrowRight') { run.runner.skip(); run.frame(true); }
  else if (e.code === 'ArrowLeft') { run.runner.prev(); run.frame(true); }
  else if (e.code === 'Escape') endRun(false);
});

// ---------- history ----------

function historyView() {
  const list = store.history();
  const fmt = new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' });
  return h('div', { class: 'stack' },
    h('div', { class: 'section-head' },
      h('h2', {}, t('history')),
      list.length ? confirmButton(t('clearHistory'), () => { store.saveHistory([]); render(); }, 'btn ghost danger') : null,
    ),
    list.length
      ? h('ul', { class: 'history' }, list.map(e => h('li', {},
          h('div', {}, h('strong', {}, e.name), h('div', { class: 'muted' }, fmt.format(e.at))),
          h('div', { class: 'history-right' },
            h('span', {}, formatTime(e.seconds)),
            h('span', { class: `badge ${e.completed ? 'ok' : ''}` }, e.completed ? t('completed') : t('stopped')),
          ),
        )))
      : h('p', { class: 'empty' }, t('noHistory')),
  );
}

// ---------- settings ----------

function toggle(key) {
  return h('label', { class: 'switch-row' },
    h('span', {}, t(key)),
    h('input', {
      type: 'checkbox', class: 'switch', checked: settings[key], role: 'switch',
      onchange: e => {
        settings[key] = e.target.checked;
        store.saveSettings(settings);
        if (key === 'sound' && e.target.checked) { unlockAudio(); cue.tick(); }
      },
    }),
  );
}

function exportData() {
  const data = { app: 'kiai-timer', version: 1, exportedAt: new Date().toISOString(), workouts, history: store.history() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `kiai-timer-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importData(file) {
  try {
    if (file.size > 1_000_000) throw new Error('too large');
    const { workouts: incoming, history } = parseBackup(await file.text());
    const ids = new Set(workouts.map(w => w.id));
    for (const w of incoming) {
      if (ids.has(w.id)) w.id = newId();
      workouts.push(w);
    }
    workouts = workouts.slice(0, LIMITS.workouts);
    persistWorkouts();
    if (history.length) {
      const merged = [...store.history(), ...history].sort((a, b) => b.at - a.at);
      store.saveHistory(merged);
    }
    toast(t('imported', { n: incoming.length }));
  } catch {
    toast(t('importFailed'));
  }
}

function settingsView() {
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: e => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; },
  });
  return h('div', { class: 'stack' },
    h('h2', {}, t('settings')),
    h('div', { class: 'panel' },
      toggle('sound'), toggle('voice'), toggle('vibrate'), toggle('wakeLock'),
      h('label', { class: 'switch-row' },
        h('span', {}, t('language')),
        h('select', {
          onchange: e => { settings.lang = e.target.value; store.saveSettings(settings); setLang(settings.lang); render(); },
        },
          h('option', { value: 'auto', selected: settings.lang === 'auto' }, t('langAuto')),
          h('option', { value: 'ja', selected: settings.lang === 'ja' }, '日本語'),
          h('option', { value: 'en', selected: settings.lang === 'en' }, 'English'),
        ),
      ),
    ),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn ghost', onclick: exportData }, t('exportData')),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => fileInput.click() }, t('importData')),
      fileInput,
    ),
    h('p', { class: 'muted small' }, t('about')),
  );
}

// ---------- boot ----------

for (const btn of document.querySelectorAll('#tabs button')) {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
}
render();

// Skipped on localhost so cache-first never serves stale files while developing.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && window.isSecureContext && !isLocal) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
