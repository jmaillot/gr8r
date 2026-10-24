/* =====================================================================
   ENTRY: styles, then every module in dependency order (several register
   global listeners or add handlers to the action table when they load), then boot.
   ===================================================================== */
import './styles/index.css';
import './core/utils.js';
import './core/i18n.js';
import './core/icons.js';
import './core/constants.js';
import './data/seed.js';
import './core/store.js';
import './ui/helpers.js';
import './core/theme.js';
import './ui/toast.js';
import './ui/select.js';
import './shell/render.js';
import './shell/layout.js';
import './shell/skeletons.js';
import './shell/view-engine.js';
import './components/task-list.js';
import './pages/home.js';
import './pages/overview.js';
import './pages/my-tasks.js';
import './pages/tasks.js';
import './pages/inbox.js';
import './pages/notifications.js';
import './pages/favorites.js';
import './pages/projects.js';
import './pages/members.js';
import './pages/activity.js';
import './pages/search.js';
import './pages/errors.js';
import './pages/project.js';
import './views/project-overview.js';
import './views/board.js';
import './views/table.js';
import './views/calendar.js';
import './views/timeline.js';
import './views/files.js';
import './overlays/drawer.js';
import './overlays/modals.js';
import { openModal } from './overlays/modals.js';
import './overlays/popovers.js';
import './overlays/context-menu.js';
import './overlays/palette.js';
import './pages/settings.js';
import './pages/auth.js';
import './pages/design-system.js';
import './actions/actions.js';
import './actions/events.js';
import './actions/keyboard.js';
import './actions/drag-drop.js';
import './features/teams.js';
import './features/subtasks.js';
import './features/archive.js';
import './actions/teams.js';
import './actions/subtasks.js';
import './actions/archive.js';
import { S, D, hydrateFromServer, save, consumeLegacyLang } from './core/store.js';
import { api } from './core/api.js';
import { A, refreshMembers } from './actions/actions.js';
import { toast } from './ui/toast.js';
import { ROUTE_IDS, render, go } from './shell/render.js';
import { t as tk, LOCALES, getLocale, negotiate, primeLocale, readStoredLocale } from './core/i18n.js';

/* The locale change re-renders the app: one listener, one re-render, never
   batched or debounced (D-01). The loop guard in applyPrefs() keeps this from
   cycling: setLocale only fires when the target locale actually differs. */
addEventListener('gr8r:locale', () => render());

addEventListener('gr8r:save-error', e => {
  const { status, error } = e.detail || {};
  if (status === 401) {
    S.ui.auth = 'login';
    S.ui.errors = {};
    render();
    toast(tk('err.sessionExpired'), { kind: 'err' });
    return;
  }
  if (status === 403) return toast(error || tk('err.readOnlyAccess'), { kind: 'err', ms: 6000 });
  if (status === 409) {
    return toast(tk('err.workspaceChanged'), {
      kind: 'err',
      ms: 9000,
      action: tk('act.reload'),
      onAction: () => location.reload(),
    });
  }
  toast(tk('err.saveNotSynced'), {
    kind: 'err',
    ms: 8000,
    action: tk('act.retry'),
    onAction: () => {
      S.ui.conflict = false;
      save();
    },
  });
});

/* Restore a shared link such as /w/acme/project/website-launch. */
function applyDeepLink(rest) {
  const [seg, key] = String(rest).split('/');
  const data = D();
  if (!seg) return;
  if (key) {
    const find = (list, field) => list.find(x => String(x[field] || '').toLowerCase() === key.toLowerCase());
    if (seg === 'project') {
      const p = find(data.projects || [], 'key');
      if (p) return go('project', { id: p.id });
      return go('project', { id: '__missing' });
    }
    if (seg === 'task') {
      const t = find(data.tasks || [], 'key');
      if (t) return go('task', { id: t.id });
    }
    /* D-13: the copied pathname link /w/:slug/file/:id is the one destination in both
       worlds — inside the SPA it opens the preview modal on the landed route (the same
       call A.previewFile makes; there is no 'file' route page); outside the SPA the
       server's Accept negotiation serves the raw bytes (12-02 route). */
    if (seg === 'file') {
      const f = (data.files || []).find(x => x.id === key);
      if (f) {
        openModal({ type: 'filePreview', file: f, tid: f.task });
        return;
      }
    }
    if (seg === 'member' && (data.members || []).some(m => m.id === key)) return go('member', { id: key });
  }
  if (ROUTE_IDS.includes(seg)) return go(seg, {});
}

/* D-04/D-05/D-06: the one-time migration seed. The old language lived in the shared workspace
   document; every member of a formerly-French workspace seeds their own account on their first
   post-upgrade boot. Guard: NULL account locale AND the exact legacy French label — it never
   overwrites an explicit choice, never touches the workspace row (only the account PATCH is
   called), and is a no-op on fresh installs. A failed PATCH is ignored: the guard retries on
   the next boot and NULL stays negotiated. The result applies in the same boot, silently. */
async function seedLegacyLocale() {
  const legacy = consumeLegacyLang();
  const french = LOCALES.find(l => l.code === 'fr')?.name;
  if (api.user?.locale != null || !french || legacy !== french) return;
  const r = await api.patchMe({ locale: 'fr' });
  if (r.ok) await primeLocale('fr');
}

(async function init() {
  if (!document.getElementById('sr-live')) {
    const l = document.createElement('div');
    l.id = 'sr-live';
    l.className = 'sr';
    l.setAttribute('aria-live', 'polite');
    document.body.appendChild(l);
  }

  /* D-07/D-08: the negotiated browser language is applied synchronously at the top, before
     any network call and before any possible render, so every surface — login, signup,
     verify, /join — comes up in it. primeLocale is the silent variant: the re-render event
     would paint an uninitialised shell. Demo mode honours its own localStorage choice. */
  const negotiated = negotiate();
  await primeLocale(negotiated);

  const h = (location.hash || '').slice(1);
  const authRoutes = ['login', 'signup', 'forgot', 'reset', 'verify', 'onboarding'];
  const withServer = await api.init();
  if (!withServer) await primeLocale(readStoredLocale() || negotiated);
  const joinToken = (location.pathname.match(/^\/join\/([A-Za-z0-9_-]{16,128})\/?$/) || [])[1];
  const slugFromPath = (location.pathname.match(/^\/w\/([a-z0-9-]{2,40})(?:\/|$)/) || [])[1];
  const restFromPath = (location.pathname.match(/^\/w\/[a-z0-9-]{2,40}\/(.+?)\/?$/) || [])[1] || '';
  let deepLink = '';

  if (joinToken) {
    if (!withServer) {
      S.ui.auth = 'login';
      render();
      return;
    }
    const signedIn = await api.me();
    if (signedIn) {
      // Already a member: don't consume the invite, just go to the workspace.
      history.replaceState(null, '', '/');
    } else {
      const inv = await api.invite(joinToken);
      S.ui.join = { token: joinToken, ...(inv.ok ? inv.data : { error: inv.error || tk('err.inviteInvalid') }) };
      S.ui.auth = 'join';
      render();
      return;
    }
  }

  if (withServer) {
    const user = await api.me();
    /* D-11: a non-NULL account locale replaces the negotiated value, still pre-render; a NULL
       one keeps the negotiated value. */
    if (user?.locale && user.locale !== getLocale()) await primeLocale(user.locale);
    if (!user) {
      // The server is authoritative: no session means the app is not usable yet.
      S.ui.wantedSlug = slugFromPath || null;
      S.ui.auth = authRoutes.includes(h) ? h : 'login';
      render();
      return;
    }
    const slug = slugFromPath && api.rolesIn(slugFromPath) ? slugFromPath : api.workspaces[0]?.slug;
    if (!slug) {
      // Signed in, but not a member of any workspace yet.
      S.ui.auth = api.canCreateWorkspace ? 'onboarding' : 'no-workspace';
      if (api.canCreateWorkspace) {
        S.ui.onb = 1;
        S.ui.onbData = { ...S.ui.onbData, ws: '', url: '', urlTouched: false };
      }
      render();
      return;
    }
    if (slug !== slugFromPath) history.replaceState(null, '', `/w/${slug}`);
    const ws = await hydrateFromServer(slug);
    if (ws.status === 401) {
      S.ui.auth = 'login';
      render();
      return;
    }
    if (!ws.ok) toast(tk('err.wsLoadFailed'), { kind: 'err', ms: 8000 });
    else await seedLegacyLocale();
    deepLink = restFromPath;
  }

  if (!withServer && authRoutes.includes(h)) S.ui.auth = h;
  else if (h && ROUTE_IDS.includes(h)) S.ui.route = h;
  else S.ui.route = S.prefs.home || 'home';
  if (deepLink) applyDeepLink(deepLink);
  render();
  if (withServer && S.ui.route === 'members') refreshMembers();
})();

// Dev-only handle for debugging and screenshot tooling; stripped from production builds.
if (import.meta.env.DEV) window.__gr8r = { S, D, A, go, render };
