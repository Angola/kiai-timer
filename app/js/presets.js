import { t } from './i18n.js';

const w = (type, name, seconds) => ({ type, name, seconds });

// Built on demand so exercise names follow the current language.
export function presets() {
  return [
    {
      id: 'preset-tabata', name: 'Tabata', color: '#ff5a3c',
      prepare: 10, rounds: 8, sets: 1, setRest: 60, cooldown: 0,
      intervals: [w('work', '', 20), w('rest', '', 10)],
    },
    {
      id: 'preset-hiit', name: 'HIIT 40/20', color: '#ffb020',
      prepare: 10, rounds: 10, sets: 1, setRest: 60, cooldown: 0,
      intervals: [w('work', '', 40), w('rest', '', 20)],
    },
    {
      id: 'preset-circuit', name: 'Full Body Circuit', color: '#22c3a6',
      prepare: 10, rounds: 1, sets: 3, setRest: 60, cooldown: 60,
      intervals: [
        w('work', t('s_jumpingJacks'), 40), w('rest', '', 15),
        w('work', t('s_squats'), 40), w('rest', '', 15),
        w('work', t('s_pushups'), 40), w('rest', '', 15),
        w('work', t('s_lunges'), 40), w('rest', '', 15),
        w('work', t('s_burpees'), 40), w('rest', '', 15),
        w('work', t('s_plank'), 40),
      ],
    },
    {
      id: 'preset-boxing', name: 'Boxing Rounds', color: '#3d8bfd',
      prepare: 10, rounds: 12, sets: 1, setRest: 60, cooldown: 0,
      intervals: [w('work', t('s_round'), 180), w('rest', '', 60)],
    },
    {
      id: 'preset-emom', name: 'EMOM 10', color: '#a66cff',
      prepare: 10, rounds: 10, sets: 1, setRest: 0, cooldown: 0,
      intervals: [w('work', '', 60)],
    },
  ];
}
