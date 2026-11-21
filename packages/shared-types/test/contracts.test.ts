import { describe, expect, it } from 'vitest';
import { centsSchema, isUuidV7, orderInputSchema, productInputSchema, uuidV7 } from '../src/index.js';

const fiscal = { ncm: '21069090', cest: '', cfop: '5102', origem: 0, cstCsosn: '102', aliquotaIcms: 0, ibsRate: 0.1, cbsRate: 0.9, aliquotaIbpt: 18.45 };
const baseOrder = () => ({
  idempotencyKey: uuidV7(), terminalId: 'CAIXA-01', origin: 'PDV_ASSISTIDO' as const,
  items: [{ productId: uuidV7(), quantity: 1, additions: [] }],
  payment: { idempotencyKey: uuidV7(), method: 'CASH' as const, amountTenderedCents: 5_000 },
});

describe('shared HTTP contracts', () => {
  it('creates RFC 9562 UUIDv7 identifiers with millisecond timestamp and secure random tail', () => {
    const timestamp = 1_700_000_000_123;
    const ids = Array.from({ length: 1_000 }, () => uuidV7(timestamp));
    expect(ids.every(isUuidV7)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Number.parseInt(ids[0]!.replaceAll('-', '').slice(0, 12), 16)).toBe(timestamp);
    expect(() => uuidV7(-1)).toThrow(RangeError);
    expect(() => uuidV7(Number.NaN)).toThrow(RangeError);
  });

  it('rejects fractional or negative monetary values and unknown checkout properties', () => {
    expect(centsSchema.safeParse(10.5).success).toBe(false);
    expect(centsSchema.safeParse(-1).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...baseOrder(), totalCents: 1 }).success).toBe(false);
    expect(orderInputSchema.safeParse(baseOrder()).success).toBe(true);
  });

  it('rejects non-UUID entity references and repeated additions', () => {
    const order = baseOrder();
    const additionId = uuidV7();
    expect(orderInputSchema.safeParse({ ...order, items: [{ productId: 'not-a-uuid', quantity: 1, additions: [] }] }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...order, items: [{ ...order.items[0], additions: [{ additionId, quantity: 1 }, { additionId, quantity: 1 }] }] }).success).toBe(false);
  });

  it('requires authorization for electronic checkout and forbids kiosk cash', () => {
    expect(orderInputSchema.safeParse({ ...baseOrder(), origin: 'TOTEM' }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...baseOrder(), payment: { idempotencyKey: uuidV7(), method: 'PIX' } }).success).toBe(false);
  });

  it('accepts only a coherent offline authorization with receipt before confirmation', () => {
    const order = baseOrder();
    const idempotencyKey = uuidV7();
    const now = new Date().toISOString();
    const offline = { createdAt: now, authorizedPayment: { idempotencyKey, method: 'PIX', amountCents: 3_000, nsu: '123456789012', authorizationCode: '123456', authorizedAt: now }, printedAt: now, confirmedAt: now };
    const input = { ...order, origin: 'TOTEM', payment: { idempotencyKey, method: 'PIX' }, offline };
    expect(orderInputSchema.safeParse(input).success).toBe(true);
    expect(orderInputSchema.safeParse({ ...input, offline: { ...offline, printedAt: undefined } }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...input, offline: { ...offline, authorizedPayment: { ...offline.authorizedPayment, idempotencyKey: uuidV7() } } }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...input, origin: 'PDV_ASSISTIDO' }).success).toBe(false);
  });

  it('rejects negative effective size prices and preserves explicit fixed size prices', () => {
    const product = { categoryId: uuidV7(), name: 'Produto de teste', description: '', imageUrl: '', basePriceCents: 1_000, active: true, availableInKiosk: true, availableInPdv: true, sizes: [{ name: 'Pequeno', priceModifierCents: -1_001 }], additions: [], fiscal };
    expect(productInputSchema.safeParse(product).success).toBe(false);
    expect(productInputSchema.safeParse({ ...product, sizes: [{ ...product.sizes[0], priceCents: 500 }] }).success).toBe(true);
  });
});
