import { buildTimeline, totalSeconds, Runner, formatTime, formatClock, parseTime } from './engine.js';
import { COLORS, LIMITS, newId, sanitizeWorkout, parseBackup } from './model.js';
import { store } from './store.js';
import { t, setLang, getLang } from './i18n.js';
import { presets } from './presets.js';
import { icon } from './icons.js';
import { catalog } from './exercises.js';
import { unlockAudio, cue, speak, vibrate, setVolume, voicesFor, onVoicesChanged } from './audio.js';

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

// ---------- state ----------

let settings = store.settings();
setLang(settings.lang);
setVolume(settings.volume / 100);

const say = text => speak(text, getLang(), settings.voiceURI);

let workouts = store.workouts() ?? [];

let view = 'home';

function persistWorkouts() {
  if (!store.saveWorkouts(workouts)) toast('Storage full');
}

/** Copy built-in presets into the user's list (skipping ones already present) so they're editable. */
function addPresets() {
  const have = new Set(workouts.map(w => w.id));
  const missing = presets().filter(p => !have.has(p.id)).map(sanitizeWorkout).filter(Boolean);
  workouts.push(...missing);
  workouts = workouts.slice(0, LIMITS.workouts);
  persistWorkouts();
  return missing.length;
}

if (!store.seeded()) {
  addPresets();
  store.markSeeded();
}

const PHASE_COLOR = {
  prepare: '#b85400', work: '#c4122f', rest: '#00745c', setRest: '#1650a6', cooldown: '#5c2a9d',
};

const ROW_COLOR = { rounds: '#2f7fd8', sets: '#d9a400' };

// ---------- navigation ----------

let lastView = null;
const TAB_ICON = { home: 'timer', history: 'calendar', settings: 'settings' };

function navigate(v) {
  view = v;
  render();
}

function render() {
  document.title = t('appName');
  for (const btn of document.querySelectorAll('#tabs button')) {
    const v = btn.dataset.view;
    const label = t(v === 'home' ? 'workouts' : v);
    if (!btn.firstChild) btn.append(icon(TAB_ICON[v]));
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.setAttribute('aria-current', v === view ? 'page' : 'false');
  }
  const main = $('#view');
  main.replaceChildren(
    view === 'home' ? homeView() : view === 'history' ? historyView() : settingsView(),
  );
  // Only jump to the top on a real view change, not when redrawing after an edit.
  if (view !== lastView) {
    lastView = view;
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

// ---------- shared bits ----------

/** Settings-style row: dot · title/subtitle · big value · chevron. */
function listRow({ dot, iconName, title, sub, value, valueClass = '', onclick }) {
  return h('button', { type: 'button', class: 'list-row', onclick },
    dot ? h('span', { class: 'dot', style: { '--dot': dot }, 'aria-hidden': 'true' }) : null,
    iconName ? h('span', { class: 'row-icon' }, icon(iconName)) : null,
    h('span', { class: 'row-text' },
      h('span', { class: 'row-title' }, title),
      sub ? h('span', { class: 'row-sub' }, sub) : null,
    ),
    value != null ? h('span', { class: `row-value ${valueClass}` }, value) : null,
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'),
  );
}

/** Icon-only button; the label is exposed to screen readers and as a tooltip. */
function iconBtn(name, label, onclick, cls = '') {
  return h('button', { type: 'button', class: `icon-btn ${cls}`, 'aria-label': label, title: label, onclick }, icon(name));
}

/** Destructive icon button: first tap arms it (red + hint), second tap within 3s confirms. */
function confirmIcon(name, label, onConfirm, hint = t('confirmDelete')) {
  let timer;
  const btn = iconBtn(name, label, e => {
    e.stopPropagation();
    if (btn.classList.contains('armed')) { clearTimeout(timer); onConfirm(); return; }
    btn.classList.add('armed');
    toast(hint);
    timer = setTimeout(() => btn.classList.remove('armed'), 3000);
  }, 'danger');
  return btn;
}

/** Bottom sheet for editing one value. `head` is a title or { title, back }. */
function openSheet(head, ...content) {
  const { title, back } = typeof head === 'string' ? { title: head } : head;
  const dlg = $('#sheet');
  // autofocus on the container so opening doesn't draw a focus ring on "Done".
  dlg.replaceChildren(h('div', { class: 'sheet-inner', tabIndex: -1, autofocus: true },
    h('header', { class: 'sheet-head' },
      back ? iconBtn('left', t('back'), back) : h('span', {}),
      h('strong', {}, title),
      iconBtn('check', t('doneBtn'), () => dlg.close(), 'accent'),
    ),
    h('div', { class: 'sheet-body stack' }, ...content),
  ));
  if (!dlg.open) dlg.showModal();
}

function durationField(label, value, onChange, { min = 0 } = {}) {
  const input = h('input', {
    type: 'text', inputMode: 'numeric', class: 'time-input', value: formatClock(value),
    'aria-label': label, autocomplete: 'off', maxLength: 8,
  });
  const set = v => {
    value = Math.min(LIMITS.seconds, Math.max(min, v));
    input.value = formatClock(value);
    onChange(value);
  };
  input.addEventListener('change', () => {
    const v = parseTime(input.value);
    set(Number.isNaN(v) ? value : v);
  });
  input.addEventListener('focus', () => input.select());
  // 5s steps up to 2 minutes, 15s steps above.
  return h('div', { class: 'stepper' },
    h('button', { type: 'button', class: 'step', 'aria-label': `${label} −`, onclick: () => set(value - (value > 120 ? 15 : 5)) }, '−'),
    input,
    h('button', { type: 'button', class: 'step', 'aria-label': `${label} +`, onclick: () => set(value + (value >= 120 ? 15 : 5)) }, '+'),
  );
}

function countField(label, value, max, onChange) {
  const out = h('output', { class: 'count' }, String(value));
  const set = v => {
    value = Math.min(max, Math.max(1, v));
    out.textContent = String(value);
    onChange(value);
  };
  return h('div', { class: 'stepper' },
    h('button', { type: 'button', class: 'step', 'aria-label': `${label} −`, onclick: () => set(value - 1) }, '−'),
    out,
    h('button', { type: 'button', class: 'step', 'aria-label': `${label} +`, onclick: () => set(value + 1) }, '+'),
  );
}

// ---------- home: selected workout's settings + my workouts ----------

let selectedId = store.selected();
let listEditing = false;

function selectedWorkout() {
  return workouts.find(w => w.id === selectedId) ?? workouts[0] ?? null;
}

function select(id) {
  selectedId = id;
  store.saveSelected(id);
}

/** Mutate a workout by id, re-sanitise, persist and redraw. */
function updateWorkout(id, mutate) {
  const idx = workouts.findIndex(w => w.id === id);
  if (idx < 0) return;
  const draft = structuredClone(workouts[idx]);
  mutate(draft);
  const clean = sanitizeWorkout({ ...draft, updatedAt: Date.now() });
  if (!clean) return;
  workouts[idx] = clean;
  persistWorkouts();
  render();
}

function createWorkout() {
  if (workouts.length >= LIMITS.workouts) return;
  const w = sanitizeWorkout({
    id: newId(), name: t('untitled'), color: COLORS[0],
    prepare: 10, rounds: 8, sets: 1, setRest: 60, cooldown: 0,
    intervals: [{ type: 'work', name: '', seconds: 30 }, { type: 'rest', name: '', seconds: 15 }],
  });
  workouts.unshift(w);
  persistWorkouts();
  select(w.id);
  listEditing = false;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renameWorkout(w);
}

function duplicate(w) {
  if (workouts.length >= LIMITS.workouts) return;
  const name = `${w.name} ${t('copySuffix')}`.slice(0, LIMITS.name);
  const copy = sanitizeWorkout({ ...structuredClone(w), id: newId(), name, updatedAt: Date.now() });
  if (!copy) return;
  workouts.splice(workouts.findIndex(x => x.id === w.id) + 1, 0, copy);
  persistWorkouts();
  render();
}

function removeWorkout(w) {
  workouts = workouts.filter(x => x.id !== w.id);
  if (selectedId === w.id) select(workouts[0]?.id ?? null);
  persistWorkouts();
  render();
}

function renameWorkout(w) {
  const input = h('input', {
    type: 'text', class: 'name-input big', value: w.name, maxLength: LIMITS.name, placeholder: t('untitled'),
    'aria-label': t('name'),
    oninput: e => updateWorkout(w.id, x => { x.name = e.target.value || t('untitled'); }),
  });
  openSheet(t('name'), input);
  input.focus();
  input.select();
}

function pickDuration(w, key, title, min = 0) {
  openSheet(title, durationField(title, w[key], v => updateWorkout(w.id, x => { x[key] = v; }), { min }));
}

function pickCount(w, key, title, max) {
  openSheet(title, countField(title, w[key], max, v => updateWorkout(w.id, x => { x[key] = v; })));
}

function editInterval(w, i) {
  const iv = w.intervals[i];
  const upd = fn => updateWorkout(w.id, x => fn(x.intervals[i]));
  const structural = fn => { updateWorkout(w.id, x => fn(x.intervals)); $('#sheet').close(); };
  const typeBtn = type => h('button', {
    type: 'button', class: 'seg-btn', 'aria-pressed': String(iv.type === type), style: { '--dot': PHASE_COLOR[type] },
    onclick: () => { upd(x => { x.type = type; }); editInterval(selectedWorkout(), i); },
  }, t(type));
  const last = w.intervals.length - 1;
  openSheet(t('intervalEdit'),
    h('div', { class: 'segmented', role: 'group' }, typeBtn('work'), typeBtn('rest')),
    h('div', { class: 'list' },
      listRow({
        title: t('exercise'), value: iv.name || t('noName'), valueClass: 'text',
        onclick: () => pickExercise(w, i),
      }),
    ),
    durationField(t(iv.type), iv.seconds, v => upd(x => { x.seconds = v; }), { min: 1 }),
    h('div', { class: 'sheet-actions' },
      i > 0 ? iconBtn('up', t('moveUp'), () => structural(a => { [a[i - 1], a[i]] = [a[i], a[i - 1]]; })) : null,
      i < last ? iconBtn('down', t('moveDown'), () => structural(a => { [a[i + 1], a[i]] = [a[i], a[i + 1]]; })) : null,
      w.intervals.length < LIMITS.intervals ? iconBtn('copy', t('duplicate'), () => structural(a => { a.splice(i + 1, 0, { ...a[i] }); })) : null,
      last > 0 ? confirmIcon('trash', t('delete'), () => structural(a => { a.splice(i, 1); })) : null,
    ),
  );
}

/** Pick an interval name from the built-in dictionary or the user's own list (search doubles as "add custom"). */
function pickExercise(w, i) {
  const current = w.intervals[i].name;
  const back = () => editInterval(selectedWorkout(), i);
  const choose = name => { updateWorkout(w.id, x => { x.intervals[i].name = name; }); back(); };
  let custom = store.exercises();
  const saveCustom = list => { custom = list; store.saveExercises(list); };

  const search = h('input', {
    type: 'search', class: 'name-input', maxLength: LIMITS.name, enterKeyHint: 'done',
    placeholder: t('searchOrAdd'), 'aria-label': t('searchOrAdd'), autocomplete: 'off',
  });
  const body = h('div', { class: 'ex-list stack' });
  const chip = (name, removable, label = name) => h('span', { class: 'chip-wrap' },
    h('button', { type: 'button', class: `chip ${name === current ? 'on' : ''}`, onclick: () => choose(name) }, label),
    removable ? iconBtn('close', `${t('delete')}: ${name}`, () => { saveCustom(custom.filter(x => x !== name)); draw(); }, 'chip-x') : null,
  );
  const section = (title, chips) => h('div', { class: 'ex-section' }, h('div', { class: 'ex-title' }, title), h('div', { class: 'chips' }, chips));

  function draw() {
    const q = search.value.trim().slice(0, LIMITS.name);
    const match = n => !q || n.toLowerCase().includes(q.toLowerCase());
    const groups = catalog(getLang());
    const known = new Set([...custom, ...groups.flatMap(g => g.names)]);
    const out = [];
    if (q && !known.has(q)) {
      out.push(h('button', {
        type: 'button', class: 'chip add-chip',
        onclick: () => { saveCustom([q, ...custom]); choose(q); },
      }, icon('plus'), t('addCustom', { name: q })));
    }
    if (!q) out.push(h('div', { class: 'chips' }, chip('', false, t('noName'))));
    const mine = custom.filter(match);
    if (mine.length) out.push(section(t('myExercises'), mine.map(n => chip(n, true))));
    for (const g of groups) {
      const names = g.names.filter(match);
      if (names.length) out.push(section(t(`cat_${g.id}`), names.map(n => chip(n, false))));
    }
    body.replaceChildren(...out);
  }
  search.addEventListener('input', draw);
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); body.querySelector('.add-chip, .chip:not(.on)')?.click(); }
  });
  openSheet({ title: t('exercise'), back }, search, body);
  draw();
}

function addInterval(w, type) {
  if (w.intervals.length >= LIMITS.intervals) return;
  updateWorkout(w.id, x => { x.intervals.push({ type, name: '', seconds: type === 'work' ? 30 : 15 }); });
}

function settingsList(w) {
  const perRound = w.intervals.map(iv => iv.name || t(iv.type)).join(' + ');
  return h('div', { class: 'list' },
    listRow({ title: t('name'), value: w.name, valueClass: 'text', onclick: () => renameWorkout(w) }),
    listRow({
      dot: PHASE_COLOR.prepare, title: t('prepare'), sub: t('prepareSub'), value: formatClock(w.prepare),
      onclick: () => pickDuration(w, 'prepare', t('prepare')),
    }),
    w.intervals.map((iv, i) => listRow({
      dot: PHASE_COLOR[iv.type], title: iv.name || t(iv.type === 'work' ? 'workout' : 'rest'),
      sub: t(iv.type === 'work' ? 'workSub' : 'restSub'), value: formatClock(iv.seconds),
      onclick: () => editInterval(w, i),
    })),
    h('div', { class: 'list-add' },
      iconBtn('plus', t('addWork'), () => addInterval(w, 'work'), 'add work'),
      iconBtn('plus', t('addRest'), () => addInterval(w, 'rest'), 'add rest'),
    ),
    listRow({
      dot: ROW_COLOR.rounds, title: t('roundsCount'), sub: t('roundsSub', { list: perRound }), value: String(w.rounds),
      onclick: () => pickCount(w, 'rounds', t('roundsCount'), LIMITS.rounds),
    }),
    listRow({
      dot: ROW_COLOR.sets, title: t('setsCount'), sub: t('setsSub', { n: w.rounds }), value: String(w.sets),
      onclick: () => pickCount(w, 'sets', t('setsCount'), LIMITS.sets),
    }),
    w.sets > 1 ? listRow({
      dot: PHASE_COLOR.setRest, title: t('setRest'), sub: t('setRestSub'), value: formatClock(w.setRest),
      onclick: () => pickDuration(w, 'setRest', t('setRest')),
    }) : null,
    listRow({
      dot: PHASE_COLOR.cooldown, title: t('cooldown'), sub: t('cooldownSub'), value: formatClock(w.cooldown),
      onclick: () => pickDuration(w, 'cooldown', t('cooldown')),
    }),
  );
}

function workoutRow(w, isSelected) {
  const work = w.intervals.find(iv => iv.type === 'work');
  const rest = w.intervals.find(iv => iv.type === 'rest');
  const many = w.intervals.length > 2;
  const cell = (label, value) => [h('span', { class: 'k' }, label), h('span', { class: 'v' }, value)];
  const right = listEditing
    ? h('div', { class: 'row-edit' },
        iconBtn('copy', t('duplicate'), e => { e.stopPropagation(); duplicate(w); }),
        confirmIcon('trash', t('delete'), () => removeWorkout(w)),
      )
    : h('span', { class: `check ${isSelected ? 'on' : ''}`, 'aria-hidden': 'true' }, '✓');
  return h('div', {
    class: `workout-row ${isSelected ? 'selected' : ''}`, role: 'button', tabIndex: 0,
    'aria-pressed': String(isSelected),
    onclick: e => {
      if (listEditing || e.target.closest('.row-edit')) return;
      select(w.id);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } },
  },
    h('div', { class: 'workout-main' },
      h('strong', { class: 'workout-name' }, w.name),
      h('div', { class: 'workout-grid' },
        h('div', {},
          cell(t('prepare'), formatClock(w.prepare)),
          many ? cell(t('intervals'), String(w.intervals.length)) : cell(t('workout'), formatClock(work?.seconds ?? 0)),
          many ? cell(t('total'), formatClock(totalSeconds(buildTimeline(w)))) : cell(t('rest'), formatClock(rest?.seconds ?? 0)),
        ),
        h('div', {},
          cell(t('roundsCount'), String(w.rounds)),
          cell(t('setsCount'), String(w.sets)),
          cell(t('setRestShort'), formatClock(w.sets > 1 ? w.setRest : 0)),
        ),
      ),
    ),
    right,
  );
}

function homeView() {
  const w = selectedWorkout();
  if (w && w.id !== selectedId) select(w.id);
  return h('div', { class: 'stack home' },
    w ? [
      h('div', { class: 'list-caption' }, t('intervals')),
      settingsList(w),
      h('button', { type: 'button', class: 'start-big', 'aria-label': t('start'), title: t('start'), onclick: () => startRun(w) },
        icon('play'),
        h('span', { class: 'start-total' }, formatClock(totalSeconds(buildTimeline(w)))),
      ),
    ] : null,
    h('div', { class: 'list-caption with-actions' },
      h('span', {}, t('myWorkouts')),
      h('div', { class: 'caption-actions' },
        iconBtn('plus', t('newWorkout'), createWorkout, 'accent'),
        workouts.length
          ? iconBtn(listEditing ? 'check' : 'edit', listEditing ? t('doneBtn') : t('edit'), () => { listEditing = !listEditing; render(); }, 'accent')
          : null,
      ),
    ),
    workouts.length
      ? h('div', { class: 'list' }, workouts.map(x => workoutRow(x, x.id === w?.id)))
      : h('div', { class: 'empty stack' },
          h('p', {}, t('noWorkouts')),
          iconBtn('restore', t('restorePresets'), () => { addPresets(); render(); }, 'accent'),
        ),
  );
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

/** `workoutName` is passed only for the first segment, so the name is read out at the start. */
function announce(seg, next, workoutName = '') {
  const voice = settings.voice;
  const intro = workoutName ? t('v_intro', { name: workoutName }) : '';
  if (seg.phase === 'work') {
    if (settings.sound) cue.work();
    if (settings.vibrate) vibrate([200, 80, 200]);
    if (voice) say(intro + (seg.label || t('v_go')));
  } else {
    if (settings.sound) cue.rest();
    if (settings.vibrate) vibrate(300);
    if (voice) {
      let text = seg.phase === 'prepare' ? t('prepare') : seg.phase === 'cooldown' ? t('cooldown') : t('v_rest');
      if (next?.phase === 'work' && next.label) text += t('v_next', { name: next.label });
      say(intro + text);
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

  // Pause button with a ring showing whole-workout progress.
  const R = 46;
  const C = 2 * Math.PI * R;
  const ring = h('svg:circle', { class: 'ring-fg', cx: 50, cy: 50, r: R, 'stroke-dasharray': C, 'stroke-dashoffset': C });
  const els = {
    caption: h('div', { class: 'run-caption' }),
    total: h('div', { class: 'run-total-time', 'aria-label': t('remaining') }),
    phase: h('div', { class: 'run-phase' }),
    time: h('div', { class: 'run-time', role: 'timer', 'aria-live': 'off' }),
    nextLabel: h('div', { class: 'run-next-label' }),
    nextTime: h('div', { class: 'run-next-time' }),
    roundsLeft: h('div', { class: 'rounds-left' }),
    toggleIcon: h('span', { class: 'toggle-icon', 'aria-hidden': 'true' }),
    toggleLabel: h('div', { class: 'toggle-label' }),
  };
  const toggleBtn = h('button', { type: 'button', class: 'toggle', onclick: () => togglePause() },
    h('svg:svg', { viewBox: '0 0 100 100', class: 'ring', 'aria-hidden': 'true' },
      h('svg:circle', { class: 'ring-bg', cx: 50, cy: 50, r: R }), ring),
    els.toggleIcon,
  );

  const stopBtn = iconBtn('close', t('stop'), () => {
    if (runner.finished || !runner.started || runner.snapshot().elapsedTotalMs < 3000) return endRun(false);
    if (stopBtn.classList.contains('armed')) return endRun(false);
    stopBtn.classList.add('armed');
    toast(t('confirmStop'));
    setTimeout(() => stopBtn.classList.remove('armed'), 3000);
  });

  const root = $('#run');
  const nextBlock = h('section', { class: 'run-next' }, els.nextLabel, els.nextTime);
  root.replaceChildren(
    h('header', { class: 'run-head' },
      stopBtn,
      h('div', { class: 'run-head-center' }, els.caption, els.total),
      h('span', { class: 'run-title' }, workout.name),
    ),
    h('section', { class: 'run-now' }, els.phase, els.time),
    nextBlock,
    h('footer', { class: 'run-foot' },
      h('div', { class: 'foot-stat' }, els.roundsLeft, h('div', { class: 'foot-label' }, t('roundsLeft'))),
      h('div', { class: 'foot-toggle' }, toggleBtn, els.toggleLabel),
      h('div', { class: 'foot-skip' },
        iconBtn('prev', t('previous'), () => { runner.prev(); frame(true); }),
        iconBtn('next', t('skip'), () => { runner.skip(); frame(true); }),
      ),
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
      if (s.index !== run.lastIndex) announce(seg, s.next, run.lastIndex === -1 ? workout.name : '');
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
        say(t('v_half'));
      }
    }

    root.style.setProperty('--phase', PHASE_COLOR[seg.phase]);
    root.style.setProperty('--next', s.next ? PHASE_COLOR[s.next.phase] : '#2a2f3a');
    els.caption.textContent = [
      run.maxRound > 1 ? t('roundOf', { a: seg.round, b: run.maxRound }) : null,
      run.maxSet > 1 ? t('setOf', { a: seg.set, b: run.maxSet }) : null,
    ].filter(Boolean).join(' · ') || workout.name;
    els.total.textContent = formatClock(Math.ceil((s.totalMs - s.elapsedTotalMs) / 1000));
    els.phase.textContent = phaseName(seg);
    els.time.textContent = formatClock(sec);
    els.nextLabel.textContent = s.next ? `${phaseName(s.next)}:` : t('finish');
    els.nextTime.textContent = s.next ? formatClock(s.next.duration) : '';
    // Rounds still to do, counting the current one (0 during cooldown).
    const left = seg.phase === 'prepare' ? run.maxRound * run.maxSet
      : seg.phase === 'cooldown' ? 0
      : (run.maxSet - seg.set) * run.maxRound + (run.maxRound - seg.round + 1);
    els.roundsLeft.textContent = String(left);
    ring.setAttribute('stroke-dashoffset', String(C * (1 - s.elapsedTotalMs / s.totalMs)));
    const running = s.running || !runner.started;
    const toggleState = s.running ? 'pause' : 'play';
    if (run.toggleState !== toggleState) {
      run.toggleState = toggleState;
      els.toggleIcon.replaceChildren(icon(toggleState));
    }
    els.toggleLabel.textContent = s.running ? t('pause') : t('resume');
    toggleBtn.setAttribute('aria-label', s.running ? t('pause') : t('resume'));
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
  if (settings.voice) say(t('v_done'));
  store.addHistory({ name: workout.name, at: Date.now(), seconds: Math.round(runner.total / 1000), completed: true });
  teardown();
  const root = $('#run');
  root.style.setProperty('--phase', PHASE_COLOR.work);
  setThemeColor(PHASE_COLOR.work);
  root.replaceChildren(h('div', { class: 'done' },
    h('div', { class: 'done-mark', 'aria-hidden': 'true' }, '✓'),
    h('h2', {}, t('done')),
    h('p', { class: 'muted' }, `${workout.name} · ${formatTime(runner.total / 1000)}`),
    iconBtn('check', t('back'), closeRun, 'done-btn'),
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

function setThemeColor(c) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c);
}

function closeRun() {
  try { speechSynthesis.cancel(); } catch { /* none */ }
  setThemeColor('#0c0e13');
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

// ---------- history: summary + calendar ----------

let calMonth = null;  // first day of the month being shown
let calDay = null;    // selected day key (YYYY-MM-DD)

const dayKey = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Consecutive training days ending today (or yesterday, so the streak survives until tonight). */
function streakDays(days) {
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function statTile(label, value, sub) {
  return h('div', { class: 'stat' },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    sub ? h('div', { class: 'stat-sub' }, sub) : null,
  );
}

function historyView() {
  const list = store.history();
  const now = new Date();
  calMonth ??= new Date(now.getFullYear(), now.getMonth(), 1);
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();

  const byDay = new Map();
  for (const e of list) {
    const k = dayKey(new Date(e.at));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  const sum = arr => arr.reduce((s, e) => s + e.seconds, 0);
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
  const week = list.filter(e => e.at >= weekStart);
  const month = list.filter(e => { const d = new Date(e.at); return d.getFullYear() === y && d.getMonth() === m; });
  const monthDays = new Set(month.map(e => dayKey(new Date(e.at)))).size;

  // Default selection: today, else the latest trained day in the shown month.
  if (!calDay || !calDay.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)) {
    const today = dayKey(now);
    const monthKeys = [...byDay.keys()].filter(k => k.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).sort();
    calDay = today.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`) ? today : monthKeys.at(-1) ?? null;
  }

  const lang = getLang();
  const monthFmt = new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long' });
  const wdFmt = new Intl.DateTimeFormat(lang, { weekday: 'narrow' });
  const dayFmt = new Intl.DateTimeFormat(lang, { month: 'long', day: 'numeric', weekday: 'short' });
  const timeFmt = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });

  const shiftMonth = delta => { calMonth = new Date(y, m + delta, 1); calDay = null; render(); };

  // Sunday-first month grid.
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(h('span', { class: 'cal-cell empty' }));
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const k = dayKey(date);
    const entries = byDay.get(k) ?? [];
    const done = entries.some(e => e.completed);
    cells.push(h('button', {
      type: 'button',
      class: ['cal-cell', entries.length ? (done ? 'trained' : 'partial') : '', k === dayKey(now) ? 'today' : '', k === calDay ? 'selected' : '']
        .filter(Boolean).join(' '),
      'aria-label': `${dayFmt.format(date)} ${entries.length ? t('sessionsN', { n: entries.length }) : ''}`.trim(),
      'aria-pressed': String(k === calDay),
      onclick: () => { calDay = k; render(); },
    }, String(d)));
  }

  const selected = (calDay && byDay.get(calDay)) ?? [];
  const [sy, sm, sd] = (calDay ?? '').split('-').map(Number);

  return h('div', { class: 'stack' },
    h('div', { class: 'list-caption with-actions' },
      h('span', {}, t('summary')),
      h('div', { class: 'caption-actions' },
        list.length ? confirmIcon('trash', t('clearHistory'), () => { store.saveHistory([]); render(); }) : null,
      ),
    ),
    h('div', { class: 'stats' },
      statTile(t('thisWeek'), t('sessionsN', { n: week.length }), formatClock(sum(week))),
      statTile(monthFmt.format(calMonth), t('daysN', { n: monthDays }), `${t('sessionsN', { n: month.length })} · ${formatClock(sum(month))}`),
      statTile(t('streak'), t('daysN', { n: streakDays(new Set(byDay.keys())) }), null),
      statTile(t('allTime'), t('sessionsN', { n: list.length }), formatClock(sum(list))),
    ),
    h('div', { class: 'calendar' },
      h('div', { class: 'cal-head' },
        iconBtn('left', t('prevMonth'), () => shiftMonth(-1)),
        h('strong', {}, monthFmt.format(calMonth)),
        iconBtn('right', t('nextMonth'), () => shiftMonth(1)),
      ),
      h('div', { class: 'cal-grid cal-weekdays', 'aria-hidden': 'true' },
        Array.from({ length: 7 }, (_, i) => h('span', {}, wdFmt.format(new Date(2026, 1, 1 + i)))),  // 2026-02-01 is a Sunday
      ),
      h('div', { class: 'cal-grid' }, cells),
    ),
    calDay ? h('div', { class: 'list-caption' }, dayFmt.format(new Date(sy, sm - 1, sd))) : null,
    selected.length
      ? h('ul', { class: 'history' }, selected.map(e => h('li', {},
          h('div', {}, h('strong', {}, e.name), h('div', { class: 'muted' }, timeFmt.format(e.at))),
          h('div', { class: 'history-right' },
            h('span', {}, formatClock(e.seconds)),
            h('span', { class: `badge ${e.completed ? 'ok' : ''}` }, e.completed ? t('completed') : t('stopped')),
          ),
        )))
      : h('p', { class: 'empty' }, list.length ? t('noSessionsDay') : t('noHistory')),
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

function volumeRow() {
  let previewTimer;
  return h('label', { class: 'switch-row' },
    h('span', {}, t('volume')),
    h('input', {
      type: 'range', class: 'range', min: 0, max: 100, step: 5, value: settings.volume,
      'aria-label': t('volume'),
      oninput: e => {
        settings.volume = Number(e.target.value);
        setVolume(settings.volume / 100);
        store.saveSettings(settings);
        unlockAudio();
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => cue.tick(), 120);
      },
    }),
  );
}

function voiceRow() {
  const select = h('select', {
    'aria-label': t('voiceName'),
    onchange: e => { settings.voiceURI = e.target.value; store.saveSettings(settings); },
  });
  // Voice lists often load asynchronously, so (re)fill whenever they arrive.
  const fill = () => {
    const list = voicesFor(getLang());
    select.replaceChildren(
      h('option', { value: '', selected: !settings.voiceURI }, t('voiceAuto')),
      list.map(v => h('option', { value: v.voiceURI, selected: v.voiceURI === settings.voiceURI }, v.name)),
    );
  };
  fill();
  const off = onVoicesChanged(() => (select.isConnected ? fill() : off()));
  return h('div', { class: 'switch-row voice-row' },
    h('span', {}, t('voiceName')),
    h('div', { class: 'voice-controls' },
      select,
      iconBtn('speaker', t('preview'), () => say(t('v_sample')), 'accent'),
    ),
  );
}

function exportData() {
  const data = {
    app: 'kiai-timer', version: 1, exportedAt: new Date().toISOString(),
    workouts, history: store.history(), exercises: store.exercises(),
  };
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
    const { workouts: incoming, history, exercises } = parseBackup(await file.text());
    if (exercises.length) store.saveExercises([...store.exercises(), ...exercises]);
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
    h('div', { class: 'list-caption' }, t('settings')),
    h('div', { class: 'panel' },
      toggle('sound'), volumeRow(), toggle('voice'), voiceRow(), toggle('vibrate'), toggle('wakeLock'),
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
    h('div', { class: 'list' },
      listRow({ iconName: 'download', title: t('exportData'), onclick: exportData }),
      listRow({ iconName: 'upload', title: t('importData'), onclick: () => fileInput.click() }),
      listRow({ iconName: 'restore', title: t('restorePresets'), onclick: () => { toast(t('presetsAdded', { n: addPresets() })); } }),
    ),
    fileInput,
    h('p', { class: 'muted small' }, t('about')),
  );
}

// ---------- boot ----------

$('#sheet').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
for (const btn of document.querySelectorAll('#tabs button')) {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
}
render();

// Skipped on localhost so cache-first never serves stale files while developing.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && window.isSecureContext && !isLocal) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
