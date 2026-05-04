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

  const CITY_CENTERS = {
    'Madrid':    [40.4168, -3.7038],
    'Barcelona': [41.3851,  2.1734],
    'Valencia':  [39.4699, -0.3763],
    'Sevilla':   [37.3891, -5.9845],
    'Málaga':    [36.7213, -4.4214],
    // Second wave (added 2026-04-29 alongside the F6 city expansion).
    // All six are exact matches of CITY_MAP display names in seoData.js.
    'Bilbao':    [43.2630, -2.9350],
    'Zaragoza':  [41.6488, -0.8891],
    'Granada':   [37.1773, -3.5986],
    'Murcia':    [37.9838, -1.1280],
    'Vigo':      [42.2406, -8.7207],
    'Córdoba':   [37.8847, -4.7791],
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
        if (clinicsWithCoords.length > 1) {
          const bounds = L.latLngBounds(clinicsWithCoords.map((p) => [p.lat, p.lng]));
          mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
          // When a province filter is active, fitBounds can zoom way out
          // because clinics in a province are scattered across many towns.
          // Force a province-level minimum so the user sees the whole
          // province instead of half of Spain.
          if (city && mapRef.current.getZoom() < 9) {
            mapRef.current.setZoom(9);
          }
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
