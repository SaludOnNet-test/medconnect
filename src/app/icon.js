import { ImageResponse } from 'next/og';

// Browser-tab favicon. Replaces the default Next.js icon (the favicon.ico
// alongside this file is the legacy fallback for very old browsers).
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1F2937', // --navy
          color: '#FFFFFF',
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-0.06em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        M
      </div>
    ),
    { ...size }
  );
}
