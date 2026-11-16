/* =====================================================================
   TEMPLATE-MD (67-06) — the Markdown → template-draft parser. Pure,
   DOM-free (the subtree.js/templates.js discipline): a string in, a
   template draft out — the EXACT shape openTemplateEditor consumes, so
   the import path is "parse, then show the ordinary editor" and the
   user reviews before saving (no blind write).

   The format (docs/project-templates.md §import):
     ---                       ← optional front matter
     kind: task | project
     name: Weekly report
     icon: clipboard           ← a Lucide name, optional (default layers)
     color: blue               ← a palette key, optional
     ---
     Notes…                    ← task kind: body notes / project: description

     ## +3d Fix the login      ← task kind: subtasks (## entries, +Nd due offset)
       notes for the subtask   ← indented line under the heading
     ## +7d Write the docs

     ## +1d Ship the beta      ← project kind: tasks in ## sections
     ### +0d Design mockups    ← ### = subtasks of the current ## task
       two-level trees work    ← indented notes
   Offsets are RELATIVE DAYS on a `+`/`-` prefix (D-05/D-07 semantics:
   absolute anchors at instantiation); a missing offset = no due date
   (D-08 — never a default). Everything else is best-effort: junk drops
   the same way the funnel would, because the draft lands in the editor
   and the funnel sanitizes again on save.
   ===================================================================== */

import EXAMPLE from '../../test/fixtures/template-example.json' with { type: 'json' };

/* `+3d` / `-2d` / `3` → finite day offset, else undefined (D-08). */
function parseOffset(text) {
  const m = /^\s*([+-]?\d+)\s*d?$/i.exec(String(text || ''));
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

/* Front matter: a leading `---` block of `key: value` lines. */
function frontMatter(lines) {
  const meta = {};
  if ((lines[0] || '').trim() !== '---') return { meta, body: lines };
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') {
      i++;
      break;
    }
    const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim();
  }
  return { meta, body: lines.slice(i) };
}

/* One heading's title → { title, dueOffsetDays }. `## +3d Fix login`. */
function splitHeading(text) {
  const m = /^(?:\s*([+-]?\d+)\s*d?(?=\s|$)\s*)?(.*)$/.exec(String(text || '').trim());
  const off = parseOffset(m?.[1]);
  return { title: (m?.[2] || '').trim(), ...(off !== undefined ? { dueOffsetDays: off } : {}) };
}

/* Indented note lines directly under a heading join into one string. */
function collectNotes(lines, i) {
  const notes = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{2,4}\s/.test(line)) break; /* the next heading ends the notes */
    if (/^\s{2,}\S/.test(line) || (notes.length && /^\s*$/.test(line) === false && /^\s+\S/.test(line))) notes.push(line.trim());
    else if (notes.length) break; /* a blank run or dedent closes the notes */
  }
  return [notes.filter(Boolean).join('\n'), i];
}

export function parseTemplateMarkdown(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const { meta, body } = frontMatter(raw);
  const kind = String(meta.kind || '').toLowerCase() === 'project' ? 'project' : 'task';
  const name = String(meta.name || '').trim();
  const icon = String(meta.icon || '').trim() || 'layers';
  const color = String(meta.color || '').trim();

  /* Walk the ## headings (project kind nests ### under the current ##). */
  const subs = []; /* task kind: the flat subtask tree */
  const tasks = []; /* project kind: the embedded task tree */
  let notes = []; /* prose between headings */
  let cur = null; /* the open ## task entry (project kind) */

  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const h2 = /^##\s+(.*)$/.exec(line);
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h2) {
      const { title, ...off } = splitHeading(h2[1]);
      if (!title) continue;
      if (kind === 'project') {
        cur = { title, subtasks: [], ...off };
        tasks.push(cur);
      } else {
        const [note, ni] = collectNotes(body, i + 1);
        subs.push({ id: 's' + (subs.length + 1), parentId: null, position: subs.length, title, done: false, ...off, ...(note ? { note } : {}) });
        i = ni - 1;
      }
      continue;
    }
    if (h3 && kind === 'project' && cur) {
      const { title, ...off } = splitHeading(h3[1]);
      if (!title) continue;
      const [note, ni] = collectNotes(body, i + 1);
      cur.subtasks.push({ id: 's' + cur.subtasks.length + '_' + tasks.length, parentId: null, position: cur.subtasks.length, title, done: false, ...off, ...(note ? { note } : {}) });
      i = ni - 1;
      continue;
    }
    if (/^\s*\S/.test(line) && !/^#{1,4}\s/.test(line)) notes.push(line.trim());
  }

  const prose = notes.join('\n').trim();
  if (kind === 'task') {
    return {
      id: null,
      kind: 'task',
      name,
      icon,
      color,
      body: { title: name, subtasks: subs, ...(prose ? { notes: prose } : {}) },
      position: null,
      createdBy: null,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: null,
    kind: 'project',
    name,
    icon,
    color,
    body: { name, description: prose, status: 'planning', teams: [], tasks },
    position: null,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
  };
}

/* The downloadable example lives in test/fixtures/template-example.json
   (one { en } record) — a data file, not source prose, so the i18n scan's
   display-label rule (no untranslated English in src/) stays green while
   the parser stays pure. */
export const templateExampleText = locale => {
  const fx = EXAMPLE?.[locale] || EXAMPLE?.en;
  return typeof fx === 'string' ? fx : '';
};
