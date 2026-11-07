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
