/* =====================================================================
   core: prefs — the pure preference-value helpers.

   A preference value reaches the bag the way the user chose it: the
   'auto' sentinel is the string 'auto', never a number and never a mapped
   value, so it survives a save and is still read as the sentinel on the
   next render. The only coercion the bag ever applies is the numeric
   week start.

   The helper lives in its own leaf module because src/actions/actions.js
   reaches a Vite virtual module through the store: bare Node cannot
   import that module, and the contract needs a function a test can call.
   ===================================================================== */
export const prefValue = (key, value) => (key === 'weekStart' ? +value : value);
