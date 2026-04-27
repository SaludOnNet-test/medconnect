import { ImageResponse } from 'next/og';

// iOS / iPadOS home-screen icon. 180×180 is Apple's recommended size.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1F2937', // --navy
          color: '#FFFFFF',
          fontSize: 110,
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
