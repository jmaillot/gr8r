/* Inbox burst coalescing — pure transform (Phase 61, NOTIF-03 / D-10..D-13).
   Render-only by ruling (D-10): the server keeps one row per notification; the
   inbox groups at display. Trigger = same task + same type among UNREAD rows
   (D-11, generic over all types — subsumes the validated D-05 classes incl.
   reminders), NO time window: coalescing is key-based over the whole (already
   time-sorted) list, not adjacency — interleaved rows of other tasks/types or
   read siblings do not split a group. Read rows stand alone and groups never
   absorb read siblings. The summary sits at the newest member's position.
   Zero imports: consumable from both the page chunk (inbox.js) and the actions
   chunk without chunk-coupling (Phase 56 discipline). */
export function groupBursts(ns, openSet) {
  const groups = new Map();
  for (const n of ns) {
    if (n.read || !n.task) continue;
    const gk = n.task + '|' + n.type;
    let m = groups.get(gk);
    if (!m) groups.set(gk, (m = []));
    m.push(n);
  }
  /* Lone unread rows stay plain notifications — collect their ids to pass through. */
  const singles = new Set();
  for (const members of groups.values()) if (members.length === 1) singles.add(members[0].id);
  const out = [];
  for (const n of ns) {
    if (n.read || !n.task || singles.has(n.id)) {
      out.push(n);
      continue;
    }
    const gk = n.task + '|' + n.type;
    const members = groups.get(gk);
    if (members[0].id !== n.id) continue; /* non-newest member — collapsed into the summary */
    const open = !!(openSet && openSet.has(gk));
    out.push({ burst: true, gk, members, open });
    /* Expanded groups flatten their members (rendered via inboxItem unchanged)
       right after the summary descriptor; collapsed groups render summary only. */
    if (open) out.push(...members);
  }
  return out;
}
/* Pure group mark-read helper: every unread row matching the group key fans to
   read=true — asserted without DOM, consumed by the burstRead action. */
export function burstUnreadIds(ns, gk) {
  return ns.filter(n => !n.read && n.task + '|' + n.type === gk).map(n => n.id);
}
