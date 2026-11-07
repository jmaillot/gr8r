/* public/sw.js — the notification click router (Phase 48, D-48-2).
   Deliberately MINIMAL: no network-interception handler, no lifecycle
   handlers, no caching, no module references (T-48-02 — the
   cache-poisoning surface is eliminated structurally, not mitigated).
   It holds zero strings: every title/body arrives pre-localized through
   showNotification() arguments. The click URL is resolved against
   self.location.origin — same-origin only, never openWindow(rawString)
   (T-48-03). The server serves this file no-cache. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
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
