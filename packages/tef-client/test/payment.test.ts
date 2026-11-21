import { describe, expect, it } from 'vitest';
import { uuidV7, type PaymentState, type PaymentTransaction } from '@totem-pdv/shared-types';
import { PaymentGatewayError, SimulatedPinpadAdapter, type PaymentTransactionStore } from '../src/index.js';

/** Only a test fixture. Runtime code always injects its PostgreSQL implementation. */
class InMemoryPaymentStoreForTests implements PaymentTransactionStore {
  readonly rows = new Map<string, PaymentTransaction>();
  async get(id: string): Promise<PaymentTransaction | undefined> {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : undefined;
  }
  async findByIdempotencyKey(key: string): Promise<PaymentTransaction | undefined> {
    const row = [...this.rows.values()].find((transaction) => transaction.idempotencyKey === key);
    return row ? structuredClone(row) : undefined;
  }
  async create(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    const existing = [...this.rows.values()].find((row) => row.idempotencyKey === transaction.idempotencyKey);
    if (existing) return structuredClone(existing);
    this.rows.set(transaction.id, structuredClone(transaction));
    return structuredClone(transaction);
  }
  async update(transaction: PaymentTransaction, expectedStatus: PaymentState): Promise<PaymentTransaction> {
    const existing = this.rows.get(transaction.id);
    if (!existing || existing.status !== expectedStatus || existing.version !== transaction.version - 1) throw new PaymentGatewayError('CONFLICT', 'Compare-and-swap conflict.');
    this.rows.set(transaction.id, structuredClone(transaction));
    return structuredClone(transaction);
  }
  async listPending(): Promise<PaymentTransaction[]> {
    return structuredClone([...this.rows.values()].filter((transaction) => !['CONFIRMED', 'REVERSED', 'FAILED'].includes(transaction.status)));
  }
}

const input = (method: 'CREDIT_CARD' | 'DEBIT_CARD' | 'PIX' = 'PIX') => ({ idempotencyKey: uuidV7(), terminalId: 'TOTEM-01', method, amountCents: 2_990 });

describe('sandbox terminal 2PC', () => {
  it.each(['CREDIT_CARD', 'DEBIT_CARD', 'PIX'] as const)('authorizes and confirms %s only after a separate phase two', async (method) => {
    const store = new InMemoryPaymentStoreForTests();
    const terminal = new SimulatedPinpadAdapter(store, { stepDelayMs: 0 });
    const events: PaymentState[] = [];
    const request = input(method);
    const authorized = await terminal.authorize(request, { onProgress: ({ status }) => events.push(status) });
    expect(events).toEqual(['INITIALIZING', 'WAITING_CARD_OR_QR', 'PROCESSING', 'AUTHORIZED']);
    expect(authorized.nsu).toMatch(/^\d{12}$/);
    expect(authorized.authorizationCode).toMatch(/^\d{6}$/);
    expect(authorized.status).toBe('AUTHORIZED');
    const duplicate = await terminal.authorize(request);
    expect(duplicate).toEqual(authorized);
    const confirmed = await terminal.confirm(authorized.id);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(await terminal.confirm(authorized.id)).toEqual(confirmed);
    expect(store.rows.size).toBe(1);
  });

  it('allows exactly one authorization under concurrent retries', async () => {
    const store = new InMemoryPaymentStoreForTests();
    const terminal = new SimulatedPinpadAdapter(store, { stepDelayMs: 2 });
    const request = input();
    const results = await Promise.all(Array.from({ length: 20 }, () => terminal.authorize(request)));
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect([...store.rows.values()][0]?.status).toBe('AUTHORIZED');
    expect([...store.rows.values()][0]?.version).toBe(3);
  });

  it('rejects reuse of a key with a different value, method or terminal', async () => {
    const terminal = new SimulatedPinpadAdapter(new InMemoryPaymentStoreForTests(), { stepDelayMs: 0 });
    const request = input();
    await terminal.authorize(request);
    await expect(terminal.authorize({ ...request, amountCents: 1 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(terminal.authorize({ ...request, method: 'DEBIT_CARD' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(terminal.authorize({ ...request, terminalId: 'TOTEM-02' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('reverses a confirmed payment idempotently and blocks reconfirmation', async () => {
    const terminal = new SimulatedPinpadAdapter(new InMemoryPaymentStoreForTests(), { stepDelayMs: 0 });
    const authorized = await terminal.authorize(input());
    await terminal.confirm(authorized.id);
    const reversed = await terminal.reverse(authorized.id);
    expect(reversed.status).toBe('REVERSED');
    expect(await terminal.reverse(authorized.id)).toEqual(reversed);
    await expect(terminal.confirm(authorized.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('preserves a durable authorization when confirmation or reversal is temporarily unavailable', async () => {
    const store = new InMemoryPaymentStoreForTests();
    const terminal = new SimulatedPinpadAdapter(store, { stepDelayMs: 0, failConfirmation: true, failReversal: true });
    const authorized = await terminal.authorize(input());
    await expect(terminal.confirm(authorized.id)).rejects.toMatchObject({ code: 'CONFIRMATION_FAILED' });
    await expect(terminal.reverse(authorized.id)).rejects.toMatchObject({ code: 'REVERSAL_FAILED' });
    expect((await store.get(authorized.id))?.status).toBe('AUTHORIZED');
  });

  it('recovers boot pendencies from durable storage using order and print evidence', async () => {
    const store = new InMemoryPaymentStoreForTests();
    const terminal = new SimulatedPinpadAdapter(store, { stepDelayMs: 0 });
    const committed = await terminal.authorize(input());
    const orphan = await terminal.authorize(input());
    const awaitingReceipt = await terminal.authorize(input());
    const restarted = new SimulatedPinpadAdapter(store, { stepDelayMs: 0, orphanGracePeriodMs: 0 });
    const result = await restarted.resolveOrphanPendencies(async (transaction) => transaction.id === committed.id
      ? { kind: 'confirm', orderId: uuidV7() }
      : transaction.id === awaitingReceipt.id ? { kind: 'defer' } : { kind: 'reverse' });
    expect(result).toEqual({ confirmed: 1, reversed: 1, deferred: 1, failed: [] });
    expect((await store.get(committed.id))?.status).toBe('CONFIRMED');
    expect((await store.get(orphan.id))?.status).toBe('REVERSED');
    expect((await store.get(awaitingReceipt.id))?.status).toBe('AUTHORIZED');
  });

  it('does not resolve another replica active operation during its grace period', async () => {
    const store = new InMemoryPaymentStoreForTests();
    const terminal = new SimulatedPinpadAdapter(store, { stepDelayMs: 0 });
    const authorized = await terminal.authorize(input());
    const result = await terminal.resolveOrphanPendencies(async () => { throw new Error('must not be called'); });
    expect(result).toEqual({ confirmed: 0, reversed: 0, deferred: 1, failed: [] });
    expect((await store.get(authorized.id))?.status).toBe('AUTHORIZED');
  });

  it('times out promptly and preserves the interrupted durable record for boot recovery', async () => {
    const store = new InMemoryPaymentStoreForTests();
    const terminal = new SimulatedPinpadAdapter(store, { stepDelayMs: 100, timeoutMs: 10 });
    await expect(terminal.authorize(input())).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect([...store.rows.values()][0]?.status).toBe('WAITING_CARD_OR_QR');
    const restarted = new SimulatedPinpadAdapter(store, { stepDelayMs: 0, orphanGracePeriodMs: 0 });
    expect((await restarted.resolveOrphanPendencies(async () => ({ kind: 'reverse' }))).reversed).toBe(1);
  });

  it('honors caller cancellation before provider activity and tolerates broken UI observers', async () => {
    const store = new InMemoryPaymentStoreForTests();
    const terminal = new SimulatedPinpadAdapter(store, { stepDelayMs: 0 });
    const controller = new AbortController();
    controller.abort();
    await expect(terminal.authorize(input(), { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(store.rows.size).toBe(0);
    const authorized = await terminal.authorize(input(), { onProgress: () => { throw new Error('UI failed'); } });
    expect(authorized.status).toBe('AUTHORIZED');
  });

  it('never persists card credentials and refuses to reverse declined transactions', async () => {
    const store = new InMemoryPaymentStoreForTests();
    const terminal = new SimulatedPinpadAdapter(store, { stepDelayMs: 0, failAuthorization: true });
    const declined = await terminal.authorize(input());
    expect(declined.status).toBe('FAILED');
    expect(JSON.stringify(declined)).not.toMatch(/"(?:pan|cvv|pin|password)"/i);
    await expect(terminal.reverse(declined.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});
