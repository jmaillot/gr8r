/* ---------- file preview modal (54-xx, moved 66-03) ---------- */
/* 66-03 chunk-gate remedy (the DELIV-02 lazy-modal pattern, 61-02/65-03
   precedent): the preview modal's BYTES left the entry chunk (the 500 kB
   gate); modalHtml reaches it through the S.ui.fpMod module cache populated
   by the opener's dynamic import in actions.js. Markup and the G-12-4/G-12-6
   PDF viewport behaviour are UNCHANGED; only the module home moved. */
import { esc, ago } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { D, mem, task } from '../core/store.js';
import { FT, filePrev } from '../ui/helpers.js';

export function filePreviewModal(m, H) {
  const f = m.file;
  const ft = FT[f.type] || FT.other;
  return `${H(esc(f.name), `${ft.n} · ${f.size} ${t('modal.uploadedBy', { name: esc(mem(f.by)?.name || 'you') })} ${ago(f.at)}`)}
  <div class="modal-b"><div style="border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden">${
    /* D-03/D-09: images and PDFs render the real bytes from the serving route;
       every other type keeps the icon-art download tile. Lists/grids are
       untouched (D-10). User-controlled values escape with esc() (T-12-09).
       G-12-4 (a): the PDF iframe swaps the old 16/9 clip for an explicit tall
       in-iframe viewport — Firefox renders its built-in PDF toolbar
       INSIDE the iframe and it was clipped by the ~296px 16/9 pane; the
       surrounding overflow:hidden wrapper clips nothing because it grows with
       the iframe. G-12-6: PDFs render in .modal.xl (900px) so the in-iframe
       viewport is ≈866px — at or above pdf.js's 750px WIDTH breakpoint, below
       which its @media rule hides the direct download/print buttons into the
       '»' secondary menu; images and other types stay at 'lg', and the image
       branch keeps aspect-ratio:16/9. */
    f.type === 'img'
      ? `<img src="/w/${D().ws.url}/file/${f.id}" alt="${esc(f.name)}" style="display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:var(--bg)">`
      : f.type === 'pdf'
        ? `<iframe src="/w/${D().ws.url}/file/${f.id}" title="${esc(f.name)}" style="display:block;width:100%;height:min(75vh,640px);border:0"></iframe>`
        : filePrev(f).replace('class="fprev"', 'class="fprev" style="aspect-ratio:16/9"')
  }</div>
  ${m.tid ? `<div class="row faint" style="font-size:12.5px">${ic('link', 13)}${t('modal.attachedTo')} <button class="link" data-a="openTask" data-id="${m.tid}">${esc(task(m.tid)?.title)}</button></div>` : ''}</div>
  <div class="modal-f">${
    /* G-12-6 hardening: a PDF-only footer Download anchor — a viewer-independent
       save affordance, so the download never depends on the embedded viewer's
       toolbar width behaviour. Native same-origin navigation (no data-a): the
       download attribute overrides the route's inline Content-Disposition
       client-side, and the filename is esc()-escaped (T-12-18) since it is
       user-controlled and lands in a double-quoted attribute. */
    f.type === 'pdf'
      ? `<a class="btn btn-secondary" href="/w/${D().ws.url}/file/${f.id}" download="${esc(f.name)}">${ic('download', 14)}${t('act.download')}</a>`
      : ''
  }<button class="btn btn-secondary" data-a="copyLink" data-fid="${f.id}">${ic('link', 14)}${t('act.copyLink')}</button><span class="sp"></span><button class="btn btn-primary" data-a="closeModal">${t('a11y.close')}</button></div>`;
}
