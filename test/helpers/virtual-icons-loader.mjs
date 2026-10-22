/* Node module hooks for the test suite.
   `src/core/icons.js` imports `virtual:icons` — a Vite virtual module that only
   exists inside `vite build` / `vite dev`. Bare-Node tests that import any module
   which (transitively) imports icons.js would otherwise fail to resolve it. These
   hooks redirect that one specifier to an inline stub whose `ICONS` map is empty:
   `ic()` falls back to its own placeholder rect, so the behavioural code under
   test runs exactly as shipped. */

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'virtual:icons')
    return {
      url: 'data:text/javascript,export const ICONS = {};',
      shortCircuit: true,
    };
  return nextResolve(specifier, context);
}
