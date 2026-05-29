'use client';
/**
 * MobileStickyBar — fixed bottom bar with two buttons on the SEO landing pages
 * (`/especialistas/[especialidad]/[ciudad]`).
 *
 *   [ 🔍 Filtros (N activos) ] [ 🗺️ Ver mapa ]
 *
 * Why this exists (2026-05-29):
 *   - The mobile hero already takes ~200px even compressed. Filters live in
 *     a drawer that the user has to discover by scrolling. A persistent
 *     sticky bar surfaces the two highest-value actions without stealing
 *     scroll real estate from the clinic cards.
 *   - The map is hidden by default on mobile (`SearchResults.js:50`).
 *     Without this bar the user can't easily toggle it on.
 *
 * Hidden on >=901px (CSS media query in `search-v2.css`). Z-index 100 sits
 * BELOW the cookie banner (9999) and consent toast.
 */

export default function MobileStickyBar({
  filterCount = 0,
  onOpenFilters,
  onToggleMap,
  isMapOpen = false,
}) {
  return (
    <div className="mc-sticky-bar" role="toolbar" aria-label="Acciones rápidas">
      <button
        type="button"
        className="mc-sticky-bar__btn"
        onClick={onOpenFilters}
        aria-label={`Abrir filtros${filterCount > 0 ? ` (${filterCount} activos)` : ''}`}
      >
        <span aria-hidden="true">🔍</span>
        <span>Filtros</span>
        {filterCount > 0 && (
          <span className="mc-sticky-bar__badge">{filterCount}</span>
        )}
      </button>
      <button
        type="button"
        className={`mc-sticky-bar__btn ${isMapOpen ? 'mc-sticky-bar__btn--active' : ''}`}
        onClick={onToggleMap}
        aria-pressed={isMapOpen}
      >
        <span aria-hidden="true">🗺️</span>
        <span>{isMapOpen ? 'Ocultar mapa' : 'Ver mapa'}</span>
      </button>
    </div>
  );
}
