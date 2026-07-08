// Route-level loading UI for /book. Mirrors the page's own Suspense
// fallback so the transition into the client bundle is seamless.
export default function BookLoading() {
  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--muted, #6b7280)',
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
        <p style={{ fontSize: '0.95rem' }}>Preparando tu reserva…</p>
        <style>{`@keyframes mc-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </main>
  );
}
