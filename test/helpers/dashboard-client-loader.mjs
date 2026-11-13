/* Node module hooks for the dashboard client tests (60-03).
   `src/pages/dashboard.js` is the REAL module under test — everything it
   transitively imports that touches the browser at import time (store.js's
   pagehide listener, utils.js's querySelectorAll pass) or that the tests must
   control (api.js's fetch, render.js's render loop, ROUTE_TEARDOWN registry)
   is redirected BY RESOLVED-PATH SUFFIX to data-URL stubs. Same resolve-hook
   pattern as virtual-icons-loader.mjs; the `virtual:icons` redirect is kept
   so the real icons.js still resolves. */

const stub = code => `data:text/javascript,${encodeURIComponent(code)}`;

const STUBS = [
  [
    '/core/store.js',
    stub(`export const S = { ui: {} };
export const D = () => ({ ws: {}, projects: [], tasks: [] });`),
  ],
  [
    '/core/api.js',
    stub(`export const api = { dashboard: (...args) => globalThis.__apiDashboard(...args) };`),
  ],
  [
    '/shell/render.js',
    stub(`export const ROUTE_TEARDOWN = {};
export function render() { globalThis.__renders = (globalThis.__renders || 0) + 1; }`),
  ],
  [
    '/core/utils.js',
    stub(`export const esc = s => String(s ?? '');
export const relDate = () => '';`),
  ],
  ['/core/i18n.js', stub(`export const t = (key) => key;`)],
  [
    '/core/theme.js',
    stub(`export const effectiveDark = () => false;
export function setDateFormat() {}`), // icons.js → theme.js → utils.js (stubbed)
  ],
  [
    '/ui/helpers.js',
    stub(`export const av = () => '';
export const empty = () => '';`),
  ],
  ['/components/task-list.js', stub(`export const actHtml = () => '';`)],
];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'virtual:icons')
    return {
      url: 'data:text/javascript,export const ICONS = {};',
      shortCircuit: true,
    };
  const resolved = await nextResolve(specifier, context);
  const hit = STUBS.find(([suffix]) => resolved.url.endsWith(suffix));
  if (hit) return { url: hit[1], shortCircuit: true };
  return resolved;
}
