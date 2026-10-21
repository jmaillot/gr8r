/* =====================================================================
   ENTRY: styles, then every module in dependency order (several register
   global listeners or add handlers to the action table when they load), then boot.
   ===================================================================== */
import './styles/index.css';
import './core/utils.js';
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
import { S, D, hydrateFromServer, save } from './core/store.js';
import { api } from './core/api.js';
import { A, refreshMembers } from './actions/actions.js';
import { toast } from './ui/toast.js';
import { ROUTE_NAMES, render, go } from './shell/render.js';

addEventListener('gr8r:save-error', e => {
  const { status, error } = e.detail || {};
  if (status === 401) {
    S.ui.auth = 'login';
    S.ui.errors = {};
    render();
    toast('Your session expired. Sign in again.', { kind: 'err' });
    return;
  }
  if (status === 403) return toast(error || 'Your account has read-only access.', { kind: 'err', ms: 6000 });
  if (status === 409) {
    return toast('This workspace changed in another session. Reload to see the latest version.', {
      kind: 'err',
      ms: 9000,
      action: 'Reload',
      onAction: () => location.reload(),
    });
  }
  toast("Couldn't save to the server — changes are still in this browser.", {
    kind: 'err',
    ms: 8000,
    action: 'Retry',
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
    if (seg === 'file' && (data.files || []).some(f => f.id === key)) return go('file', { id: key });
    if (seg === 'member' && (data.members || []).some(m => m.id === key)) return go('member', { id: key });
  }
  if (ROUTE_NAMES[seg]) return go(seg, {});
}

(async function init() {
  document.documentElement.lang = 'en';
  if (!document.getElementById('sr-live')) {
    const l = document.createElement('div');
    l.id = 'sr-live';
    l.className = 'sr';
    l.setAttribute('aria-live', 'polite');
    document.body.appendChild(l);
  }

  const h = (location.hash || '').slice(1);
  const authRoutes = ['login', 'signup', 'forgot', 'reset', 'verify', 'onboarding'];
  const withServer = await api.init();
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
      S.ui.join = { token: joinToken, ...(inv.ok ? inv.data : { error: inv.error || 'This invite link is not valid.' }) };
      S.ui.auth = 'join';
      render();
      return;
    }
  }

  if (withServer) {
    const user = await api.me();
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
    if (!ws.ok) toast('Could not load this workspace. Check the server logs.', { kind: 'err', ms: 8000 });
    deepLink = restFromPath;
  }

  if (!withServer && authRoutes.includes(h)) S.ui.auth = h;
  else if (h && ROUTE_NAMES[h]) S.ui.route = h;
  else S.ui.route = S.prefs.home || 'home';
  if (deepLink) applyDeepLink(deepLink);
  render();
  if (withServer && S.ui.route === 'members') refreshMembers();
})();

// Dev-only handle for debugging and screenshot tooling; stripped from production builds.
if (import.meta.env.DEV) window.__gr8r = { S, D, A, go, render };
