/* strengthMeter — shared password-strength template (moved verbatim from
   src/pages/settings.js so both the settings chunk and the entry-resident auth
   page can use it without an entry→settings edge). Pure template; only imports
   the catalogue translator. */
import { t } from '../core/i18n.js';

export function strengthMeter(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[0-9]/.test(pw) && /[a-zA-Z]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  const c = ['var(--red)', 'var(--red)', 'var(--amber)', 'var(--green)', 'var(--green)'][s];
  const n = t(['settings.pw.meter.tooShort', 'settings.pw.meter.weak', 'settings.pw.meter.fair', 'settings.pw.meter.good', 'settings.pw.meter.strong'][s]);
  return pw
    ? `<div class="row" style="gap:8px"><div class="strength grow" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i < s ? 'on' : ''}" style="--c:${c}"></i>`).join('')}</div><span style="font-size:11.5px;color:${c};width:60px;text-align:right">${n}</span></div>`
    : '';
}
