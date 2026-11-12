/* ---------- GLOBAL SEARCH CORE (DELIV-02) ----------
   searchAll moved verbatim out of src/pages/search.js so the command
   palette (a first-paint surface) can keep it in the entry chunk while
   the search page itself rides a lazy chunk. Pure function — no page
   imports, only core store reads. */
import { foldForSearch } from './utils.js';
import { D, allTasks, canSee, proj, task, visibleProjects } from './store.js';

export function searchAll(q) {
  /* The query is folded ONCE, before the filter runs, and every candidate is folded as it
     is tested — so "elodie" finds "Élodie" (D-06). The empty-query guard is unchanged. */
  const needle = foldForSearch((q || '').trim()).text;
  if (!needle) return { tasks: [], projects: [], people: [], files: [], comments: [] };
  const has = s => foldForSearch(s).text.includes(needle);
  return {
    tasks: allTasks()
      .filter(t => has(t.title) || has(t.key) || has(t.desc.replace(/<[^>]+>/g, '')))
      .slice(0, 30),
    projects: visibleProjects().filter(p => has(p.name) || has(p.desc)),
    people: D().members.filter(m => has(m.name) || has(m.email) || has(m.title)),
    files: D().files.filter(f => has(f.name) && canSee(proj(f.project))),
    comments: D().comments.filter(c => has(c.text) && task(c.task) && canSee(proj(task(c.task).project))),
  };
}
