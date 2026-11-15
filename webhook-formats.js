/* =====================================================================
   WEBHOOK FORMATS — Phase 67 (WHK-04) — pure, DOM-free Teams payload
   formatters. Mirrors the src/core/subtree.js discipline: NO IMPORTS
   AT ALL, no DOM access, no I/O — unit-testable with node --test.
   =====================================================================
   Three formats (D-12; default teams-adaptive at creation, the others
   selectable, unknown value falls back to teams-adaptive):

   - teams-adaptive  → the MS Learn Workflows "When a Teams webhook
     request is received" body: { type:'message', attachments:[{
     contentType:'application/vnd.microsoft.card.adaptive', contentUrl:null,
     content:{ $schema, type:'AdaptiveCard', version:'1.4', body:[TextBlock…] } }]
   - teams-messagecard → legacy MessageCard (renders in Teams, no action
     buttons — REQUIREMENTS.md excludes office.com connectors, not the card)
   - raw-json → the whitelisted envelope itself, stringified verbatim by
     the caller (the HMAC signs exactly that raw string)

   WHK-03 28 KB cap (D-02): the cap applies to the FULL JSON body the
   workflow posts (Pitfall 4) and is measured with Buffer.byteLength —
   UTF-8 bytes, never code points. truncateToCap shortens the event's
   designated big field (comment body / task title) IN THE ENVELOPE,
   re-measures after formatting, and delivers anyway — an oversized event
   is never dropped, its text is cut.

   D-14 AAD mention: a task.assigned assignee with a persisted oid renders
   a real `<at>Name</at>` mention backed by content.msteams.entities
   (mentioned.id = oid — the shape pinned by webhook-formats.test.mjs,
   research assumption A1); without an oid the name renders bold
   (**Name**) and NO entities entry exists. No per-hook toggle.

   D-04: occurredAt renders verbatim in every format — the envelope
   builder already stamps it as an ISO 8601 UTC string.
   ===================================================================== */

/* The 28 KB Teams message cap, in UTF-8 bytes. */
const CAP = 28672;
const MARKER = ' … [truncated]';
/* D-02 truncation targets, in order: the comment body, then the task
   title fields. Everything else in the envelope is small by construction
   (whitelisted ids and short names). */
const BIG_FIELDS = ['body', 'taskTitle', 'title'];

const byteLen = s => Buffer.byteLength(s, 'utf8');

/* -------- per-event rendering: headline + detail lines ----------------- */

const headline = env => {
  switch (env.event) {
    case 'task.created':
      return `Task created: ${env.title || env.taskId || 'untitled'}`;
    case 'task.completed':
      return `Task completed: ${env.title || env.taskId || 'untitled'}`;
    case 'task.assigned':
      return `Task assigned: ${env.title || env.taskId || 'untitled'}`;
    case 'task.deleted':
      return `Task deleted: ${env.title || env.taskId || 'untitled'}`;
    case 'comment.added':
      return `Comment on "${env.taskTitle || env.taskId || 'untitled'}"`;
    case 'due.reminder':
      return `Reminder: ${env.title || env.taskId || 'untitled'}${env.due ? ` (due ${env.due})` : ''}`;
    case 'project.completed':
      return `Project completed: ${env.projectName || env.projectId || 'untitled'}`;
    case 'subtask.tree-changed':
      return `Subtask tree changed: ${env.taskTitle || env.taskId || 'untitled'}`;
    default:
      return `${env.event || 'Event'}: ${env.title || env.taskTitle || env.projectName || ''}`;
  }
};

/* D-14 mention rendering: real <at> mention when the assignee carries a
   persisted oid, bold-name fallback otherwise. Returns the rendered text
   plus the entity list (empty when no assignee has an oid). */
function renderMentions(env) {
  const mentions = Array.isArray(env.mentions) ? env.mentions : [];
  if (!mentions.length) return null;
  const entities = [];
  const parts = mentions.map(m => {
    if (m?.oid) {
      const text = `<at>${m.name || m.memberId}</at>`;
      entities.push({ type: 'mention', text, mentioned: { id: m.oid, name: m.name || m.memberId } });
      return text;
    }
    return `**${m?.name || m?.memberId || '?'}**`;
  });
  return { text: parts.join(', '), entities };
}

/* The D-03 context trio line — omitted pieces are dropped, never rendered
   as blank labels (system events carry no author). */
function contextLine(env) {
  const bits = [];
  if (env.projectName) bits.push(`Project: ${env.projectName}`);
  if (env.authorName) bits.push(`By: ${env.authorName}`);
  return bits.join(' · ');
}

function adaptiveCard(env) {
  const body = [{ type: 'TextBlock', text: headline(env), wrap: true }];
  const content = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body,
  };
  if (env.event === 'due.reminder' && env.due) body.push({ type: 'TextBlock', text: `Due ${env.due}`, wrap: true });
  const ctx = contextLine(env);
  if (ctx) body.push({ type: 'TextBlock', text: ctx, wrap: true });
  if (env.occurredAt) body.push({ type: 'TextBlock', text: env.occurredAt, wrap: true }); // D-04
  const mention = renderMentions(env);
  if (mention) body.push({ type: 'TextBlock', text: mention.text, wrap: true });
  if (env.body) body.push({ type: 'TextBlock', text: env.body, wrap: true });
  if (env.event === 'task.assigned' && Array.isArray(env.assignees)) {
    /* No mention objects available (fallback path) — list the assignee
       count so the card still conveys the assignment. */
    if (!mention && env.assignees.length) body.push({ type: 'TextBlock', text: `${env.assignees.length} assignee(s)`, wrap: true });
  }
  if (mention && mention.entities.length) content.msteams = { entities: mention.entities };
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content,
      },
    ],
  };
}

function messageCard(env) {
  const mention = renderMentions(env);
  const sections = [];
  const ctx = contextLine(env);
  if (ctx) sections.push({ activitySubtitle: ctx });
  if (env.occurredAt) sections.push({ text: env.occurredAt }); // D-04
  if (env.event === 'due.reminder' && env.due) sections.push({ text: `Due ${env.due}` });
  if (mention) sections.push({ text: mention.text });
  if (env.body) sections.push({ text: env.body });
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    summary: headline(env),
    title: headline(env),
    sections,
  };
}

/* -------- public API --------------------------------------------------- */

/* Dispatch the three formats. An unknown/absent format value falls back to
   teams-adaptive (D-12 default). raw-json returns the envelope itself —
   the caller stringifies it verbatim and signs exactly that string. */
export function formatPayload(format, envelope) {
  try {
    const f = format === 'teams-messagecard' || format === 'raw-json' ? format : 'teams-adaptive';
    if (f === 'raw-json') return envelope;
    if (f === 'teams-messagecard') return messageCard(envelope);
    return adaptiveCard(envelope);
  } catch {
    /* fail-absent: a broken envelope degrades to the adaptive shell */
    return adaptiveCard({});
  }
}

const jsonLen = (envelope, format) => byteLen(JSON.stringify(formatPayload(format, envelope)));

/* D-02 truncate-and-deliver: while the FULL formatted JSON body exceeds the
   cap, halve the biggest designated field in the envelope and re-measure
   AFTER formatting (Pitfall 4). An event is never dropped for size — when
   no big field remains to shrink, the caller delivers as-is (fail-absent). */
export function truncateToCap(envelope, format) {
  try {
    let out = envelope;
    let guard = 0;
    while (jsonLen(out, format) > CAP && guard < 200) {
      guard += 1;
      const field = BIG_FIELDS.find(f => typeof out[f] === 'string' && out[f].length > MARKER.length);
      if (!field) break; // nothing left to shrink — deliver oversized rather than drop
      out = { ...out, [field]: out[field].slice(0, Math.max(out[field].length >> 1, 0)) + MARKER };
    }
    return out;
  } catch {
    return envelope;
  }
}
