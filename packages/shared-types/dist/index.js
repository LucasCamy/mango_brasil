import { z } from 'zod';
/** All monetary values crossing these contracts are integer BRL cents. */
export const roles = ['OWNER', 'MANAGER', 'CASHIER'];
export const paymentMethods = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX'];
export const electronicPaymentMethods = ['CREDIT_CARD', 'DEBIT_CARD', 'PIX'];
export const paymentStates = ['INITIALIZING', 'WAITING_CARD_OR_QR', 'PROCESSING', 'AUTHORIZED', 'CONFIRMED', 'REVERSED', 'FAILED'];
export const orderStatuses = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'];
export const orderOrigins = ['PDV_ASSISTIDO', 'TOTEM'];
export const fiscalModes = ['disabled', 'sandbox'];
export const nfceStatuses = ['NOT_EMITTED', 'SIMULATED'];
export const cashMovementTypes = ['INITIAL_SUPPLY', 'SUPPLY', 'BLEED_SANGRIA', 'ORDER_PAYMENT', 'ORDER_REFUND'];
export const taxRegimes = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'];
export const roleSchema = z.enum(roles);
export const paymentMethodSchema = z.enum(paymentMethods);
export const electronicPaymentMethodSchema = z.enum(electronicPaymentMethods);
export const paymentStateSchema = z.enum(paymentStates);
export const orderStatusSchema = z.enum(orderStatuses);
export const orderOriginSchema = z.enum(orderOrigins);
export const fiscalModeSchema = z.enum(fiscalModes);
export const centsSchema = z.number().int().min(0).max(999_999_999);
export const positiveCentsSchema = centsSchema.min(1);
export const idSchema = z.string().trim().min(1).max(100);
export const uuidSchema = z.string().uuid('Informe um identificador UUID válido.');
export const uuidV7Schema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Informe um UUID v7 válido.');
export const reasonSchema = z.string().trim().min(3, 'Informe um motivo com pelo menos 3 caracteres.').max(500);
/** RFC 9562 UUIDv7 with 74 random bits from the platform CSPRNG. */
export function uuidV7(timestamp = Date.now()) {
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 281_474_976_710_655) {
        throw new RangeError('UUID v7 timestamp must fit in 48 unsigned bits.');
    }
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    let time = BigInt(timestamp);
    for (let index = 5; index >= 0; index -= 1) {
        bytes[index] = Number(time & 255n);
        time >>= 8n;
    }
    bytes[6] = ((bytes[6] ?? 0) & 15) | 112;
    bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function isUuidV7(value) {
    return uuidV7Schema.safeParse(value).success;
}
export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const loginInputSchema = z.object({
    email: z.string().trim().email().max(254), password: z.string().min(1).max(128),
}).strict();
export const supervisorInputSchema = z.object({
    email: z.string().trim().email().max(254),
    pin: z.string().regex(/^\d{4,12}$/, 'Informe o PIN de 4 a 12 dígitos.'),
    action: z.enum(['ORDER_CANCELLED', 'SHIFT_CLOSED', 'CASH_BLEED', 'CASH_SUPPLY']),
    resourceId: idSchema,
}).strict();
export const userInputSchema = z.object({
    name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254),
    password: z.string().min(12).max(128), role: roleSchema,
    supervisorPin: z.string().regex(/^\d{6,12}$/).optional(), active: z.boolean().default(true),
}).strict();
export const userUpdateInputSchema = userInputSchema.omit({ password: true }).extend({
    password: z.string().min(12).max(128).optional(),
}).strict();
export const categoryInputSchema = z.object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
    order: z.number().int().min(0).max(10_000).default(0), active: z.boolean().default(true),
}).strict();
const taxRateSchema = z.number().min(0).max(100).finite();
export const fiscalTaxDataSchema = z.object({
    ncm: z.string().regex(/^\d{8}$/, 'NCM deve ter 8 dígitos.'),
    cest: z.string().regex(/^(?:\d{7})?$/, 'CEST deve ter 7 dígitos ou ficar vazio.').default(''),
    cfop: z.string().regex(/^\d{4}$/, 'CFOP deve ter 4 dígitos.'),
    origem: z.number().int().min(0).max(8),
    cstCsosn: z.string().regex(/^\d{2,3}$/, 'CST/CSOSN deve ter 2 ou 3 dígitos.'),
    aliquotaIcms: taxRateSchema, ibsRate: taxRateSchema, cbsRate: taxRateSchema, aliquotaIbpt: taxRateSchema,
}).strict();
export const productSizeInputSchema = z.object({
    id: uuidSchema.optional(), name: z.string().trim().min(1).max(60),
    priceModifierCents: z.number().int().min(-999_999_999).max(999_999_999),
    priceCents: centsSchema.nullable().optional(),
}).strict();
export const productAdditionInputSchema = z.object({
    id: uuidSchema.optional(), name: z.string().trim().min(1).max(80), priceCents: centsSchema,
    maxQuantity: z.number().int().min(1).max(50),
}).strict();
export const productInputSchema = z.object({
    categoryId: uuidSchema, name: z.string().trim().min(2).max(160), description: z.string().trim().max(2_000),
    imageUrl: z.union([z.string().url().max(2_048), z.literal('')]).default(''),
    basePriceCents: centsSchema, active: z.boolean(), availableInKiosk: z.boolean(), availableInPdv: z.boolean(),
    sizes: z.array(productSizeInputSchema).max(30), additions: z.array(productAdditionInputSchema).max(50),
    fiscal: fiscalTaxDataSchema,
}).strict().superRefine((product, context) => {
    const explicitIds = [...product.sizes, ...product.additions].map((entry) => entry.id).filter((id) => id !== undefined);
    if (new Set(explicitIds).size !== explicitIds.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['sizes'], message: 'Tamanhos e adicionais devem possuir identificadores distintos.' });
    }
    product.sizes.forEach((size, index) => {
        if (size.priceCents == null && product.basePriceCents + size.priceModifierCents < 0) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['sizes', index, 'priceModifierCents'], message: 'O preço final do tamanho não pode ser negativo.' });
        }
    });
});
export const selectedAdditionInputSchema = z.object({ additionId: uuidSchema, quantity: z.number().int().min(1).max(50) }).strict();
export const orderItemInputSchema = z.object({
    productId: uuidSchema, sizeId: uuidSchema.optional(), quantity: z.number().int().min(1).max(99),
    additions: z.array(selectedAdditionInputSchema).max(50), notes: z.string().trim().max(300).optional(),
}).strict().superRefine((item, context) => {
    if (new Set(item.additions.map((addition) => addition.additionId)).size !== item.additions.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['additions'], message: 'Agrupe a quantidade de cada adicional em uma única linha.' });
    }
});
export const orderPaymentInputSchema = z.object({
    idempotencyKey: uuidV7Schema, method: paymentMethodSchema,
    amountTenderedCents: centsSchema.optional(), terminalTransactionId: uuidSchema.optional(),
}).strict();
export const offlineAuthorizedPaymentSchema = z.object({
    idempotencyKey: uuidV7Schema, method: electronicPaymentMethodSchema, amountCents: positiveCentsSchema,
    nsu: z.string().regex(/^\d{6,20}$/), authorizationCode: z.string().regex(/^[a-zA-Z0-9]{4,20}$/),
    authorizedAt: z.string().datetime({ offset: true }),
}).strict();
export const offlineOrderLineSchema = z.object({
    productId: uuidSchema, productName: z.string().trim().min(1).max(160), sizeId: uuidSchema.optional(), sizeName: z.string().trim().min(1).max(60).optional(),
    unitPriceCents: centsSchema, quantity: z.number().int().min(1).max(99),
    additions: z.array(z.object({ additionId: uuidSchema, name: z.string().trim().min(1).max(80), priceCents: centsSchema, quantity: z.number().int().min(1).max(50) }).strict()).max(50),
    notes: z.string().trim().max(300).optional(), totalCents: positiveCentsSchema, fiscal: fiscalTaxDataSchema,
}).strict();
export const offlineOrderEnvelopeSchema = z.object({
    authorizedPayment: offlineAuthorizedPaymentSchema,
    createdAt: z.string().datetime({ offset: true }), contingencyTicket: z.string().trim().min(1).max(80).optional(),
    printedAt: z.string().datetime({ offset: true }).optional(), confirmedAt: z.string().datetime({ offset: true }).optional(),
    lines: z.array(offlineOrderLineSchema).min(1).max(100).optional(),
}).strict();
export const orderInputSchema = z.object({
    idempotencyKey: uuidV7Schema, terminalId: idSchema, origin: orderOriginSchema,
    items: z.array(orderItemInputSchema).min(1).max(100), payment: orderPaymentInputSchema, offline: offlineOrderEnvelopeSchema.optional(),
}).strict().superRefine((order, context) => {
    if (order.payment.method === 'CASH' && order.origin !== 'PDV_ASSISTIDO') {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['payment', 'method'], message: 'Dinheiro só está disponível no PDV assistido.' });
    }
    if (order.payment.method === 'CASH' && order.payment.amountTenderedCents === undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['payment', 'amountTenderedCents'], message: 'Informe o valor recebido em dinheiro.' });
    }
    if (order.payment.method !== 'CASH' && order.payment.terminalTransactionId === undefined && order.offline === undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['payment', 'terminalTransactionId'], message: 'A autorização do terminal é obrigatória.' });
    }
    if (order.payment.method !== 'CASH' && order.payment.amountTenderedCents !== undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['payment', 'amountTenderedCents'], message: 'Valor recebido é exclusivo de pagamentos em dinheiro.' });
    }
    if (order.offline !== undefined) {
        if (order.origin !== 'TOTEM')
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['offline'], message: 'A sincronização offline é exclusiva do totem.' });
        if (order.offline.authorizedPayment.idempotencyKey !== order.payment.idempotencyKey || order.offline.authorizedPayment.method !== order.payment.method) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['offline', 'authorizedPayment'], message: 'A autorização offline deve corresponder ao pagamento do pedido.' });
        }
        if (order.offline.confirmedAt !== undefined && order.offline.printedAt === undefined) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['offline', 'printedAt'], message: 'Uma confirmação exige a impressão prévia do comprovante.' });
        }
    }
});
export const paymentAuthorizeInputSchema = z.object({
    idempotencyKey: uuidV7Schema, terminalId: idSchema, method: electronicPaymentMethodSchema, amountCents: positiveCentsSchema,
}).strict();
export const shiftOpenInputSchema = z.object({ terminalId: idSchema, initialCashCents: centsSchema }).strict();
export const cashMovementInputSchema = z.object({
    idempotencyKey: uuidV7Schema, type: z.enum(['SUPPLY', 'BLEED_SANGRIA']), amountCents: positiveCentsSchema, reason: reasonSchema,
}).strict();
export const shiftCloseInputSchema = z.object({
    declared: z.object({ CASH: centsSchema, CREDIT_CARD: centsSchema, DEBIT_CARD: centsSchema, PIX: centsSchema }).strict(), reason: reasonSchema,
}).strict();
export const companyAddressSchema = z.object({
    street: z.string().trim().min(2).max(160), number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(100), neighborhood: z.string().trim().min(2).max(100), city: z.string().trim().min(2).max(100),
    state: z.enum(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']),
    postalCode: z.string().regex(/^\d{8}$/, 'CEP deve ter 8 dígitos.'), ibgeCityCode: z.string().regex(/^\d{7}$/, 'Código IBGE deve ter 7 dígitos.'),
}).strict();
export const companySettingsInputSchema = z.object({
    legalName: z.string().trim().min(2).max(160), tradeName: z.string().trim().min(2).max(160),
    cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos.'), stateRegistration: z.string().trim().min(1).max(30),
    address: companyAddressSchema, taxRegime: z.enum(taxRegimes), cscId: z.string().regex(/^\d{1,6}$/),
    cscToken: z.string().min(1).max(100).optional(), nfceSeries: z.number().int().min(1).max(999),
    nextNfceNumber: z.number().int().min(1).max(999_999_999), acceptsCashOnPdv: z.boolean(),
    inactivityTimeoutSeconds: z.number().int().min(15).max(600).default(45),
}).strict();
export const terminalInputSchema = z.object({ id: idSchema, name: z.string().trim().min(2).max(100), type: z.enum(['PDV', 'TOTEM']) }).strict();
export const heartbeatInputSchema = z.object({
    appVersion: z.string().trim().min(1).max(40), printerStatus: z.enum(['READY', 'OUT_OF_PAPER', 'ERROR']), pinpadStatus: z.enum(['CONNECTED', 'DISCONNECTED']),
}).strict();
export const maintenanceInputSchema = z.object({ enabled: z.boolean(), message: z.string().trim().max(300), reason: reasonSchema }).strict();
export const queueNames = { kdsOrders: 'kds.orders.queue', printJobs: 'print.jobs.queue', offlineSync: 'totem.offline_sync.queue', fiscalNfce: 'fiscal.nfce.queue' };
export const apiSchemas = {
    LoginInput: loginInputSchema, SupervisorInput: supervisorInputSchema, UserInput: userInputSchema, UserUpdateInput: userUpdateInputSchema,
    ProductInput: productInputSchema, CategoryInput: categoryInputSchema, OrderInput: orderInputSchema, PaymentAuthorizeInput: paymentAuthorizeInputSchema,
    ShiftOpenInput: shiftOpenInputSchema, CashMovementInput: cashMovementInputSchema, ShiftCloseInput: shiftCloseInputSchema,
    CompanySettingsInput: companySettingsInputSchema, TerminalInput: terminalInputSchema, HeartbeatInput: heartbeatInputSchema, MaintenanceInput: maintenanceInputSchema,
};
