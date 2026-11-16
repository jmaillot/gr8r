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
     priority: high            ← task kind only, optional
     ---
     Notes…                    ← task kind: body notes / project: description

     ## +3d Fix the login      ← task kind: ROOT subtask (+Nd due offset)
     ### +4d Repro the crash   ← ### = child of the last ## (nesting works)
       notes for the subtask   ← indented line under the heading
     ## +7d Write the docs

     ## +1d Ship the beta      ← project kind: tasks in ## sections
     ### +0d Design mockups    ← ### = subtasks of the current ## task
     #### +2d Polish pass      ← #### = child of the last ### (3 levels)
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
  const priority = String(meta.priority || '').trim().toLowerCase();

  /* The subtask id is sequential across the whole draft; parentId points at
     the enclosing heading's node (null = root). */
  let seq = 0;
  const subNode = (parent, pos, title, off, note) => ({
    id: 's' + ++seq,
    parentId: parent ? parent.id : null,
    position: pos,
    title,
    done: false,
    ...off,
    ...(note ? { note } : {}),
  });

  /* Walk the ## headings. BOTH kinds nest: task kind stacks ##/###/####
     as a subtask tree; project kind's ## is a task entry and ###/####
     stack under it the same way. */
  const subs = []; /* task kind: the subtask tree (flat list, parentId-linked) */
  const tasks = []; /* project kind: the embedded task tree */
  const notes = []; /* prose between headings */
  let cur = null; /* the open ## task entry (project kind) */
  /* the deepest open node per heading level — a ### parents under the last
     ##, a #### under the last ###; an orphan ### (no ## above) drops. */
  let open2 = null;
  let open3 = null;

  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const h4 = /^####\s+(.*)$/.exec(line);
    const h3 = !h4 && /^###\s+(.*)$/.exec(line);
    const h2 = !h4 && !h3 && /^##\s+(.*)$/.exec(line);
    if (h4 || h3) {
      const { title, ...off } = splitHeading((h4 || h3)[1]);
      if (!title) continue;
      const [note, ni] = collectNotes(body, i + 1);
      if (kind === 'project') {
        /* ### under a project ## = the task's root subtask; #### nests
           under the last ###. Orphans (no open task) drop. */
        if (!cur) continue;
        const parent = h4 ? open3 : null;
        if (h4 && !parent) continue;
        const node = subNode(parent, cur.subtasks.filter(s => s.parentId === (parent ? parent.id : null)).length, title, off, note);
        cur.subtasks.push(node);
        if (h3) open3 = node;
        i = ni - 1;
        continue;
      }
      /* task kind: ### nests under the last ##, #### under the last ###.
         A #### never re-anchors open3 — consecutive ####s are siblings. */
      const parent = h4 ? open3 : open2;
      if (!parent) continue; /* orphan deep heading — no anchor above */
      const node = subNode(parent, subs.filter(s => s.parentId === parent.id).length, title, off, note);
      subs.push(node);
      if (h3) open3 = node;
      i = ni - 1;
      continue;
    }
    if (h2) {
      const { title, ...off } = splitHeading(h2[1]);
      if (!title) continue;
      if (kind === 'project') {
        cur = { title, subtasks: [], ...off };
        tasks.push(cur);
        open2 = null;
        open3 = null;
      } else {
        const [note, ni] = collectNotes(body, i + 1);
        const node = subNode(null, subs.length, title, off, note);
        subs.push(node);
        open2 = node;
        open3 = null;
        i = ni - 1;
      }
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
      body: {
        title: name,
        subtasks: subs,
        ...(priority ? { priority } : {}),
        ...(prose ? { notes: prose } : {}),
      },
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

/* The downloadable examples live in test/fixtures/template-example.json
   ({ task, project }) — data files, not source prose, so the i18n scan's
   display-label rule (no untranslated English in src/) stays green while
   the parser stays pure. EN only: the format's keywords are English
   (kind/name/icon), and an FR twin would inline French bytes into the
   always-shipped template-ui chunk (the no-French-byte build gate). One
   COMPLETE example per kind. */
export const templateExampleText = which => EXAMPLE[which === 'project' ? 'project' : 'task'] || '';
