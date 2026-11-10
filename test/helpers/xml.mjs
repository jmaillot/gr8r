/* =====================================================================
   test helper: xml — lightweight well-formedness and tag inspection.
   =====================================================================
   Phase 54 (54-02): the xlsx and MSPDI suites need to know that the
   generated documents balance, and need raw tag slices for order
   assertions — without pulling an XML parser into the tree.

   Helper shape copied from test/helpers/server.mjs: named exports,
   no side effects.
   ===================================================================== */

/* Strip the declaration and comments so the stack checker only sees tags. */
function stripPrologue(xml) {
  return xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/* Assert the document's tags balance. Ignores the XML declaration,
   comments and self-closing tags; throws naming the offending tag. */
export function assertWellFormed(xml) {
  const body = stripPrologue(xml);
  const stack = [];
  const re = /<\/?([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)(\/?)>/g;
  for (const m of body.matchAll(re)) {
    const [, name, , selfClose] = m;
    if (selfClose === '/') continue;
    if (m[0][1] === '/') {
      const top = stack.pop();
      if (top !== name) {
        throw new Error(`unbalanced XML: expected </${top ?? 'nothing'}>, got </${name}>`);
      }
    } else {
      stack.push(name);
    }
  }
  if (stack.length) {
    throw new Error(`unbalanced XML: unclosed tag(s) ${stack.join(', ')}`);
  }
}

/* All raw open tags for a name, in document order — e.g.
   tags(xml, 'sheet') returns every `<sheet ...>` match array. */
export function tags(xml, name) {
  const body = stripPrologue(xml);
  const re = new RegExp(`<${name}((?:"[^"]*"|'[^']*'|[^"'>])*)>`, 'g');
  return [...body.matchAll(re)].map(m => m[0]);
}
