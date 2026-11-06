/* Timezone resolution funnel (Phase 44, D-05/D-06/D-07) — the single
   label→zone choke point every resolution site calls. Extracted from
   server.js so tests can import the funnel without booting the server
   (server.js opens its DB and listens on import). Zero runtime deps. */

/* D-05: legacy label map resolves on read only — stored labels are never
   rewritten (no migration touches members[*].tz outside a user save).
   Five labels predate Phase 44 (server fixtures); the sixth is the client
   default (src/core/store.js DEFAULT_PREFS.tz). */
export const TZ_BY_LABEL = {
  '(GMT-08:00) Pacific Time': 'America/Los_Angeles',
  '(GMT-05:00) Eastern Time': 'America/New_York',
  '(GMT+00:00) London': 'Europe/London',
  '(GMT+01:00) Berlin': 'Europe/Berlin',
  '(GMT+08:00) Singapore': 'Asia/Singapore',
  '(GMT-07:00) Pacific Time': 'America/Los_Angeles',
};

/* D-06/D-07: one funnel for every tz resolution. Trimmed string input only
   (non-strings → empty); legacy labels map to their IANA ids; otherwise any
   valid IANA zone (aliases accepted) passes Intl validation; hostile,
   unknown, empty, or unresolvable input deterministically falls back to
   Europe/Paris and never throws — the Intl construction inside try/catch is
   the only validator (T-44-01). */
export function resolveTz(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (TZ_BY_LABEL[v]) return TZ_BY_LABEL[v];
  if (v) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: v });
      return v;
    } catch {
      /* RangeError — unknown zone: fall through to the D-07 fallback */
    }
  }
  return 'Europe/Paris';
}

/* (localDate, hour) in the resolved zone. Pure Intl math + the %24 midnight
   guard — byte-identical to the pre-Phase-44 implementation (the only change
   is the label→zone step now flowing through resolveTz). Never cached across
   members or ticks: DST is real (Pitfall 3). */
export function localParts(tzLabel, date = new Date()) {
  const zone = resolveTz(tzLabel);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}
