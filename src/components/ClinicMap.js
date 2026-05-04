'use client';
import { useEffect, useRef } from 'react';

/**
 * ClinicMap — Leaflet wrapper used in /search-v2.
 *
 * Props:
 *   - providers: clinics with .lat / .lng to drop pins for.
 *   - highlightedId: optional id to render with the accent pin colour.
 *   - onPinClick(provider): pin click handler.
 *   - city: optional city name used as the initial centre.
 *   - onBoundsChange({ south, west, north, east }): fired AFTER a
 *     user-initiated pan or zoom (not on programmatic fitBounds during
 *     first paint). Lets the parent refetch clinics by bbox.
 *   - filterSignature: opaque string that changes whenever a filter
 *     (specialty, procedure, rating, insurance) changes. Resets the
 *     "user has moved the map" flag so the next paint re-fits the
 *     viewport to the new result set.
 */
export default function ClinicMap({ providers, highlightedId, onPinClick, city, onBoundsChange, filterSignature }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef([]);
  const userInteractedRef = useRef(false);
  // Keep the latest onBoundsChange in a ref so we don't have to re-bind
  // the moveend listener when the parent re-renders with a new closure.
  const onBoundsChangeRef = useRef(onBoundsChange);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);

  // Re-fit viewport when filters change. Without this, after the first
  // user pan/zoom the map stays parked on the old viewport even though
  // the result set has shrunk to a different geographic cluster.
  useEffect(() => {
    userInteractedRef.current = false;
  }, [filterSignature]);

  // Province → coordinates of the provincial capital. Used when the
  // location filter is active so the map centres on the *capital* (where
  // most clinics live) instead of the geometric centroid of all clinic
  // pins, which lands in random suburbs when the dataset is dispersed.
  // Keys must match the `province` values stored in `clinics.province`
  // (so the dropdown selections route through correctly). Aliases for
  // older Spanish vs. official-language names are listed alongside.
  const CITY_CENTERS = {
    'A Coruña':                  [43.3713, -8.3960],
    'Álava':                     [42.8467, -2.6716],
    'Albacete':                  [38.9943, -1.8585],
    'Alicante':                  [38.3452, -0.4815],
    'Almería':                   [36.8381, -2.4597],
    'Asturias':                  [43.3614, -5.8593],
    'Ávila':                     [40.6566, -4.6818],
    'Badajoz':                   [38.8794, -6.9707],
    'Barcelona':                 [41.3851,  2.1734],
    'Bizkaia':                   [43.2630, -2.9350],
    'Vizcaya':                   [43.2630, -2.9350],
    'Burgos':                    [42.3439, -3.6969],
    'Cáceres':                   [39.4753, -6.3724],
    'Cádiz':                     [36.5298, -6.2924],
    'Cantabria':                 [43.4623, -3.8099],
    'Castellón':                 [39.9864, -0.0513],
    'Castelló':                  [39.9864, -0.0513],
    'Ciudad Real':               [38.9848, -3.9274],
    'Córdoba':                   [37.8882, -4.7794],
    'Cuenca':                    [40.0704, -2.1374],
    'Girona':                    [41.9794,  2.8214],
    'Gerona':                    [41.9794,  2.8214],
    'Granada':                   [37.1773, -3.5986],
    'Guadalajara':               [40.6333, -3.1669],
    'Gipuzkoa':                  [43.3183, -1.9812],
    'Guipúzcoa':                 [43.3183, -1.9812],
    'Huelva':                    [37.2614, -6.9447],
    'Huesca':                    [42.1361, -0.4087],
    'Illes Balears':             [39.5696,  2.6502],
    'Islas Baleares':            [39.5696,  2.6502],
    'Baleares':                  [39.5696,  2.6502],
    'Jaén':                      [37.7796, -3.7849],
    'La Rioja':                  [42.4627, -2.4449],
    'Las Palmas':                [28.1235, -15.4363],
    'León':                      [42.5987, -5.5671],
    'Lleida':                    [41.6176,  0.6200],
    'Lérida':                    [41.6176,  0.6200],
    'Lugo':                      [43.0125, -7.5559],
    'Madrid':                    [40.4168, -3.7038],
    'Málaga':                    [36.7213, -4.4214],
    'Murcia':                    [37.9838, -1.1280],
    'Navarra':                   [42.8125, -1.6458],
    'Nafarroa':                  [42.8125, -1.6458],
    'Ourense':                   [42.3370, -7.8639],
    'Orense':                    [42.3370, -7.8639],
    'Palencia':                  [42.0096, -4.5288],
    'Pontevedra':                [42.4310, -8.6444],
    'Salamanca':                 [40.9701, -5.6635],
    'Santa Cruz de Tenerife':    [28.4636, -16.2518],
    'Segovia':                   [40.9429, -4.1088],
    'Sevilla':                   [37.3891, -5.9845],
    'Soria':                     [41.7665, -2.4790],
    'Tarragona':                 [41.1189,  1.2445],
    'Teruel':                    [40.3440, -1.1069],
    'Toledo':                    [39.8628, -4.0273],
    'Valencia':                  [39.4699, -0.3763],
    'València':                  [39.4699, -0.3763],
    'Valladolid':                [41.6523, -4.7245],
    'Zamora':                    [41.5033, -5.7446],
    'Zaragoza':                  [41.6488, -0.8891],
    // Standalone cities used as fallback before the province dropdown
    'Bilbao':                    [43.2630, -2.9350],
    'Vigo':                      [42.2406, -8.7207],
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Lazy-load Leaflet only on client
    import('leaflet').then((L) => {
      // Fix default marker icon path broken by webpack
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mapRef.current) {
        const center = (city && CITY_CENTERS[city]) ? CITY_CENTERS[city] : [40.4168, -3.7038];
        mapRef.current = L.map(containerRef.current, { zoomControl: true }).setView(center, 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(mapRef.current);

        // Track when the user (vs. programmatic fitBounds) drives the
        // viewport. moveend fires on both — we only want to bubble it
        // up after a real interaction so the first paint doesn't loop
        // (load → fitBounds → moveend → refetch → fitBounds again).
        const flagInteraction = () => { userInteractedRef.current = true; };
        mapRef.current.on('dragstart', flagInteraction);
        mapRef.current.on('zoomstart', flagInteraction);

        let moveTimer = null;
        mapRef.current.on('moveend', () => {
          if (!userInteractedRef.current) return;
          // Debounce — gestures fire many moveend events as the
          // user pans, no point in flooding the API.
          if (moveTimer) clearTimeout(moveTimer);
          moveTimer = setTimeout(() => {
            const cb = onBoundsChangeRef.current;
            if (!cb || !mapRef.current) return;
            const b = mapRef.current.getBounds();
            cb({
              south: b.getSouth(),
              west:  b.getWest(),
              north: b.getNorth(),
              east:  b.getEast(),
            });
          }, 350);
        });
      }

      // Clear old markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const clinicsWithCoords = providers.filter((p) => p.lat && p.lng);

      clinicsWithCoords.forEach((p) => {
        const isHighlighted = p.id === highlightedId;
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            background:${isHighlighted ? '#ef4444' : '#2563eb'};
            width:18px;height:18px;border-radius:50%;
            border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
            cursor:pointer;
          "></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });

        const marker = L.marker([p.lat, p.lng], { icon })
          .addTo(mapRef.current)
          .bindTooltip(p.name, { permanent: false, direction: 'top', offset: [0, -14] });

        marker.on('click', () => onPinClick && onPinClick(p));
        markersRef.current.push(marker);
      });

      // Only fit bounds while the user hasn't moved the map themselves —
      // afterwards we respect their viewport so new pins appear in place
      // instead of yanking them back to the bbox of the result set.
      if (!userInteractedRef.current) {
        // When a province filter is active, always centre on that
        // province's capital (from CITY_CENTERS) at a fixed province-
        // level zoom — fitBounds on the clinic set lands the map on the
        // geometric centroid of all pins, which for dispersed provinces
        // (Madrid, Barcelona, León) ends up in a random suburb.
        if (city && CITY_CENTERS[city]) {
          mapRef.current.setView(CITY_CENTERS[city], 10);
        } else if (clinicsWithCoords.length > 1) {
          const bounds = L.latLngBounds(clinicsWithCoords.map((p) => [p.lat, p.lng]));
          mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        } else if (clinicsWithCoords.length === 1) {
          mapRef.current.setView([clinicsWithCoords[0].lat, clinicsWithCoords[0].lng], 14);
        }
      }
    });

    return () => {
      // Don't destroy map on re-render, only on full unmount
    };
  }, [providers, highlightedId, city]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 400 }} />
    </>
  );
}
