import { ImageResponse } from 'next/og';

// Open Graph card shown in WhatsApp, Telegram, LinkedIn, Slack, Facebook,
// iMessage, etc. when someone shares a link to medconnect.es.
// 1200×630 is the universally accepted size.
export const alt = 'Med Connect — citas médicas privadas, sin esperas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1F2937', // --navy
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: '-0.045em',
            lineHeight: 1,
          }}
        >
          <span style={{ color: '#FFFFFF' }}>Med</span>
          <span style={{ color: '#D4AF37' }}>Connect</span>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 36,
            fontSize: 38,
            color: '#F9FAFB',
            opacity: 0.92,
            textAlign: 'center',
            fontWeight: 500,
          }}
        >
          Citas médicas privadas, sin esperas
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 64,
            fontSize: 24,
            color: '#D4AF37',
            letterSpacing: '0.18em',
            fontWeight: 600,
          }}
        >
          MEDCONNECT.ES
        </div>
      </div>
    ),
    { ...size }
  );
}
