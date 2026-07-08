// Route-level loading UI for /search-v2. Keeps the same muted-grey tone
// as the page's own Suspense fallback and the card skeleton shimmer.
export default function SearchV2Loading() {
  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        fontFamily: 'var(--font-body, system-ui, sans-serif)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 36,
            margin: '0 auto 0.9rem',
            border: '3px solid var(--border, #e5e7eb)',
            borderTopColor: 'var(--gold, #d4a437)',
            borderRadius: '50%',
            animation: 'mc-spin 0.8s linear infinite',
          }}
        />
        <p style={{ fontSize: '0.95rem' }}>Cargando resultados…</p>
        <style>{`@keyframes mc-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </main>
  );
}
