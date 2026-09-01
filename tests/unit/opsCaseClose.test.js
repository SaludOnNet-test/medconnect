import { describe, it, expect, vi, beforeEach } from 'vitest';

// opsCases talks to Azure SQL; drive it through a fake `query` so the
// close-on-cancel bookkeeping can be asserted without a database.
const query = vi.fn();
const sqlStub = new Proxy({}, {
  get: (_t, prop) => (prop === 'MAX' ? 'MAX' : (arg) => ({ type: String(prop), arg })),
});
vi.mock('@/lib/db', () => ({
  query: (...args) => query(...args),
  sql: sqlStub,
  DB_AVAILABLE: true,
}));

const { closeCaseForCancelledBooking, CASE_STATUS } = await import('@/lib/opsCases');

const BOOKING = 'mc_b1ebaf544d679be91a334677';

beforeEach(() => query.mockReset());

describe('closeCaseForCancelledBooking', () => {
  it('cierra el caso abierto con importe, refund id y nota en el call_log', async () => {
    query
      .mockResolvedValueOnce({ recordset: [{ id: 16, call_log: 'linea previa' }] }) // SELECT
      .mockResolvedValueOnce({ recordset: [] }); // UPDATE

    const closed = await closeCaseForCancelledBooking(BOOKING, {
      reason: 'El paciente canceló desde el enlace del email de confirmación',
      refundId: 're_123',
      refundAmount: 44,
      actor: 'paciente (self-service)',
    });

    expect(closed).toBe(16);
    const [updateSql, updateParams] = query.mock.calls[1];
    expect(updateSql).toContain('UPDATE operations_cases');
    // Terminal status ⇒ resolved_at set, so the case leaves the Ops queue.
    expect(updateSql).toContain('resolved_at = SYSDATETIMEOFFSET()');
    expect(updateParams.status.value).toBe(CASE_STATUS.REFUNDED);
    expect(updateParams.refund_id.value).toBe('re_123');
    expect(updateParams.refund_amount.value).toBe(44);
    expect(updateParams.call_log.value).toContain('linea previa');
    expect(updateParams.call_log.value).toContain('reembolso €44');
    expect(updateParams.call_log.value).toContain('no hace falta llamar');
  });

  it('no hace nada cuando el booking no tiene caso abierto', async () => {
    query.mockResolvedValueOnce({ recordset: [] });
    await expect(closeCaseForCancelledBooking(BOOKING, {})).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('solo mira casos sin resolver', async () => {
    query.mockResolvedValueOnce({ recordset: [] });
    await closeCaseForCancelledBooking(BOOKING, {});
    expect(query.mock.calls[0][0]).toContain('resolved_at IS NULL');
  });

  it('se traga un fallo de BD sin romper el flujo de reembolso', async () => {
    query.mockRejectedValueOnce(new Error('Azure caída'));
    await expect(closeCaseForCancelledBooking(BOOKING, {})).resolves.toBeNull();
  });

  it('ignora un bookingId vacío', async () => {
    await expect(closeCaseForCancelledBooking(null, {})).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
