import { describe, expect, it } from 'vitest';
import { uuidV7 } from '@totem-pdv/shared-types';
import { SandboxFiscalAdapter } from '../src/index.js';

describe('sandbox fiscal boundary', () => {
  it.each([['disabled', 'NOT_EMITTED'], ['sandbox', 'SIMULATED']] as const)('keeps %s fiscal behavior explicit without fabricating an invoice', async (mode, nfceStatus) => {
    const now = new Date('2026-11-21T12:00:00.000Z');
    const adapter = new SandboxFiscalAdapter(mode, () => now);
    const order = { id: uuidV7(), idempotencyKey: uuidV7() };
    expect(await adapter.process(order)).toEqual({ orderId: order.id, mode, nfceStatus, processedAt: now.toISOString() });
    expect(await adapter.process(order)).not.toHaveProperty('xml');
    expect(await adapter.process(order)).not.toHaveProperty('accessKey');
  });

  it('rejects real emission modes and propagates cancellation', async () => {
    expect(() => new SandboxFiscalAdapter('production' as 'disabled')).toThrow();
    const signal = AbortSignal.abort();
    await expect(new SandboxFiscalAdapter().process({ id: uuidV7(), idempotencyKey: uuidV7() }, { signal })).rejects.toThrow();
  });
});
