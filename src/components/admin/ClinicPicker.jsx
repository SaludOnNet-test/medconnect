'use client';

// Shared clinic picker: button → modal with searchbox + scrollable result list.
// Backed by /api/admin/clinics which is accent-insensitive (Latin1_General_CI_AI),
// case-insensitive and token-AND across name + city + province + address.
//
// Used by:
//   - /admin/outreach add-clinic modal (force-select from 3.000+ catalog)
//   - (future) /admin/ops/[id] alternative-clinic picker
//
// The ops page has its own near-identical inline copy (commit b0c5c5c) that we
// deliberately leave untouched until the launch settles — duplication is the
// safer trade-off this week than a refactor of working prod code.

import { useEffect, useMemo, useRef, useState } from 'react';
import { adminFetch } from '@/lib/adminClient';

/**
 * Normalize a string for client-side ranking ties. Strips diacritics,
 * lowercases, normalizes ñ → n. Used to favour exact-name matches when the
 * caller provides a `preferClinicName`.
 */
export function normalizeClinicName(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .trim();
}

/**
 * The trigger button + selected pill. When `selected` is null shows a dashed
 * button that opens the picker. When it has a clinic shows a green pill with
 * a "cambiar" link.
 *
 * Props:
 *   selected              — { id, name, city, address, province } | null
 *   onPick(clinic)        — fires when the operator selects from the modal
 *   onClear()             — fires when they press "cambiar"
 *   cityFilter            — soft seed for the initial search (no results yet)
 *   preferClinicName      — bias client-side sort towards rows containing this
 *   placeholder           — button label
 *   modalTitle, modalHint — text shown inside the modal
 */
export function ClinicSelector({
  selected,
  onPick,
  onClear,
  cityFilter = null,
  preferClinicName = null,
  placeholder = 'Elegir clínica del catálogo',
  modalTitle = 'Elegir clínica del catálogo',
  modalHint = 'Solo puedes seleccionar clínicas que ya están en nuestra BD. Si la que buscas no aparece, pídela manualmente al equipo.',
}) {
  const [open, setOpen] = useState(false);

  if (selected) {
    return (
      <div style={{
        padding: '6px 10px', border: '1px solid #10b981', borderRadius: 6,
        background: '#ecfdf5', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 13, color: '#064e3b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ✓ <strong>{selected.name}</strong>
          {selected.city ? <span style={{ opacity: 0.7 }}> · {selected.city}</span> : null}
          <span style={{ opacity: 0.5, marginLeft: 4 }}>· id {selected.id}</span>
        </span>
        <button
          type="button"
          onClick={onClear}
          style={{ background: 'none', border: 0, color: '#065f46', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', flexShrink: 0 }}
        >
          cambiar
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '8px 12px', border: '1.5px dashed #94a3b8',
          borderRadius: 6, background: '#f8fafc', cursor: 'pointer',
          fontSize: 13, fontFamily: 'inherit', color: '#1e293b',
        }}
      >
        <span style={{ fontWeight: 600 }}>📋 {placeholder}</span>
        <span style={{ color: '#64748b', fontSize: 16 }}>›</span>
      </button>
      {open && (
        <ClinicPickerModal
          cityFilter={cityFilter}
          preferClinicName={preferClinicName}
          title={modalTitle}
          hint={modalHint}
          onClose={() => setOpen(false)}
          onPick={(cl) => { onPick(cl); setOpen(false); }}
        />
      )}
    </>
  );
}

/**
 * The picker modal itself. Exposed standalone for callers that want to manage
 * open/close state externally.
 */
export function ClinicPickerModal({
  cityFilter = null,
  preferClinicName = null,
  title = 'Elegir clínica del catálogo',
  hint = 'Solo puedes seleccionar clínicas que ya están en nuestra BD.',
  onClose,
  onPick,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fuzzyHint, setFuzzyHint] = useState(false);
  const inputRef = useRef(null);
  const reqIdRef = useRef(0);

  // Auto-focus + Esc to close + body scroll lock.
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Debounced search. cityFilter is used only as a soft seed when the
  // operator hasn't typed anything; the moment they start typing it drops
  // out so we don't AND-filter unrelated catches.
  useEffect(() => {
    const handle = setTimeout(async () => {
      const typed = query.trim();
      const q = typed || (cityFilter ? String(cityFilter).trim() : '');
      const myId = ++reqIdRef.current;
      setLoading(true);
      setFuzzyHint(false);
      try {
        let res = await adminFetch(`/api/admin/clinics?q=${encodeURIComponent(q)}&limit=50`);
        let j = await res.json();
        let list = Array.isArray(j?.clinics) ? j.clinics : [];
        // Typo fallback: when the typed query returned nothing and is ≥ 5
        // chars, retry shortening the last token by one character. Catches
        // "Bermudz" → "Bermud" → matches "Bermúdez".
        if (myId === reqIdRef.current && typed && list.length === 0 && typed.length >= 5) {
          const parts = typed.split(/\s+/).filter(Boolean);
          if (parts.length > 0) {
            parts[parts.length - 1] = parts[parts.length - 1].slice(0, -1);
            const shortened = parts.join(' ');
            res = await adminFetch(`/api/admin/clinics?q=${encodeURIComponent(shortened)}&limit=50`);
            j = await res.json();
            list = Array.isArray(j?.clinics) ? j.clinics : [];
            if (list.length > 0) setFuzzyHint(true);
          }
        }
        if (myId === reqIdRef.current) setResults(list);
      } catch (err) {
        if (myId === reqIdRef.current) {
          console.error('[ClinicPickerModal] fetch error', err);
          setResults([]);
        }
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [cityFilter, query]);

  const filtered = useMemo(() => {
    const preferKey = preferClinicName ? normalizeClinicName(preferClinicName) : null;
    return [...results].sort((a, b) => {
      const an = normalizeClinicName(a.name);
      const bn = normalizeClinicName(b.name);
      if (preferKey) {
        const ap = an.includes(preferKey);
        const bp = bn.includes(preferKey);
        if (ap && !bp) return -1;
        if (bp && !ap) return 1;
      }
      return an.localeCompare(bn);
    }).slice(0, 50);
  }, [results, preferClinicName]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 1100, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', padding: '40px 16px',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560, background: '#fff',
        borderRadius: 12, boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 80px)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{title}</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>{hint}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                background: '#f1f5f9', border: 0, borderRadius: '50%',
                width: 28, height: 28, cursor: 'pointer', fontSize: 16,
                color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, ciudad, provincia o dirección…"
            autoComplete="off"
            style={{
              width: '100%', marginTop: 12, padding: '10px 12px',
              border: '1.5px solid #cbd5e1', borderRadius: 6,
              fontSize: 14, fontFamily: 'inherit', outline: 'none',
            }}
            onFocus={(e) => { e.target.style.borderColor = '#1a3c5e'; }}
            onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 100 }}>
          {loading ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: '#64748b', textAlign: 'center' }}>
              Buscando…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: '#64748b', textAlign: 'center' }}>
              Sin resultados{cityFilter && !query ? ` en ${cityFilter}` : ''}.
              <br />Prueba con otro nombre o variantes de la palabra.
            </div>
          ) : (
            <>
              {fuzzyHint && (
                <div style={{
                  padding: '8px 20px', fontSize: 12, color: '#92400e',
                  background: '#fef3c7', borderBottom: '1px solid #fde68a',
                }}>
                  Mostrando coincidencias aproximadas (posible typo en la búsqueda).
                </div>
              )}
              {filtered.map((cl) => (
                <button
                  key={cl.id}
                  type="button"
                  onClick={() => onPick(cl)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '12px 20px', background: 'none', border: 0,
                    borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{cl.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {[cl.city, cl.province, cl.address].filter(Boolean).join(' · ') || '—'}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
        <div style={{
          padding: '10px 20px', borderTop: '1px solid #e2e8f0',
          fontSize: 11, color: '#94a3b8', background: '#f8fafc',
        }}>
          {filtered.length > 0 ? `${filtered.length} resultado${filtered.length === 1 ? '' : 's'} · ` : ''}
          Pulsa <kbd style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 3, padding: '0 4px', fontSize: 10 }}>Esc</kbd> para cerrar
        </div>
      </div>
    </div>
  );
}
