// Hand-drawn 24x24 icons, built with DOM APIs (no innerHTML, no icon library).
// Each entry: stroke paths (`s`) and/or filled paths (`f`).

const NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  play: { f: ['M7 4.5v15l13-7.5z'] },
  pause: { f: ['M6 4.5h4.5v15H6z', 'M13.5 4.5H18v15h-4.5z'] },
  stop: { f: ['M6 6h12v12H6z'] },
  close: { s: ['M6 6l12 12', 'M18 6L6 18'] },
  check: { s: ['M4.5 12.5l5 5L19.5 7'] },
  plus: { s: ['M12 5v14', 'M5 12h14'] },
  edit: { s: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'] },
  trash: { s: ['M4 7h16', 'M9 7V4.5h6V7', 'M6 7l1 13h10l1-13', 'M10 11v5.5', 'M14 11v5.5'] },
  copy: { s: ['M9 9h11v11H9z', 'M15 9V4H4v11h5'] },
  up: { s: ['M6 15l6-6 6 6'] },
  down: { s: ['M6 9l6 6 6-6'] },
  prev: { f: ['M18 5.5v13l-9.5-6.5z'], s: ['M6 5.5v13'] },
  next: { f: ['M6 5.5v13l9.5-6.5z'], s: ['M18 5.5v13'] },
  timer: { s: ['M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M12 9v4l2.5 2', 'M9.5 2.5h5'] },
  calendar: { s: ['M4 6h16v14H4z', 'M4 10h16', 'M8.5 3.5v4', 'M15.5 3.5v4'], f: ['M7.5 13h3v3h-3z'] },
  left: { s: ['M15 6l-6 6 6 6'] },
  right: { s: ['M9 6l6 6-6 6'] },
  settings: { s: ['M4 7h9', 'M17 7h3', 'M15 5v4', 'M4 17h3', 'M11 17h9', 'M9 15v4'] },
  speaker: { s: ['M4 9.5v5h4l5 4v-13l-5 4z', 'M16.5 9a4 4 0 0 1 0 6', 'M19 6.5a7.5 7.5 0 0 1 0 11'] },
  download: { s: ['M12 4v11', 'M7 10.5l5 5 5-5', 'M5 20h14'] },
  upload: { s: ['M12 20V9', 'M7 13.5l5-5 5 5', 'M5 4h14'] },
  restore: { s: ['M20 12a8 8 0 1 1-2.3-5.7', 'M20 4v5h-5'] },
};

export function icon(name) {
  const def = ICONS[name];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon icon-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of def.f ?? []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'currentColor');
    svg.append(p);
  }
  for (const d of def.s ?? []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}
