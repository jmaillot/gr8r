/* public/sw.js — the notification click router (Phase 48, D-48-2).
   Deliberately MINIMAL: no network-interception handler, no lifecycle
   handlers, no caching, no module references (T-48-02 — the
   cache-poisoning surface is eliminated structurally, not mitigated).
   It holds zero strings: every title/body arrives pre-localized through
   showNotification() arguments. The click URL is resolved against
   self.location.origin and its origin is CHECKED for equality — an absolute
   cross-origin string (or a malformed one) falls back to the workspace root,
   never openWindow(rawString) (T-48-03). The server serves this file no-cache. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  let url = '/';
  try {
    const u = new URL(e.notification.data?.url || '/', self.location.origin);
    if (u.origin === self.location.origin) url = u.href;
  } catch { /* malformed data.url → workspace root */ }
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) {
      if ('focus' in c) {
        await c.focus();
        if (c.navigate) await c.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    /* D-12/D-13: any open window client of this origin means the visible-tab
       poll path owns delivery — the OS notification is skipped. Best-effort
       inside the worker only: no page handshake, a rare duplicate while
       switching tabs is accepted. The payload arrives pre-localized from the
       server (T-48-02); a malformed or empty payload degrades to silence. */
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (cs.length) return;
    let p = {};
    try { p = e.data ? e.data.json() : {}; } catch { /* malformed payload → silence */ }
    if (!p.title) return;
    await self.registration.showNotification(p.title, {
      body: p.body || '',
      tag: p.tag || 'gr8r-push',
      icon: '/favicon.svg',
      data: { url: p.url || '/' },
    });
  })());
});
