'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

/**
 * <TurnstileWidget> — Cloudflare Turnstile (CAPTCHA) widget.
 *
 * Why this component vs. an npm dep: the official React wrappers add
 * 30-50 KB of indirection over a 10-line useEffect. We load Cloudflare's
 * own JS via `next/script` and call `turnstile.render` ourselves.
 *
 * Behaviour:
 *   - When `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset (preview / soft launch
 *     before keys are configured), the component renders nothing and calls
 *     `onToken('')` once on mount so the parent form's submit logic can
 *     proceed — the server-side `verifyCaptcha` helper degrades gracefully
 *     when `TURNSTILE_SECRET_KEY` is also unset (returns ok=true). Once
 *     both keys are set, the widget activates and submits without a token
 *     are rejected by the server. Set them together to avoid a flap.
 *   - When the script + sitekey are present, renders the widget; on
 *     successful verification calls `onToken(token)`. On expiration we
 *     reset the widget so the user can complete it again.
 *
 * Usage:
 *   const [token, setToken] = useState('');
 *   <TurnstileWidget onToken={setToken} />
 *   // Later, in the submit handler, include `captchaToken: token`.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export default function TurnstileWidget({ onToken, theme = 'light', size = 'normal' }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [scriptReady, setScriptReady] = useState(false);

  // No site key configured → run as if captcha is disabled. The parent's
  // submit logic still works because /lib/captcha.js on the server also
  // skips verification when `TURNSTILE_SECRET_KEY` is missing. Tell the
  // parent immediately so its form button doesn't hang in a "wait for
  // captcha" state.
  useEffect(() => {
    if (!SITE_KEY) onToken?.('');
  }, [onToken]);

  // Render the widget once the script + sitekey are both available.
  useEffect(() => {
    if (!SITE_KEY || !scriptReady) return;
    if (!containerRef.current) return;
    if (widgetIdRef.current != null) return; // already rendered

    const turnstile = typeof window !== 'undefined' ? window.turnstile : null;
    if (!turnstile?.render) return;

    widgetIdRef.current = turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      theme,
      size,
      callback: (token) => onToken?.(token),
      'expired-callback': () => {
        // Cloudflare expires tokens after ~5 min. Reset the widget so the
        // user can solve again before resubmitting; clear the token so
        // the form's submit button disables itself again if it was gated.
        onToken?.('');
        if (widgetIdRef.current != null && turnstile?.reset) {
          turnstile.reset(widgetIdRef.current);
        }
      },
      'error-callback': () => {
        // Cloudflare side error (rare) — let the user retry by clearing
        // the token; widget itself stays rendered with its retry UI.
        onToken?.('');
      },
    });

    return () => {
      // Clean up on unmount: remove the widget so a re-render doesn't
      // duplicate it.
      if (widgetIdRef.current != null && turnstile?.remove) {
        turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [scriptReady, onToken, theme, size]);

  if (!SITE_KEY) return null;

  return (
    <>
      <Script
        src={SCRIPT_URL}
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="cf-turnstile-host" />
    </>
  );
}
