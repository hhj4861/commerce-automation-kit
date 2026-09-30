const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function architectureCaseMarkup(item) {
  const c=item?.caseStudy;
  if(!c || typeof c.entity!=='string' || typeof c.surprise!=='string')return '';
  return `<span class="architecture-case"><small>실제 사례 · ${esc(c.entity)} · ${esc(c.location)}</small><span>${esc(c.surprise)}</span><small>첫 장면 · ${esc(c.openingVisual)}</small></span>`;
}
