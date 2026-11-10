'use client';
import { useState, useEffect } from 'react';
import ClinicCardV2 from '@/components/ClinicCardV2';
import ClinicBookingModal from '@/components/ClinicBookingModal';
import { trackEvent } from '@/lib/analytics';
import '../../../search-v2/search-v2.css';

/**
 * Interactive clinic list of an insurer×specialty page.
 *
 * Rewritten 2026-11: the previous version passed `clinic` / `onBook` to
 * ClinicCardV2 and `clinic` to ClinicBookingModal, but both components take
 * `provider` (and the card `onOpenModal`). Every card crashed on
 * `provider.id` and the app error boundary replaced the whole page with
 * "Algo no ha ido bien" on all 144 insurer pages. It also sent the page slug
 * as `specialty` (a numeric mock id for the API), so the list wasn't
 * filtered by specialty at all.
 *
 * Mirrors the specialty/city landing (SearchResults.js): same card, same
 * slot batching (/api/clinics/batch-slots, 10 ids per call) and same modal,
 * with the page's insurer pre-selected.
 */

const SLOT_BATCH = 10;
const SLOT_WATCHDOG_MS = 8000;

export default function InsurerResults({ insurerSlug, specialtySlug, insurerDbName, insurerName, specialtyName }) {
  const [clinics, setClinics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slotsMap, setSlotsMap] = useState({});
  const [modalProvider, setModalProvider] = useState(null);
  const [modalInitialSlot, setModalInitialSlot] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams({
      specialtySlug,
      limit: '30',
    });
    fetch(`/api/clinics/search?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setClinics(data.clinics || []);
        setLoading(false);
      })
      .catch(() => {
        setClinics([]);
        setLoading(false);
      });
  }, [specialtySlug]);

  // Slot chips, loaded in batches like the specialty/city landing.
  useEffect(() => {
    if (!clinics || clinics.length === 0) return undefined;
    const ids = clinics.map((c) => c.id);
    let cancelled = false;

    const fetchBatch = (batchIds, delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs))
        .then(() => (cancelled
          ? null
          : fetch(`/api/clinics/batch-slots?ids=${batchIds.join(',')}&preview=true&days=7`)))
        .then((r) => (r ? r.json() : null))
        .then((data) => {
          if (cancelled || !data?.slots) return;
          setSlotsMap((prev) => ({ ...prev, ...data.slots }));
        })
        .catch(() => {});

    for (let i = 0; i < ids.length; i += SLOT_BATCH) {
      fetchBatch(ids.slice(i, i + SLOT_BATCH), i === 0 ? 0 : 300);
    }

    // Stop the shimmer on any card whose batch never answered.
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      setSlotsMap((prev) => {
        const next = { ...prev };
        let touched = false;
        for (const id of ids) {
          if (!(id in next)) {
            next[id] = [];
            touched = true;
          }
        }
        return touched ? next : prev;
      });
    }, SLOT_WATCHDOG_MS);

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
  }, [clinics]);

  const searchHref = `/search-v2?specialtySlug=${specialtySlug}&insurance=${encodeURIComponent(insurerDbName)}`;

  if (loading) {
    return (
      <div className="search-results-loading">
        <p className="search-results-loading__text">Buscando especialistas disponibles…</p>
        <div className="search-skeleton-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="clinic-card-skeleton" aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  }

  if (!clinics || clinics.length === 0) {
    return (
      <div className="search-empty">
        <p>No encontramos centros disponibles para {specialtyName} con {insurerName} en este momento.</p>
        <p>Prueba el <a href={searchHref}>buscador general</a> para ver todas las opciones.</p>
      </div>
    );
  }

  return (
    <>
      <p className="insurer-results-count">
        {clinics.length} {clinics.length === 1 ? 'centro encontrado' : 'centros encontrados'} con {insurerName}
      </p>
      <div className="search-cards-grid">
        {clinics.map((provider, i) => (
          <ClinicCardV2
            key={provider.id}
            provider={provider}
            index={i}
            basePrice={0}
            slots={slotsMap[provider.id]}
            onOpenModal={(p, slot) => {
              try {
                trackEvent('insurer_page_cta_click', { cta: 'clinic_card', insurer: insurerSlug, specialty: specialtySlug });
              } catch { /* analytics is fire-and-forget */ }
              setModalProvider(p);
              setModalInitialSlot(slot ?? null);
            }}
          />
        ))}
      </div>
      {modalProvider && (
        <ClinicBookingModal
          provider={modalProvider}
          initialSlot={modalInitialSlot}
          initialSpecialtySlug={specialtySlug}
          initialInsurance={insurerDbName}
          onClose={() => {
            setModalProvider(null);
            setModalInitialSlot(null);
          }}
        />
      )}
    </>
  );
}
