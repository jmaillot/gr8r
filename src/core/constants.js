/* ---------- vocab ---------- */
/* The stored vocabulary: the ids are what the document holds (D-08) and they
   never change — only the DISPLAY of an id does, and it is a catalogue lookup
   keyed on the stored id (I18N-07's groundwork). The display name is read at
   ACCESS time through a lazy getter (the wave-8 FIELDS pattern), so a locale
   switch re-renders it instead of freezing the English at module load. */
import { t } from './i18n.js';

export const STATUSES = [
  {
    id: 'backlog',
    get name() {
      return t('task.status.backlog');
    },
  },
  {
    id: 'todo',
    get name() {
      return t('task.status.todo');
    },
  },
  {
    id: 'progress',
    get name() {
      return t('task.status.progress');
    },
  },
  {
    id: 'review',
    get name() {
      return t('task.status.review');
    },
  },
  {
    id: 'done',
    get name() {
      return t('task.status.done');
    },
  },
];
export const ST = Object.fromEntries(STATUSES.map(s => [s.id, s]));
export const PRIOS = [
  {
    id: 'urgent',
    get name() {
      return t('task.priority.urgent');
    },
    w: 4,
  },
  {
    id: 'high',
    get name() {
      return t('task.priority.high');
    },
    w: 3,
  },
  {
    id: 'medium',
    get name() {
      return t('task.priority.medium');
    },
    w: 2,
  },
  {
    id: 'low',
    get name() {
      return t('task.priority.low');
    },
    w: 1,
  },
  {
    id: 'none',
    get name() {
      return t('task.priority.none');
    },
    w: 0,
  },
];
export const PR = Object.fromEntries(PRIOS.map(p => [p.id, p]));
export const LABELS = [
  {
    id: 'design',
    get name() {
      return t('task.label.design');
    },
    c: 'var(--violet)',
  },
  {
    id: 'frontend',
    get name() {
      return t('task.label.frontend');
    },
    c: 'var(--blue)',
  },
  {
    id: 'backend',
    get name() {
      return t('task.label.backend');
    },
    c: 'var(--teal)',
  },
  {
    id: 'research',
    get name() {
      return t('task.label.research');
    },
    c: 'var(--amber)',
  },
  {
    id: 'content',
    get name() {
      return t('task.label.content');
    },
    c: 'var(--rose)',
  },
  {
    id: 'bug',
    get name() {
      return t('task.label.bug');
    },
    c: 'var(--red)',
  },
  {
    id: 'qa',
    get name() {
      return t('task.label.qa');
    },
    c: 'var(--green)',
  },
  {
    id: 'growth',
    get name() {
      return t('task.label.growth');
    },
    c: 'var(--orange)',
  },
];
export const LB = Object.fromEntries(LABELS.map(l => [l.id, l]));
export const PSTAT = {
  planning: {
    get name() {
      return t('project.status.planning');
    },
    c: 'var(--gray)',
  },
  active: {
    get name() {
      return t('project.status.active');
    },
    c: 'var(--blue)',
  },
  risk: {
    get name() {
      return t('project.status.risk');
    },
    c: 'var(--red)',
  },
  hold: {
    get name() {
      return t('project.status.hold');
    },
    c: 'var(--amber)',
  },
  complete: {
    get name() {
      return t('project.status.complete');
    },
    c: 'var(--green)',
  },
};
export const PCOLORS = {
  indigo: '#5A67D8',
  blue: '#3B82C4',
  violet: '#8662C9',
  teal: '#23918A',
  rose: '#C54B78',
  amber: '#C48A1E',
  green: '#3D8E5F',
  slate: '#6B7280',
};
export const PICONS = [
  'globe',
  'smartphone',
  'megaphone',
  'rocket',
  'component',
  'building-2',
  'layout-grid',
  'palette',
  'code',
  'briefcase',
  'target',
  'layers',
  'zap',
  'heart',
  'folder',
  'sparkles',
];
export const ROLES = ['Owner', 'Admin', 'Member', 'Guest'];
export const TEAMS_SEED = [
  { id: 'design', name: 'Design', icon: 'palette', c: '#8662C9', desc: 'Product design, brand, and research' },
  { id: 'eng', name: 'Engineering', icon: 'code', c: '#3B82C4', desc: 'Web, mobile, and platform engineering' },
  { id: 'mkt', name: 'Marketing', icon: 'megaphone', c: '#C54B78', desc: 'Campaigns, content, and growth' },
  { id: 'product', name: 'Product', icon: 'target', c: '#C48A1E', desc: 'Roadmap, planning, and QA' },
];
