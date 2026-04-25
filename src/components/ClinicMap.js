'use client';
import { useEffect, useRef } from 'react';

export default function ClinicMap({ providers, highlightedId, onPinClick, city }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef([]);

  const CITY_CENTERS = {
    'Madrid':    [40.4168, -3.7038],
    'Barcelona': [41.3851,  2.1734],
    'Valencia':  [39.4699, -0.3763],
    'Sevilla':   [37.3891, -5.9845],
    'Málaga':    [36.7213, -4.4214],
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
      }

      // Clear old markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const clinicsWithCoords = providers.filter((p) => p.lat && p.lng);

      clinicsWithCoords.forEach((p, i) => {
        const isHighlighted = p.id === highlightedId;
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            background:${isHighlighted ? '#ef4444' : '#2563eb'};
            color:#fff;font-weight:700;font-size:11px;
            width:26px;height:26px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
            cursor:pointer;
          ">${i + 1}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const marker = L.marker([p.lat, p.lng], { icon })
          .addTo(mapRef.current)
          .bindTooltip(p.name, { permanent: false, direction: 'top', offset: [0, -14] });

        marker.on('click', () => onPinClick && onPinClick(p));
        markersRef.current.push(marker);
      });

      // Fit bounds if we have markers
      if (clinicsWithCoords.length > 1) {
        const bounds = L.latLngBounds(clinicsWithCoords.map((p) => [p.lat, p.lng]));
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } else if (clinicsWithCoords.length === 1) {
        mapRef.current.setView([clinicsWithCoords[0].lat, clinicsWithCoords[0].lng], 14);
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
