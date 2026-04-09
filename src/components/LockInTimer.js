'use client';

import { useEffect, useRef, useState } from 'react';
import { calculateExpirationTime } from '@/data/mock';
import './LockInTimer.css';

export default function LockInTimer({
  referralId,
  expiresAt,
  patientEmail,
  patientName,
  onExpire,
  onResend,
  onAutoReminder, // fires once when 30 minutes remain (half of the 60-min window)
  showResendButton = true,
  expiresAtOverride = null,
}) {
  const activeExpiry = expiresAtOverride || expiresAt;
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isWarning, setIsWarning] = useState(false);
  const [isCritical, setIsCritical] = useState(false);
  const autoReminderFired = useRef(false);

  useEffect(() => {
    const calc = calculateExpirationTime(activeExpiry);
    setTimeRemaining(calc);
    setIsExpired(calc.isExpired);
    setIsWarning(calc.remainingSeconds <= 300);
    setIsCritical(calc.remainingSeconds <= 60);

    if (calc.isExpired && onExpire) {
      onExpire(referralId);
      return;
    }

    const interval = setInterval(() => {
      const newCalc = calculateExpirationTime(activeExpiry);
      setTimeRemaining(newCalc);

      // Auto-reminder at 30 minutes remaining — fires exactly once
      if (
        !autoReminderFired.current &&
        onAutoReminder &&
        newCalc.remainingSeconds <= 1800 &&
        !newCalc.isExpired
      ) {
        autoReminderFired.current = true;
        onAutoReminder();
      }

      if (newCalc.isExpired) {
        setIsExpired(true);
        if (onExpire) onExpire(referralId);
        clearInterval(interval);
      } else {
        setIsWarning(newCalc.remainingSeconds <= 300);
        setIsCritical(newCalc.remainingSeconds <= 60);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeExpiry, referralId, onExpire, onAutoReminder]);

  if (!timeRemaining) return null;

  const minutes = String(timeRemaining.displayMinutes).padStart(2, '0');
  const seconds = String(timeRemaining.displaySeconds).padStart(2, '0');

  const containerClass = `lock-in-timer ${isExpired ? 'expired' : ''} ${isCritical ? 'critical' : isWarning ? 'warning' : ''}`;

  return (
    <div className={containerClass}>
      <div className="timer-display">
        <span className="timer-icon">⏱️</span>
        <div className="timer-content">
          <div className="timer-label">Tiempo restante para completar</div>
          <div className="timer-countdown">
            {isExpired ? (
              <span className="expired-text">⏰ Expirado</span>
            ) : (
              <span className="countdown">
                {minutes}:{seconds}
              </span>
            )}
          </div>
          {isCritical && !isExpired && (
            <div className="timer-warning">⚠️ Menos de 1 minuto restante</div>
          )}
          {isWarning && !isCritical && !isExpired && (
            <div className="timer-warning">⚠️ Menos de 5 minutos restante</div>
          )}
        </div>
      </div>

      {showResendButton && !isExpired && (
        <button
          className="btn btn-sm btn-outline resend-button"
          onClick={() => {
            if (onResend) {
              onResend(referralId, patientEmail, patientName);
            }
            fetch('/api/email/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                templateName: 'lockInInvitation',
                data: {
                  patientEmail,
                  patientName,
                  clinicName: 'Med Connect',
                  specialty: 'Consulta médica',
                  providerName: '',
                  slotDate: '',
                  slotTime: '',
                  lockInId: referralId,
                },
              }),
            }).catch(() => {});
          }}
        >
          Reenviar email
        </button>
      )}

      {isExpired && (
        <div className="expired-notice">
          🔔 El lock-in ha expirado. El paciente deberá solicitar un nuevo slot.
        </div>
      )}
    </div>
  );
}
