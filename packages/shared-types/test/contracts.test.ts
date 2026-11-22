import { describe, expect, it } from 'vitest';
import { centsSchema, cnpjSchema, isUuidV7, offlineOrderLineSchema, orderInputSchema, productInputSchema, shiftCloseInputSchema, signedCentsSchema, uuidV7 } from '../src/index.js';

const fiscal = { ncm: '21069090', cest: '', cfop: '5102', origem: 0, cstCsosn: '102', aliquotaIcms: 0, ibsRate: 0.1, cbsRate: 0.9, aliquotaIbpt: 18.45 };
const baseOrder = () => ({
  idempotencyKey: uuidV7(), terminalId: 'CAIXA-01', origin: 'PDV_ASSISTIDO' as const,
  items: [{ productId: uuidV7(), quantity: 1, additions: [] }],
  payment: { idempotencyKey: uuidV7(), method: 'CASH' as const, amountTenderedCents: 5_000 },
});
const baseProduct = () => ({
  categoryId: uuidV7(), name: 'Produto de teste', description: '', imageUrl: '', basePriceCents: 1_000,
  active: true, availableInKiosk: true, availableInPdv: true, sizes: [], additions: [], fiscal,
});

describe('shared HTTP contracts', () => {
  it('preserves numeric and alphanumeric CNPJ formats with numeric final check positions', () => {
    expect(cnpjSchema.parse('12345678000190')).toBe('12345678000190');
    expect(cnpjSchema.parse(' 12abc34501de35 ')).toBe('12ABC34501DE35');
    expect(cnpjSchema.safeParse('12ABC34501DEAB').success).toBe(false);
    expect(cnpjSchema.safeParse('12.ABC.345/01DE-35').success).toBe(false);
  });
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

  it('accepts an optional quoted checkout total only in positive integer cents', () => {
    const order = baseOrder();
    expect(orderInputSchema.parse({ ...order, expectedTotalCents: 2_990 }).expectedTotalCents).toBe(2_990);
    for (const expectedTotalCents of [0, -1, 29.9, 1_000_000_000]) {
      expect(orderInputSchema.safeParse({ ...order, expectedTotalCents }).success).toBe(false);
    }
    expect(orderInputSchema.parse(order).expectedTotalCents).toBeUndefined();
  });

  it('preserves optimistic product version and an audit reason, while rejecting malformed metadata', () => {
    const product = baseProduct();
    expect(productInputSchema.parse(product).expectedVersion).toBeUndefined();
    expect(productInputSchema.parse({ ...product, expectedVersion: 3, changeReason: '  Atualização do custo de insumos  ' })).toMatchObject({ expectedVersion: 3, changeReason: 'Atualização do custo de insumos' });
    for (const expectedVersion of [0, -1, 1.5, 2_147_483_648]) {
      expect(productInputSchema.safeParse({ ...product, expectedVersion }).success).toBe(false);
    }
    expect(productInputSchema.safeParse({ ...product, expectedVersion: 3, changeReason: '  ' }).success).toBe(false);
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
  it('preserves a zero-price item snapshot within an otherwise paid order', () => {
    expect(offlineOrderLineSchema.parse({ productId: uuidV7(), productName: 'Cortesia', unitPriceCents: 0, quantity: 1, additions: [], totalCents: 0, fiscal }).totalCents).toBe(0);
  });

  it.each(['CREDIT_CARD', 'DEBIT_CARD', 'PIX'] as const)('accepts a negative net counted amount for %s after cross-shift refunds', (method) => {
    const declared = { CASH: 0, CREDIT_CARD: 0, DEBIT_CARD: 0, PIX: 0, [method]: -2_990 };
    expect(shiftCloseInputSchema.parse({ declared, reason: 'Estorno de venda de turno anterior' }).declared[method]).toBe(-2_990);
  });

  it('keeps counted cash nonnegative and electronic settlement within integer limits', () => {
    expect(shiftCloseInputSchema.safeParse({ declared: { CASH: -1, CREDIT_CARD: 0, DEBIT_CARD: 0, PIX: 0 }, reason: 'Contagem inválida' }).success).toBe(false);
    expect(signedCentsSchema.safeParse(-999_999_999_999).success).toBe(true);
    expect(signedCentsSchema.safeParse(-1_000_000_000_000).success).toBe(false);
    expect(shiftCloseInputSchema.safeParse({ declared: { CASH: 3_000_003_797, CREDIT_CARD: 0, DEBIT_CARD: 0, PIX: 0 }, reason: 'Contagem consolidada de movimentações válidas' }).success).toBe(true);
    expect(signedCentsSchema.safeParse(-1.5).success).toBe(false);
  });
});
