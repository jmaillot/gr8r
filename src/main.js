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
import { S, D, hydrateFromServer, save, consumeLegacyLang, hasPendingChanges, myNotifs, proj, canSee } from './core/store.js';
import { api } from './core/api.js';
import { A, refreshMembers } from './actions/actions.js';
import { toast } from './ui/toast.js';
import { ROUTE_IDS, render, go } from './shell/render.js';
import { $ } from './core/utils.js';
import { t as tk, LOCALES, getLocale, negotiate, primeLocale, readStoredLocale } from './core/i18n.js';

/* The locale change re-renders the app: one listener, one re-render, never
   batched or debounced (D-01). The loop guard in applyPrefs() keeps this from
   cycling: setLocale only fires when the target locale actually differs. */
addEventListener('projects:locale', () => render());

/* P4-a notification poll (30s): hydrate the current workspace and re-render only
   when my unread count changed, so other members' notifications arrive without a
   full refresh. Skipped while a local edit is travelling to the server or the
   session is in conflict — hydration would clobber the client copy. */
let _pollUnread = -1;
const pollNotifs = async () => {
  if (!api.enabled || !api.user || S.ui.conflict || hasPendingChanges() || S.ui.auth) return;
  const slug = api.workspace?.slug;
  if (!slug) return;
  const res = await hydrateFromServer(slug);
  if (!res.ok) return;
  const unread = myNotifs().filter(n => !n.read).length;
  if (unread !== _pollUnread) {
    _pollUnread = unread;
    render();
  }
};
setInterval(pollNotifs, 30000);
addEventListener('projects:notifs', () => pollNotifs());

addEventListener('projects:save-error', e => {
  const { status, error } = e.detail || {};
  if (status === 401) {
    S.ui.auth = 'login';
    S.ui.errors = {};
    render();
    /* D-28: a mid-session save 401 always carries the revocation code (push only
       runs for a signed-in account), and the central teardown registered in
       actions.js already fired inside call() before push() dispatched this event —
       it owns the honest signedOutElsewhere copy. No generic toast here. */
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

/* Restore a shared link such as /w/acme/project/website-launch, or resolve a
   popstate URL (LINK-04, plan 23-04: opt.back). Both entries ride this single
   URL→view resolution; opt.back threads into go() so a popstate never pushes
   another history entry. */
function applyDeepLink(rest, opt = {}) {
  const [seg, key] = String(rest).split('/');
  const data = D();
  if (!seg) return;
  if (key) {
    const find = (list, field) => list.find(x => String(x[field] || '').toLowerCase() === key.toLowerCase());
    if (seg === 'project') {
      const p = find(data.projects || [], 'key');
      if (p) return go('project', { id: p.id }, opt);
      return go('project', { id: '__missing' }, opt);
    }
    if (seg === 'task') {
      /* D-01/D-02/D-03 (plan 23-01; plan 23-04 routes the URL write through
         go()): the task view IS the drawer — there is no 'task' page in
         renderPage's map. The drawer state A.openTask drives is set first so
         urlForView() resolves the task URL inside go()'s single write path
         (pushState on entry, nothing on popstate — the browser already set
         it). keepDrawer preserves the drawer on narrow screens, matching the
         pre-23-04 behaviour where the drawer was applied after go(). */
      const t = find(data.tasks || [], 'key');
      if (t && canSee(proj(t.project))) {
        S.ui.drawer = t.id;
        S.ui.drawerFull = S.prefs.openTasks === 'full' || (S.ui.drawerFull && S.ui.drawer === t.id);
        S.ui.pop = null;
        S.ui.palette = null;
        S.ui.modals = [];
        S.ui.mention = null;
        S.ui.subOpen = null;
        S.ui.drawerTab = S.ui.drawerTab || 'comments';
        go('project', { id: t.project }, { ...opt, keepDrawer: true });
        const dr = $('.drawer');
        if (dr && !dr.contains(document.activeElement)) dr.focus({ preventScroll: true });
        return;
      }
      /* D-02 + no-oracle lean (T-23-02): an unknown key and a permission-hidden
         task land on the workspace view with the identical notice — no leak
         that the task exists. The drawer, if one was open, drops with the view. */
      S.ui.drawer = null;
      go('home', {}, opt);
      toast(tk('err.taskNotFound'), { kind: 'err' });
      return;
    }
    /* D-13 (revised, plan 12-05): the copied pathname /w/:slug/file/:id serves
        the raw bytes directly — server-side, in every world, through the
        byte-only route. In-app previews open through the preview modal via
        A.previewFile. One URL, one authoritative byte source; no SPA branch
        claims /file/:id. The project/task/member deep-link branches below
        still bootstrap via the generic route SPA fallback. */
    if (seg === 'member' && (data.members || []).some(m => m.id === key)) return go('member', { id: key }, opt);
  }
  if (ROUTE_IDS.includes(seg)) return go(seg, {}, opt);
}

/* LINK-04 (plan 23-04): exactly ONE popstate handler, registered once at
   boot. Browser back/forward resolve through the same URL→view resolution
   deep links use (T-23-05: no new parsing surface — same canSee checks, same
   not-found handling), always navigating with { back: true } so a popstate
   never pushes a history entry. Auth/workspace-transition addresses (/, the
   bare /w/:slug root the existing replaceState sites wrote, /login after
   sign-in) map to the workspace home view; cross-workspace entries cannot be
   restored by the hydrated document and land home too. Dropping the drawer
   on those entries is the counterpart of its close-push (D-03): back into
   the underlying view's entry closes the drawer without pushing. */
addEventListener('popstate', () => {
  if (!api.enabled || !api.user || S.ui.auth) return;
  const m = location.pathname.match(/^\/w\/([a-z0-9-]{2,40})(?:\/(.+?))?\/?$/);
  const isTask = !!(m && m[1] === D().ws?.url && m[2] && m[2].startsWith('task/'));
  if (!isTask) {
    /* Leaving the task context: the drawer drops with the entry (counterpart
       of its close-push, D-03) — otherwise urlForView would rewrite the
       restored view's URL back to the task address. */
    S.ui.drawer = null;
    S.ui.drawerFull = false;
    S.ui.subOpen = null;
  }
  if (m && m[1] === D().ws?.url && m[2]) return applyDeepLink(m[2], { back: true });
  go('home', {}, { back: true });
});

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
      // LINK-02 (D-04): a logged-out deep link must not lose its path at the
      // login screen. When the URL is a deep link (restFromPath non-empty, so
      // not a bare auth route), rewrite the document URL to /login?next=<path>
      // BEFORE render — mirroring the server file-route 302 shape so both carry
      // paths converge in finishLogin's single path-only validator. The value
      // is built ONLY from location.pathname (never a client-supplied next),
      // and the bare /login entry is untouched. The validator in finishLogin
      // (src/actions/actions.js) stays the single source of truth.
      S.ui.wantedSlug = slugFromPath || null;
      if (restFromPath) {
        history.replaceState(null, '', `/login?next=${encodeURIComponent(location.pathname)}`);
      }
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
      /* D-28: the honest signedOutElsewhere toast arrives from the central
         teardown registered in actions.js — this branch keeps only the instant
         redirect, so it is no longer the silent one the verification flagged. */
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
  if (deepLink) applyDeepLink(deepLink, { replace: true });
  render();
  if (withServer && S.ui.route === 'members') refreshMembers();
})();

// Dev-only handle for debugging and screenshot tooling; stripped from production builds.
if (import.meta.env.DEV) window.__projects = { S, D, A, go, render };
