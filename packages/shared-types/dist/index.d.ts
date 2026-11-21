import { z } from 'zod';
/** All monetary values crossing these contracts are integer BRL cents. */
export declare const roles: readonly ["OWNER", "MANAGER", "CASHIER"];
export declare const paymentMethods: readonly ["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX"];
export declare const electronicPaymentMethods: readonly ["CREDIT_CARD", "DEBIT_CARD", "PIX"];
export declare const paymentStates: readonly ["INITIALIZING", "WAITING_CARD_OR_QR", "PROCESSING", "AUTHORIZED", "CONFIRMED", "REVERSED", "FAILED"];
export declare const orderStatuses: readonly ["RECEIVED", "PREPARING", "READY", "DELIVERED", "CANCELLED"];
export declare const orderOrigins: readonly ["PDV_ASSISTIDO", "TOTEM"];
export declare const fiscalModes: readonly ["disabled", "sandbox"];
export declare const nfceStatuses: readonly ["NOT_EMITTED", "SIMULATED"];
export declare const cashMovementTypes: readonly ["INITIAL_SUPPLY", "SUPPLY", "BLEED_SANGRIA", "ORDER_PAYMENT", "ORDER_REFUND"];
export declare const taxRegimes: readonly ["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"];
export type Role = (typeof roles)[number];
export type PaymentMethod = (typeof paymentMethods)[number];
export type PaymentMethodType = PaymentMethod;
export type ElectronicPaymentMethod = (typeof electronicPaymentMethods)[number];
export type PaymentState = (typeof paymentStates)[number];
export type OrderStatus = (typeof orderStatuses)[number];
export type OrderOrigin = (typeof orderOrigins)[number];
export type FiscalMode = (typeof fiscalModes)[number];
export type NfceStatus = (typeof nfceStatuses)[number];
export type CashMovementType = (typeof cashMovementTypes)[number];
export type TaxRegime = (typeof taxRegimes)[number];
export declare const roleSchema: z.ZodEnum<["OWNER", "MANAGER", "CASHIER"]>;
export declare const paymentMethodSchema: z.ZodEnum<["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
export declare const electronicPaymentMethodSchema: z.ZodEnum<["CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
export declare const paymentStateSchema: z.ZodEnum<["INITIALIZING", "WAITING_CARD_OR_QR", "PROCESSING", "AUTHORIZED", "CONFIRMED", "REVERSED", "FAILED"]>;
export declare const orderStatusSchema: z.ZodEnum<["RECEIVED", "PREPARING", "READY", "DELIVERED", "CANCELLED"]>;
export declare const orderOriginSchema: z.ZodEnum<["PDV_ASSISTIDO", "TOTEM"]>;
export declare const fiscalModeSchema: z.ZodEnum<["disabled", "sandbox"]>;
export declare const centsSchema: z.ZodNumber;
export declare const positiveCentsSchema: z.ZodNumber;
export declare const idSchema: z.ZodString;
export declare const uuidSchema: z.ZodString;
export declare const uuidV7Schema: z.ZodString;
export declare const reasonSchema: z.ZodString;
/** RFC 9562 UUIDv7 with 74 random bits from the platform CSPRNG. */
export declare function uuidV7(timestamp?: number): string;
export declare function isUuidV7(value: unknown): value is string;
export interface ProblemDetails {
    type: string;
    title: string;
    status: number;
    detail?: string;
    instance?: string;
    code?: string;
    traceId?: string;
    errors?: Record<string, string[]>;
}
export interface Page<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}
export declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export interface UserDTO {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
    createdAt: string;
}
export type User = UserDTO;
export declare const loginInputSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export declare const supervisorInputSchema: z.ZodObject<{
    email: z.ZodString;
    pin: z.ZodString;
    action: z.ZodEnum<["ORDER_CANCELLED", "SHIFT_CLOSED", "CASH_BLEED", "CASH_SUPPLY"]>;
    resourceId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    email: string;
    pin: string;
    action: "ORDER_CANCELLED" | "SHIFT_CLOSED" | "CASH_BLEED" | "CASH_SUPPLY";
    resourceId: string;
}, {
    email: string;
    pin: string;
    action: "ORDER_CANCELLED" | "SHIFT_CLOSED" | "CASH_BLEED" | "CASH_SUPPLY";
    resourceId: string;
}>;
export type SupervisorInput = z.infer<typeof supervisorInputSchema>;
export declare const userInputSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodEnum<["OWNER", "MANAGER", "CASHIER"]>;
    supervisorPin: z.ZodOptional<z.ZodString>;
    active: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    email: string;
    password: string;
    name: string;
    role: "OWNER" | "MANAGER" | "CASHIER";
    active: boolean;
    supervisorPin?: string | undefined;
}, {
    email: string;
    password: string;
    name: string;
    role: "OWNER" | "MANAGER" | "CASHIER";
    supervisorPin?: string | undefined;
    active?: boolean | undefined;
}>;
export type UserInput = z.infer<typeof userInputSchema>;
export declare const userUpdateInputSchema: z.ZodObject<Omit<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodEnum<["OWNER", "MANAGER", "CASHIER"]>;
    supervisorPin: z.ZodOptional<z.ZodString>;
    active: z.ZodDefault<z.ZodBoolean>;
}, "password"> & {
    password: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    email: string;
    name: string;
    role: "OWNER" | "MANAGER" | "CASHIER";
    active: boolean;
    password?: string | undefined;
    supervisorPin?: string | undefined;
}, {
    email: string;
    name: string;
    role: "OWNER" | "MANAGER" | "CASHIER";
    password?: string | undefined;
    supervisorPin?: string | undefined;
    active?: boolean | undefined;
}>;
export type UserUpdateInput = z.infer<typeof userUpdateInputSchema>;
export interface ProductCategory {
    id: string;
    name: string;
    slug: string;
    order: number;
    active: boolean;
}
export declare const categoryInputSchema: z.ZodObject<{
    name: z.ZodString;
    slug: z.ZodString;
    order: z.ZodDefault<z.ZodNumber>;
    active: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    name: string;
    active: boolean;
    slug: string;
    order: number;
}, {
    name: string;
    slug: string;
    active?: boolean | undefined;
    order?: number | undefined;
}>;
export interface ProductSize {
    id: string;
    name: string;
    priceModifierCents: number;
    priceCents?: number | null;
}
export interface ProductAddition {
    id: string;
    name: string;
    priceCents: number;
    maxQuantity: number;
}
export interface FiscalTaxData {
    ncm: string;
    cest: string;
    cfop: string;
    origem: number;
    cstCsosn: string;
    aliquotaIcms: number;
    ibsRate: number;
    cbsRate: number;
    aliquotaIbpt: number;
}
export declare const fiscalTaxDataSchema: z.ZodObject<{
    ncm: z.ZodString;
    cest: z.ZodDefault<z.ZodString>;
    cfop: z.ZodString;
    origem: z.ZodNumber;
    cstCsosn: z.ZodString;
    aliquotaIcms: z.ZodNumber;
    ibsRate: z.ZodNumber;
    cbsRate: z.ZodNumber;
    aliquotaIbpt: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    ncm: string;
    cest: string;
    cfop: string;
    origem: number;
    cstCsosn: string;
    aliquotaIcms: number;
    ibsRate: number;
    cbsRate: number;
    aliquotaIbpt: number;
}, {
    ncm: string;
    cfop: string;
    origem: number;
    cstCsosn: string;
    aliquotaIcms: number;
    ibsRate: number;
    cbsRate: number;
    aliquotaIbpt: number;
    cest?: string | undefined;
}>;
export declare const productSizeInputSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    priceModifierCents: z.ZodNumber;
    priceCents: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    priceModifierCents: number;
    id?: string | undefined;
    priceCents?: number | null | undefined;
}, {
    name: string;
    priceModifierCents: number;
    id?: string | undefined;
    priceCents?: number | null | undefined;
}>;
export declare const productAdditionInputSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    priceCents: z.ZodNumber;
    maxQuantity: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    name: string;
    priceCents: number;
    maxQuantity: number;
    id?: string | undefined;
}, {
    name: string;
    priceCents: number;
    maxQuantity: number;
    id?: string | undefined;
}>;
export declare const productInputSchema: z.ZodEffects<z.ZodObject<{
    categoryId: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    imageUrl: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    basePriceCents: z.ZodNumber;
    active: z.ZodBoolean;
    availableInKiosk: z.ZodBoolean;
    availableInPdv: z.ZodBoolean;
    sizes: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        priceModifierCents: z.ZodNumber;
        priceCents: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, "strict", z.ZodTypeAny, {
        name: string;
        priceModifierCents: number;
        id?: string | undefined;
        priceCents?: number | null | undefined;
    }, {
        name: string;
        priceModifierCents: number;
        id?: string | undefined;
        priceCents?: number | null | undefined;
    }>, "many">;
    additions: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        priceCents: z.ZodNumber;
        maxQuantity: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        name: string;
        priceCents: number;
        maxQuantity: number;
        id?: string | undefined;
    }, {
        name: string;
        priceCents: number;
        maxQuantity: number;
        id?: string | undefined;
    }>, "many">;
    fiscal: z.ZodObject<{
        ncm: z.ZodString;
        cest: z.ZodDefault<z.ZodString>;
        cfop: z.ZodString;
        origem: z.ZodNumber;
        cstCsosn: z.ZodString;
        aliquotaIcms: z.ZodNumber;
        ibsRate: z.ZodNumber;
        cbsRate: z.ZodNumber;
        aliquotaIbpt: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        ncm: string;
        cest: string;
        cfop: string;
        origem: number;
        cstCsosn: string;
        aliquotaIcms: number;
        ibsRate: number;
        cbsRate: number;
        aliquotaIbpt: number;
    }, {
        ncm: string;
        cfop: string;
        origem: number;
        cstCsosn: string;
        aliquotaIcms: number;
        ibsRate: number;
        cbsRate: number;
        aliquotaIbpt: number;
        cest?: string | undefined;
    }>;
}, "strict", z.ZodTypeAny, {
    name: string;
    active: boolean;
    categoryId: string;
    description: string;
    imageUrl: string;
    basePriceCents: number;
    availableInKiosk: boolean;
    availableInPdv: boolean;
    sizes: {
        name: string;
        priceModifierCents: number;
        id?: string | undefined;
        priceCents?: number | null | undefined;
    }[];
    additions: {
        name: string;
        priceCents: number;
        maxQuantity: number;
        id?: string | undefined;
    }[];
    fiscal: {
        ncm: string;
        cest: string;
        cfop: string;
        origem: number;
        cstCsosn: string;
        aliquotaIcms: number;
        ibsRate: number;
        cbsRate: number;
        aliquotaIbpt: number;
    };
}, {
    name: string;
    active: boolean;
    categoryId: string;
    description: string;
    basePriceCents: number;
    availableInKiosk: boolean;
    availableInPdv: boolean;
    sizes: {
        name: string;
        priceModifierCents: number;
        id?: string | undefined;
        priceCents?: number | null | undefined;
    }[];
    additions: {
        name: string;
        priceCents: number;
        maxQuantity: number;
        id?: string | undefined;
    }[];
    fiscal: {
        ncm: string;
        cfop: string;
        origem: number;
        cstCsosn: string;
        aliquotaIcms: number;
        ibsRate: number;
        cbsRate: number;
        aliquotaIbpt: number;
        cest?: string | undefined;
    };
    imageUrl?: string | undefined;
}>, {
    name: string;
    active: boolean;
    categoryId: string;
    description: string;
    imageUrl: string;
    basePriceCents: number;
    availableInKiosk: boolean;
    availableInPdv: boolean;
    sizes: {
        name: string;
        priceModifierCents: number;
        id?: string | undefined;
        priceCents?: number | null | undefined;
    }[];
    additions: {
        name: string;
        priceCents: number;
        maxQuantity: number;
        id?: string | undefined;
    }[];
    fiscal: {
        ncm: string;
        cest: string;
        cfop: string;
        origem: number;
        cstCsosn: string;
        aliquotaIcms: number;
        ibsRate: number;
        cbsRate: number;
        aliquotaIbpt: number;
    };
}, {
    name: string;
    active: boolean;
    categoryId: string;
    description: string;
    basePriceCents: number;
    availableInKiosk: boolean;
    availableInPdv: boolean;
    sizes: {
        name: string;
        priceModifierCents: number;
        id?: string | undefined;
        priceCents?: number | null | undefined;
    }[];
    additions: {
        name: string;
        priceCents: number;
        maxQuantity: number;
        id?: string | undefined;
    }[];
    fiscal: {
        ncm: string;
        cfop: string;
        origem: number;
        cstCsosn: string;
        aliquotaIcms: number;
        ibsRate: number;
        cbsRate: number;
        aliquotaIbpt: number;
        cest?: string | undefined;
    };
    imageUrl?: string | undefined;
}>;
export type ProductInput = z.infer<typeof productInputSchema>;
export interface Product {
    id: string;
    categoryId: string;
    name: string;
    description: string;
    imageUrl: string;
    basePriceCents: number;
    active: boolean;
    availableInKiosk: boolean;
    availableInPdv: boolean;
    sizes: ProductSize[];
    additions: ProductAddition[];
    fiscal: FiscalTaxData;
    createdAt: string;
    updatedAt: string;
}
export interface CatalogDTO {
    categories: ProductCategory[];
    products: Product[];
    version: string;
}
export type Catalog = CatalogDTO;
export declare const selectedAdditionInputSchema: z.ZodObject<{
    additionId: z.ZodString;
    quantity: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    additionId: string;
    quantity: number;
}, {
    additionId: string;
    quantity: number;
}>;
export declare const orderItemInputSchema: z.ZodEffects<z.ZodObject<{
    productId: z.ZodString;
    sizeId: z.ZodOptional<z.ZodString>;
    quantity: z.ZodNumber;
    additions: z.ZodArray<z.ZodObject<{
        additionId: z.ZodString;
        quantity: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        additionId: string;
        quantity: number;
    }, {
        additionId: string;
        quantity: number;
    }>, "many">;
    notes: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    additions: {
        additionId: string;
        quantity: number;
    }[];
    quantity: number;
    productId: string;
    sizeId?: string | undefined;
    notes?: string | undefined;
}, {
    additions: {
        additionId: string;
        quantity: number;
    }[];
    quantity: number;
    productId: string;
    sizeId?: string | undefined;
    notes?: string | undefined;
}>, {
    additions: {
        additionId: string;
        quantity: number;
    }[];
    quantity: number;
    productId: string;
    sizeId?: string | undefined;
    notes?: string | undefined;
}, {
    additions: {
        additionId: string;
        quantity: number;
    }[];
    quantity: number;
    productId: string;
    sizeId?: string | undefined;
    notes?: string | undefined;
}>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export declare const orderPaymentInputSchema: z.ZodObject<{
    idempotencyKey: z.ZodString;
    method: z.ZodEnum<["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
    amountTenderedCents: z.ZodOptional<z.ZodNumber>;
    terminalTransactionId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    idempotencyKey: string;
    method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
    amountTenderedCents?: number | undefined;
    terminalTransactionId?: string | undefined;
}, {
    idempotencyKey: string;
    method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
    amountTenderedCents?: number | undefined;
    terminalTransactionId?: string | undefined;
}>;
export declare const offlineAuthorizedPaymentSchema: z.ZodObject<{
    idempotencyKey: z.ZodString;
    method: z.ZodEnum<["CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
    amountCents: z.ZodNumber;
    nsu: z.ZodString;
    authorizationCode: z.ZodString;
    authorizedAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    idempotencyKey: string;
    method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
    amountCents: number;
    nsu: string;
    authorizationCode: string;
    authorizedAt: string;
}, {
    idempotencyKey: string;
    method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
    amountCents: number;
    nsu: string;
    authorizationCode: string;
    authorizedAt: string;
}>;
export declare const offlineOrderLineSchema: z.ZodObject<{
    productId: z.ZodString;
    productName: z.ZodString;
    sizeId: z.ZodOptional<z.ZodString>;
    sizeName: z.ZodOptional<z.ZodString>;
    unitPriceCents: z.ZodNumber;
    quantity: z.ZodNumber;
    additions: z.ZodArray<z.ZodObject<{
        additionId: z.ZodString;
        name: z.ZodString;
        priceCents: z.ZodNumber;
        quantity: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        name: string;
        priceCents: number;
        additionId: string;
        quantity: number;
    }, {
        name: string;
        priceCents: number;
        additionId: string;
        quantity: number;
    }>, "many">;
    notes: z.ZodOptional<z.ZodString>;
    totalCents: z.ZodNumber;
    fiscal: z.ZodObject<{
        ncm: z.ZodString;
        cest: z.ZodDefault<z.ZodString>;
        cfop: z.ZodString;
        origem: z.ZodNumber;
        cstCsosn: z.ZodString;
        aliquotaIcms: z.ZodNumber;
        ibsRate: z.ZodNumber;
        cbsRate: z.ZodNumber;
        aliquotaIbpt: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        ncm: string;
        cest: string;
        cfop: string;
        origem: number;
        cstCsosn: string;
        aliquotaIcms: number;
        ibsRate: number;
        cbsRate: number;
        aliquotaIbpt: number;
    }, {
        ncm: string;
        cfop: string;
        origem: number;
        cstCsosn: string;
        aliquotaIcms: number;
        ibsRate: number;
        cbsRate: number;
        aliquotaIbpt: number;
        cest?: string | undefined;
    }>;
}, "strict", z.ZodTypeAny, {
    additions: {
        name: string;
        priceCents: number;
        additionId: string;
        quantity: number;
    }[];
    fiscal: {
        ncm: string;
        cest: string;
        cfop: string;
        origem: number;
        cstCsosn: string;
        aliquotaIcms: number;
        ibsRate: number;
        cbsRate: number;
        aliquotaIbpt: number;
    };
    quantity: number;
    productId: string;
    productName: string;
    unitPriceCents: number;
    totalCents: number;
    sizeId?: string | undefined;
    notes?: string | undefined;
    sizeName?: string | undefined;
}, {
    additions: {
        name: string;
        priceCents: number;
        additionId: string;
        quantity: number;
    }[];
    fiscal: {
        ncm: string;
        cfop: string;
        origem: number;
        cstCsosn: string;
        aliquotaIcms: number;
        ibsRate: number;
        cbsRate: number;
        aliquotaIbpt: number;
        cest?: string | undefined;
    };
    quantity: number;
    productId: string;
    productName: string;
    unitPriceCents: number;
    totalCents: number;
    sizeId?: string | undefined;
    notes?: string | undefined;
    sizeName?: string | undefined;
}>;
export type OfflineOrderLine = z.infer<typeof offlineOrderLineSchema>;
export declare const offlineOrderEnvelopeSchema: z.ZodObject<{
    authorizedPayment: z.ZodObject<{
        idempotencyKey: z.ZodString;
        method: z.ZodEnum<["CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
        amountCents: z.ZodNumber;
        nsu: z.ZodString;
        authorizationCode: z.ZodString;
        authorizedAt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        idempotencyKey: string;
        method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountCents: number;
        nsu: string;
        authorizationCode: string;
        authorizedAt: string;
    }, {
        idempotencyKey: string;
        method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountCents: number;
        nsu: string;
        authorizationCode: string;
        authorizedAt: string;
    }>;
    createdAt: z.ZodString;
    contingencyTicket: z.ZodOptional<z.ZodString>;
    printedAt: z.ZodOptional<z.ZodString>;
    confirmedAt: z.ZodOptional<z.ZodString>;
    lines: z.ZodOptional<z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        productName: z.ZodString;
        sizeId: z.ZodOptional<z.ZodString>;
        sizeName: z.ZodOptional<z.ZodString>;
        unitPriceCents: z.ZodNumber;
        quantity: z.ZodNumber;
        additions: z.ZodArray<z.ZodObject<{
            additionId: z.ZodString;
            name: z.ZodString;
            priceCents: z.ZodNumber;
            quantity: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            name: string;
            priceCents: number;
            additionId: string;
            quantity: number;
        }, {
            name: string;
            priceCents: number;
            additionId: string;
            quantity: number;
        }>, "many">;
        notes: z.ZodOptional<z.ZodString>;
        totalCents: z.ZodNumber;
        fiscal: z.ZodObject<{
            ncm: z.ZodString;
            cest: z.ZodDefault<z.ZodString>;
            cfop: z.ZodString;
            origem: z.ZodNumber;
            cstCsosn: z.ZodString;
            aliquotaIcms: z.ZodNumber;
            ibsRate: z.ZodNumber;
            cbsRate: z.ZodNumber;
            aliquotaIbpt: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            ncm: string;
            cest: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
        }, {
            ncm: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
            cest?: string | undefined;
        }>;
    }, "strict", z.ZodTypeAny, {
        additions: {
            name: string;
            priceCents: number;
            additionId: string;
            quantity: number;
        }[];
        fiscal: {
            ncm: string;
            cest: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
        };
        quantity: number;
        productId: string;
        productName: string;
        unitPriceCents: number;
        totalCents: number;
        sizeId?: string | undefined;
        notes?: string | undefined;
        sizeName?: string | undefined;
    }, {
        additions: {
            name: string;
            priceCents: number;
            additionId: string;
            quantity: number;
        }[];
        fiscal: {
            ncm: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
            cest?: string | undefined;
        };
        quantity: number;
        productId: string;
        productName: string;
        unitPriceCents: number;
        totalCents: number;
        sizeId?: string | undefined;
        notes?: string | undefined;
        sizeName?: string | undefined;
    }>, "many">>;
}, "strict", z.ZodTypeAny, {
    authorizedPayment: {
        idempotencyKey: string;
        method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountCents: number;
        nsu: string;
        authorizationCode: string;
        authorizedAt: string;
    };
    createdAt: string;
    contingencyTicket?: string | undefined;
    printedAt?: string | undefined;
    confirmedAt?: string | undefined;
    lines?: {
        additions: {
            name: string;
            priceCents: number;
            additionId: string;
            quantity: number;
        }[];
        fiscal: {
            ncm: string;
            cest: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
        };
        quantity: number;
        productId: string;
        productName: string;
        unitPriceCents: number;
        totalCents: number;
        sizeId?: string | undefined;
        notes?: string | undefined;
        sizeName?: string | undefined;
    }[] | undefined;
}, {
    authorizedPayment: {
        idempotencyKey: string;
        method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountCents: number;
        nsu: string;
        authorizationCode: string;
        authorizedAt: string;
    };
    createdAt: string;
    contingencyTicket?: string | undefined;
    printedAt?: string | undefined;
    confirmedAt?: string | undefined;
    lines?: {
        additions: {
            name: string;
            priceCents: number;
            additionId: string;
            quantity: number;
        }[];
        fiscal: {
            ncm: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
            cest?: string | undefined;
        };
        quantity: number;
        productId: string;
        productName: string;
        unitPriceCents: number;
        totalCents: number;
        sizeId?: string | undefined;
        notes?: string | undefined;
        sizeName?: string | undefined;
    }[] | undefined;
}>;
export type OfflineOrderEnvelope = z.infer<typeof offlineOrderEnvelopeSchema>;
export declare const orderInputSchema: z.ZodEffects<z.ZodObject<{
    idempotencyKey: z.ZodString;
    terminalId: z.ZodString;
    origin: z.ZodEnum<["PDV_ASSISTIDO", "TOTEM"]>;
    items: z.ZodArray<z.ZodEffects<z.ZodObject<{
        productId: z.ZodString;
        sizeId: z.ZodOptional<z.ZodString>;
        quantity: z.ZodNumber;
        additions: z.ZodArray<z.ZodObject<{
            additionId: z.ZodString;
            quantity: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            additionId: string;
            quantity: number;
        }, {
            additionId: string;
            quantity: number;
        }>, "many">;
        notes: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        additions: {
            additionId: string;
            quantity: number;
        }[];
        quantity: number;
        productId: string;
        sizeId?: string | undefined;
        notes?: string | undefined;
    }, {
        additions: {
            additionId: string;
            quantity: number;
        }[];
        quantity: number;
        productId: string;
        sizeId?: string | undefined;
        notes?: string | undefined;
    }>, {
        additions: {
            additionId: string;
            quantity: number;
        }[];
        quantity: number;
        productId: string;
        sizeId?: string | undefined;
        notes?: string | undefined;
    }, {
        additions: {
            additionId: string;
            quantity: number;
        }[];
        quantity: number;
        productId: string;
        sizeId?: string | undefined;
        notes?: string | undefined;
    }>, "many">;
    payment: z.ZodObject<{
        idempotencyKey: z.ZodString;
        method: z.ZodEnum<["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
        amountTenderedCents: z.ZodOptional<z.ZodNumber>;
        terminalTransactionId: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        idempotencyKey: string;
        method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountTenderedCents?: number | undefined;
        terminalTransactionId?: string | undefined;
    }, {
        idempotencyKey: string;
        method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountTenderedCents?: number | undefined;
        terminalTransactionId?: string | undefined;
    }>;
    offline: z.ZodOptional<z.ZodObject<{
        authorizedPayment: z.ZodObject<{
            idempotencyKey: z.ZodString;
            method: z.ZodEnum<["CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
            amountCents: z.ZodNumber;
            nsu: z.ZodString;
            authorizationCode: z.ZodString;
            authorizedAt: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            idempotencyKey: string;
            method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountCents: number;
            nsu: string;
            authorizationCode: string;
            authorizedAt: string;
        }, {
            idempotencyKey: string;
            method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountCents: number;
            nsu: string;
            authorizationCode: string;
            authorizedAt: string;
        }>;
        createdAt: z.ZodString;
        contingencyTicket: z.ZodOptional<z.ZodString>;
        printedAt: z.ZodOptional<z.ZodString>;
        confirmedAt: z.ZodOptional<z.ZodString>;
        lines: z.ZodOptional<z.ZodArray<z.ZodObject<{
            productId: z.ZodString;
            productName: z.ZodString;
            sizeId: z.ZodOptional<z.ZodString>;
            sizeName: z.ZodOptional<z.ZodString>;
            unitPriceCents: z.ZodNumber;
            quantity: z.ZodNumber;
            additions: z.ZodArray<z.ZodObject<{
                additionId: z.ZodString;
                name: z.ZodString;
                priceCents: z.ZodNumber;
                quantity: z.ZodNumber;
            }, "strict", z.ZodTypeAny, {
                name: string;
                priceCents: number;
                additionId: string;
                quantity: number;
            }, {
                name: string;
                priceCents: number;
                additionId: string;
                quantity: number;
            }>, "many">;
            notes: z.ZodOptional<z.ZodString>;
            totalCents: z.ZodNumber;
            fiscal: z.ZodObject<{
                ncm: z.ZodString;
                cest: z.ZodDefault<z.ZodString>;
                cfop: z.ZodString;
                origem: z.ZodNumber;
                cstCsosn: z.ZodString;
                aliquotaIcms: z.ZodNumber;
                ibsRate: z.ZodNumber;
                cbsRate: z.ZodNumber;
                aliquotaIbpt: z.ZodNumber;
            }, "strict", z.ZodTypeAny, {
                ncm: string;
                cest: string;
                cfop: string;
                origem: number;
                cstCsosn: string;
                aliquotaIcms: number;
                ibsRate: number;
                cbsRate: number;
                aliquotaIbpt: number;
            }, {
                ncm: string;
                cfop: string;
                origem: number;
                cstCsosn: string;
                aliquotaIcms: number;
                ibsRate: number;
                cbsRate: number;
                aliquotaIbpt: number;
                cest?: string | undefined;
            }>;
        }, "strict", z.ZodTypeAny, {
            additions: {
                name: string;
                priceCents: number;
                additionId: string;
                quantity: number;
            }[];
            fiscal: {
                ncm: string;
                cest: string;
                cfop: string;
                origem: number;
                cstCsosn: string;
                aliquotaIcms: number;
                ibsRate: number;
                cbsRate: number;
                aliquotaIbpt: number;
            };
            quantity: number;
            productId: string;
            productName: string;
            unitPriceCents: number;
            totalCents: number;
            sizeId?: string | undefined;
            notes?: string | undefined;
            sizeName?: string | undefined;
        }, {
            additions: {
                name: string;
                priceCents: number;
                additionId: string;
                quantity: number;
            }[];
            fiscal: {
                ncm: string;
                cfop: string;
                origem: number;
                cstCsosn: string;
                aliquotaIcms: number;
                ibsRate: number;
                cbsRate: number;
                aliquotaIbpt: number;
                cest?: string | undefined;
            };
            quantity: number;
            productId: string;
            productName: string;
            unitPriceCents: number;
            totalCents: number;
            sizeId?: string | undefined;
            notes?: string | undefined;
            sizeName?: string | undefined;
        }>, "many">>;
    }, "strict", z.ZodTypeAny, {
        authorizedPayment: {
            idempotencyKey: string;
            method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountCents: number;
            nsu: string;
            authorizationCode: string;
            authorizedAt: string;
        };
        createdAt: string;
        contingencyTicket?: string | undefined;
        printedAt?: string | undefined;
        confirmedAt?: string | undefined;
        lines?: {
            additions: {
                name: string;
                priceCents: number;
                additionId: string;
                quantity: number;
            }[];
            fiscal: {
                ncm: string;
                cest: string;
                cfop: string;
                origem: number;
                cstCsosn: string;
                aliquotaIcms: number;
                ibsRate: number;
                cbsRate: number;
                aliquotaIbpt: number;
            };
            quantity: number;
            productId: string;
            productName: string;
            unitPriceCents: number;
            totalCents: number;
            sizeId?: string | undefined;
            notes?: string | undefined;
            sizeName?: string | undefined;
        }[] | undefined;
    }, {
        authorizedPayment: {
            idempotencyKey: string;
            method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountCents: number;
            nsu: string;
            authorizationCode: string;
            authorizedAt: string;
        };
        createdAt: string;
        contingencyTicket?: string | undefined;
        printedAt?: string | undefined;
        confirmedAt?: string | undefined;
        lines?: {
            additions: {
                name: string;
                priceCents: number;
                additionId: string;
                quantity: number;
            }[];
            fiscal: {
                ncm: string;
                cfop: string;
                origem: number;
                cstCsosn: string;
                aliquotaIcms: number;
                ibsRate: number;
                cbsRate: number;
                aliquotaIbpt: number;
                cest?: string | undefined;
            };
            quantity: number;
            productId: string;
            productName: string;
            unitPriceCents: number;
            totalCents: number;
            sizeId?: string | undefined;
            notes?: string | undefined;
            sizeName?: string | undefined;
        }[] | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    idempotencyKey: string;
    terminalId: string;
    origin: "PDV_ASSISTIDO" | "TOTEM";
    items: {
        additions: {
            additionId: string;
            quantity: number;
        }[];
        quantity: number;
        productId: string;
        sizeId?: string | undefined;
        notes?: string | undefined;
    }[];
    payment: {
        idempotencyKey: string;
        method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountTenderedCents?: number | undefined;
        terminalTransactionId?: string | undefined;
    };
    offline?: {
        authorizedPayment: {
            idempotencyKey: string;
            method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountCents: number;
            nsu: string;
            authorizationCode: string;
            authorizedAt: string;
        };
        createdAt: string;
        contingencyTicket?: string | undefined;
        printedAt?: string | undefined;
        confirmedAt?: string | undefined;
        lines?: {
            additions: {
                name: string;
                priceCents: number;
                additionId: string;
                quantity: number;
            }[];
            fiscal: {
                ncm: string;
                cest: string;
                cfop: string;
                origem: number;
                cstCsosn: string;
                aliquotaIcms: number;
                ibsRate: number;
                cbsRate: number;
                aliquotaIbpt: number;
            };
            quantity: number;
            productId: string;
            productName: string;
            unitPriceCents: number;
            totalCents: number;
            sizeId?: string | undefined;
            notes?: string | undefined;
            sizeName?: string | undefined;
        }[] | undefined;
    } | undefined;
}, {
    idempotencyKey: string;
    terminalId: string;
    origin: "PDV_ASSISTIDO" | "TOTEM";
    items: {
        additions: {
            additionId: string;
            quantity: number;
        }[];
        quantity: number;
        productId: string;
        sizeId?: string | undefined;
        notes?: string | undefined;
    }[];
    payment: {
        idempotencyKey: string;
        method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountTenderedCents?: number | undefined;
        terminalTransactionId?: string | undefined;
    };
    offline?: {
        authorizedPayment: {
            idempotencyKey: string;
            method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountCents: number;
            nsu: string;
            authorizationCode: string;
            authorizedAt: string;
        };
        createdAt: string;
        contingencyTicket?: string | undefined;
        printedAt?: string | undefined;
        confirmedAt?: string | undefined;
        lines?: {
            additions: {
                name: string;
                priceCents: number;
                additionId: string;
                quantity: number;
            }[];
            fiscal: {
                ncm: string;
                cfop: string;
                origem: number;
                cstCsosn: string;
                aliquotaIcms: number;
                ibsRate: number;
                cbsRate: number;
                aliquotaIbpt: number;
                cest?: string | undefined;
            };
            quantity: number;
            productId: string;
            productName: string;
            unitPriceCents: number;
            totalCents: number;
            sizeId?: string | undefined;
            notes?: string | undefined;
            sizeName?: string | undefined;
        }[] | undefined;
    } | undefined;
}>, {
    idempotencyKey: string;
    terminalId: string;
    origin: "PDV_ASSISTIDO" | "TOTEM";
    items: {
        additions: {
            additionId: string;
            quantity: number;
        }[];
        quantity: number;
        productId: string;
        sizeId?: string | undefined;
        notes?: string | undefined;
    }[];
    payment: {
        idempotencyKey: string;
        method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountTenderedCents?: number | undefined;
        terminalTransactionId?: string | undefined;
    };
    offline?: {
        authorizedPayment: {
            idempotencyKey: string;
            method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountCents: number;
            nsu: string;
            authorizationCode: string;
            authorizedAt: string;
        };
        createdAt: string;
        contingencyTicket?: string | undefined;
        printedAt?: string | undefined;
        confirmedAt?: string | undefined;
        lines?: {
            additions: {
                name: string;
                priceCents: number;
                additionId: string;
                quantity: number;
            }[];
            fiscal: {
                ncm: string;
                cest: string;
                cfop: string;
                origem: number;
                cstCsosn: string;
                aliquotaIcms: number;
                ibsRate: number;
                cbsRate: number;
                aliquotaIbpt: number;
            };
            quantity: number;
            productId: string;
            productName: string;
            unitPriceCents: number;
            totalCents: number;
            sizeId?: string | undefined;
            notes?: string | undefined;
            sizeName?: string | undefined;
        }[] | undefined;
    } | undefined;
}, {
    idempotencyKey: string;
    terminalId: string;
    origin: "PDV_ASSISTIDO" | "TOTEM";
    items: {
        additions: {
            additionId: string;
            quantity: number;
        }[];
        quantity: number;
        productId: string;
        sizeId?: string | undefined;
        notes?: string | undefined;
    }[];
    payment: {
        idempotencyKey: string;
        method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountTenderedCents?: number | undefined;
        terminalTransactionId?: string | undefined;
    };
    offline?: {
        authorizedPayment: {
            idempotencyKey: string;
            method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountCents: number;
            nsu: string;
            authorizationCode: string;
            authorizedAt: string;
        };
        createdAt: string;
        contingencyTicket?: string | undefined;
        printedAt?: string | undefined;
        confirmedAt?: string | undefined;
        lines?: {
            additions: {
                name: string;
                priceCents: number;
                additionId: string;
                quantity: number;
            }[];
            fiscal: {
                ncm: string;
                cfop: string;
                origem: number;
                cstCsosn: string;
                aliquotaIcms: number;
                ibsRate: number;
                cbsRate: number;
                aliquotaIbpt: number;
                cest?: string | undefined;
            };
            quantity: number;
            productId: string;
            productName: string;
            unitPriceCents: number;
            totalCents: number;
            sizeId?: string | undefined;
            notes?: string | undefined;
            sizeName?: string | undefined;
        }[] | undefined;
    } | undefined;
}>;
export type OrderInput = z.infer<typeof orderInputSchema>;
export interface SelectedAddition {
    additionId: string;
    name: string;
    priceCents: number;
    quantity: number;
}
export interface OrderItem {
    id: string;
    productId: string;
    productName: string;
    sizeId?: string;
    sizeName?: string;
    unitPriceCents: number;
    quantity: number;
    additions: SelectedAddition[];
    notes?: string;
    totalCents: number;
    fiscal: FiscalTaxData;
}
export interface OrderPayment {
    id: string;
    idempotencyKey: string;
    method: PaymentMethod;
    amountCents: number;
    amountTenderedCents?: number;
    changeAmountCents?: number;
    terminalTransactionId?: string;
    authorizationCode?: string;
    nsu?: string;
    status: PaymentState;
    paidAt?: string;
}
export interface OrderDTO {
    id: string;
    idempotencyKey: string;
    publicTicketNumber: string;
    terminalId: string;
    origin: OrderOrigin;
    shiftId: string | null;
    status: OrderStatus;
    items: OrderItem[];
    subtotalCents: number;
    totalCents: number;
    payments: OrderPayment[];
    nfceStatus: NfceStatus;
    offline?: boolean;
    createdAt: string;
    updatedAt: string;
}
export type Order = OrderDTO;
export declare const paymentAuthorizeInputSchema: z.ZodObject<{
    idempotencyKey: z.ZodString;
    terminalId: z.ZodString;
    method: z.ZodEnum<["CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
    amountCents: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    idempotencyKey: string;
    method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
    amountCents: number;
    terminalId: string;
}, {
    idempotencyKey: string;
    method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
    amountCents: number;
    terminalId: string;
}>;
export type PaymentAuthorizeInput = z.infer<typeof paymentAuthorizeInputSchema>;
/** Provider references only. PAN, CVV and PIN never enter this boundary. */
export interface PaymentTransaction {
    id: string;
    idempotencyKey: string;
    terminalId: string;
    method: ElectronicPaymentMethod;
    amountCents: number;
    status: PaymentState;
    version: number;
    nsu?: string;
    authorizationCode?: string;
    orderId?: string;
    failureCode?: string;
    createdAt: string;
    updatedAt: string;
}
export interface CashMovement {
    id: string;
    shiftId: string;
    type: CashMovementType;
    amountCents: number;
    reason: string;
    operatorId: string;
    operatorName?: string;
    authorizedByUserId?: string;
    orderId?: string;
    createdAt: string;
}
/** No system total or reconciliation is exposed for an open shift. */
export interface ShiftSummary {
    id: string;
    terminalId: string;
    terminalName?: string;
    operatorId: string;
    operatorName: string;
    status: 'OPEN' | 'CLOSED';
    initialCashCents: number;
    openedAt: string;
    closedAt?: string;
    movements: CashMovement[];
}
export interface PaymentMethodReconciliation {
    method: PaymentMethod;
    systemCalculatedAmountCents: number;
    operatorDeclaredAmountCents: number;
    differenceCents: number;
}
/** Available only after all declared values have been persisted. */
export interface ShiftReport extends ShiftSummary {
    status: 'CLOSED';
    closedAt: string;
    reconciliations: PaymentMethodReconciliation[];
}
export type Shift = ShiftSummary | ShiftReport;
export declare const shiftOpenInputSchema: z.ZodObject<{
    terminalId: z.ZodString;
    initialCashCents: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    terminalId: string;
    initialCashCents: number;
}, {
    terminalId: string;
    initialCashCents: number;
}>;
export type ShiftOpenInput = z.infer<typeof shiftOpenInputSchema>;
export declare const cashMovementInputSchema: z.ZodObject<{
    idempotencyKey: z.ZodString;
    type: z.ZodEnum<["SUPPLY", "BLEED_SANGRIA"]>;
    amountCents: z.ZodNumber;
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "SUPPLY" | "BLEED_SANGRIA";
    idempotencyKey: string;
    amountCents: number;
    reason: string;
}, {
    type: "SUPPLY" | "BLEED_SANGRIA";
    idempotencyKey: string;
    amountCents: number;
    reason: string;
}>;
export type CashMovementInput = z.infer<typeof cashMovementInputSchema>;
export declare const shiftCloseInputSchema: z.ZodObject<{
    declared: z.ZodObject<{
        CASH: z.ZodNumber;
        CREDIT_CARD: z.ZodNumber;
        DEBIT_CARD: z.ZodNumber;
        PIX: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        CASH: number;
        CREDIT_CARD: number;
        DEBIT_CARD: number;
        PIX: number;
    }, {
        CASH: number;
        CREDIT_CARD: number;
        DEBIT_CARD: number;
        PIX: number;
    }>;
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reason: string;
    declared: {
        CASH: number;
        CREDIT_CARD: number;
        DEBIT_CARD: number;
        PIX: number;
    };
}, {
    reason: string;
    declared: {
        CASH: number;
        CREDIT_CARD: number;
        DEBIT_CARD: number;
        PIX: number;
    };
}>;
export type ShiftCloseInput = z.infer<typeof shiftCloseInputSchema>;
export declare const companyAddressSchema: z.ZodObject<{
    street: z.ZodString;
    number: z.ZodString;
    complement: z.ZodString;
    neighborhood: z.ZodString;
    city: z.ZodString;
    state: z.ZodEnum<["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]>;
    postalCode: z.ZodString;
    ibgeCityCode: z.ZodString;
}, "strict", z.ZodTypeAny, {
    number: string;
    street: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";
    postalCode: string;
    ibgeCityCode: string;
}, {
    number: string;
    street: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";
    postalCode: string;
    ibgeCityCode: string;
}>;
export type CompanyAddress = z.infer<typeof companyAddressSchema>;
export declare const companySettingsInputSchema: z.ZodObject<{
    legalName: z.ZodString;
    tradeName: z.ZodString;
    cnpj: z.ZodString;
    stateRegistration: z.ZodString;
    address: z.ZodObject<{
        street: z.ZodString;
        number: z.ZodString;
        complement: z.ZodString;
        neighborhood: z.ZodString;
        city: z.ZodString;
        state: z.ZodEnum<["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]>;
        postalCode: z.ZodString;
        ibgeCityCode: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        number: string;
        street: string;
        complement: string;
        neighborhood: string;
        city: string;
        state: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";
        postalCode: string;
        ibgeCityCode: string;
    }, {
        number: string;
        street: string;
        complement: string;
        neighborhood: string;
        city: string;
        state: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";
        postalCode: string;
        ibgeCityCode: string;
    }>;
    taxRegime: z.ZodEnum<["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"]>;
    cscId: z.ZodString;
    cscToken: z.ZodOptional<z.ZodString>;
    nfceSeries: z.ZodNumber;
    nextNfceNumber: z.ZodNumber;
    acceptsCashOnPdv: z.ZodBoolean;
    inactivityTimeoutSeconds: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    legalName: string;
    tradeName: string;
    cnpj: string;
    stateRegistration: string;
    address: {
        number: string;
        street: string;
        complement: string;
        neighborhood: string;
        city: string;
        state: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";
        postalCode: string;
        ibgeCityCode: string;
    };
    taxRegime: "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
    cscId: string;
    nfceSeries: number;
    nextNfceNumber: number;
    acceptsCashOnPdv: boolean;
    inactivityTimeoutSeconds: number;
    cscToken?: string | undefined;
}, {
    legalName: string;
    tradeName: string;
    cnpj: string;
    stateRegistration: string;
    address: {
        number: string;
        street: string;
        complement: string;
        neighborhood: string;
        city: string;
        state: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";
        postalCode: string;
        ibgeCityCode: string;
    };
    taxRegime: "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
    cscId: string;
    nfceSeries: number;
    nextNfceNumber: number;
    acceptsCashOnPdv: boolean;
    cscToken?: string | undefined;
    inactivityTimeoutSeconds?: number | undefined;
}>;
export type CompanySettingsInput = z.infer<typeof companySettingsInputSchema>;
/** CSC is write-only; it must not be returned in a read DTO or audit payload. */
export interface CompanySettings extends Omit<CompanySettingsInput, 'cscToken'> {
    cscTokenConfigured: boolean;
    fiscalMode: FiscalMode;
    updatedAt: string;
}
export type KioskStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
export type PrinterStatus = 'READY' | 'OUT_OF_PAPER' | 'ERROR';
export type PinpadStatus = 'CONNECTED' | 'DISCONNECTED';
export interface KioskTerminal {
    id: string;
    name: string;
    type: 'PDV' | 'TOTEM';
    ipAddress?: string;
    appVersion: string;
    status: KioskStatus;
    printerStatus: PrinterStatus;
    pinpadStatus: PinpadStatus;
    maintenanceMessage: string;
    lastHeartbeatAt?: string;
    currentShiftId?: string;
}
export declare const terminalInputSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<["PDV", "TOTEM"]>;
}, "strict", z.ZodTypeAny, {
    type: "TOTEM" | "PDV";
    name: string;
    id: string;
}, {
    type: "TOTEM" | "PDV";
    name: string;
    id: string;
}>;
export declare const heartbeatInputSchema: z.ZodObject<{
    appVersion: z.ZodString;
    printerStatus: z.ZodEnum<["READY", "OUT_OF_PAPER", "ERROR"]>;
    pinpadStatus: z.ZodEnum<["CONNECTED", "DISCONNECTED"]>;
}, "strict", z.ZodTypeAny, {
    appVersion: string;
    printerStatus: "READY" | "OUT_OF_PAPER" | "ERROR";
    pinpadStatus: "CONNECTED" | "DISCONNECTED";
}, {
    appVersion: string;
    printerStatus: "READY" | "OUT_OF_PAPER" | "ERROR";
    pinpadStatus: "CONNECTED" | "DISCONNECTED";
}>;
export type HeartbeatInput = z.infer<typeof heartbeatInputSchema>;
export interface HeartbeatResponse {
    terminalId: string;
    status: KioskStatus;
    maintenanceMessage: string;
    serverTime: string;
    catalogVersion?: string;
}
export declare const maintenanceInputSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    message: z.ZodString;
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    message: string;
    reason: string;
    enabled: boolean;
}, {
    message: string;
    reason: string;
    enabled: boolean;
}>;
export type MaintenanceInput = z.infer<typeof maintenanceInputSchema>;
export type AuditAction = 'ORDER_CANCELLED' | 'PAYMENT_REVERSED' | 'SHIFT_CLOSED' | 'CASH_BLEED' | 'CASH_SUPPLY' | 'PRODUCT_PRICE_CHANGED' | 'KIOSK_MAINTENANCE_TOGGLED' | 'USER_CREATED' | 'USER_UPDATED' | 'COMPANY_SETTINGS_UPDATED' | 'TERMINAL_CREATED';
export interface AuditLog {
    id: string;
    actorUserId: string;
    actorName?: string;
    authorizedByUserId?: string;
    action: AuditAction;
    resourceId: string;
    reason: string;
    before: unknown;
    after: unknown;
    createdAt: string;
}
export type PrintJobStatus = 'QUEUED' | 'CLAIMED' | 'PRINTED' | 'FAILED';
export interface PrintJob {
    id: string;
    terminalId: string;
    orderId?: string;
    shiftId?: string;
    kind: 'ORDER_RECEIPT' | 'KITCHEN_TICKET' | 'SHIFT_REPORT';
    status: PrintJobStatus;
    attempts: number;
    createdAt: string;
    printedAt?: string;
    payload: unknown;
}
export interface FiscalResult {
    orderId: string;
    mode: FiscalMode;
    nfceStatus: NfceStatus;
    processedAt: string;
}
export interface RealtimeEvent {
    id: string;
    type: 'catalog.updated' | 'order.created' | 'order.updated' | 'terminal.updated' | 'shift.updated' | 'print.updated';
    resourceId?: string;
    occurredAt: string;
}
export declare const queueNames: {
    readonly kdsOrders: "kds.orders.queue";
    readonly printJobs: "print.jobs.queue";
    readonly offlineSync: "totem.offline_sync.queue";
    readonly fiscalNfce: "fiscal.nfce.queue";
};
export declare const apiSchemas: {
    LoginInput: z.ZodObject<{
        email: z.ZodString;
        password: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        email: string;
        password: string;
    }, {
        email: string;
        password: string;
    }>;
    SupervisorInput: z.ZodObject<{
        email: z.ZodString;
        pin: z.ZodString;
        action: z.ZodEnum<["ORDER_CANCELLED", "SHIFT_CLOSED", "CASH_BLEED", "CASH_SUPPLY"]>;
        resourceId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        email: string;
        pin: string;
        action: "ORDER_CANCELLED" | "SHIFT_CLOSED" | "CASH_BLEED" | "CASH_SUPPLY";
        resourceId: string;
    }, {
        email: string;
        pin: string;
        action: "ORDER_CANCELLED" | "SHIFT_CLOSED" | "CASH_BLEED" | "CASH_SUPPLY";
        resourceId: string;
    }>;
    UserInput: z.ZodObject<{
        name: z.ZodString;
        email: z.ZodString;
        password: z.ZodString;
        role: z.ZodEnum<["OWNER", "MANAGER", "CASHIER"]>;
        supervisorPin: z.ZodOptional<z.ZodString>;
        active: z.ZodDefault<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        email: string;
        password: string;
        name: string;
        role: "OWNER" | "MANAGER" | "CASHIER";
        active: boolean;
        supervisorPin?: string | undefined;
    }, {
        email: string;
        password: string;
        name: string;
        role: "OWNER" | "MANAGER" | "CASHIER";
        supervisorPin?: string | undefined;
        active?: boolean | undefined;
    }>;
    UserUpdateInput: z.ZodObject<Omit<{
        name: z.ZodString;
        email: z.ZodString;
        password: z.ZodString;
        role: z.ZodEnum<["OWNER", "MANAGER", "CASHIER"]>;
        supervisorPin: z.ZodOptional<z.ZodString>;
        active: z.ZodDefault<z.ZodBoolean>;
    }, "password"> & {
        password: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        email: string;
        name: string;
        role: "OWNER" | "MANAGER" | "CASHIER";
        active: boolean;
        password?: string | undefined;
        supervisorPin?: string | undefined;
    }, {
        email: string;
        name: string;
        role: "OWNER" | "MANAGER" | "CASHIER";
        password?: string | undefined;
        supervisorPin?: string | undefined;
        active?: boolean | undefined;
    }>;
    ProductInput: z.ZodEffects<z.ZodObject<{
        categoryId: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        imageUrl: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        basePriceCents: z.ZodNumber;
        active: z.ZodBoolean;
        availableInKiosk: z.ZodBoolean;
        availableInPdv: z.ZodBoolean;
        sizes: z.ZodArray<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            name: z.ZodString;
            priceModifierCents: z.ZodNumber;
            priceCents: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        }, "strict", z.ZodTypeAny, {
            name: string;
            priceModifierCents: number;
            id?: string | undefined;
            priceCents?: number | null | undefined;
        }, {
            name: string;
            priceModifierCents: number;
            id?: string | undefined;
            priceCents?: number | null | undefined;
        }>, "many">;
        additions: z.ZodArray<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            name: z.ZodString;
            priceCents: z.ZodNumber;
            maxQuantity: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            name: string;
            priceCents: number;
            maxQuantity: number;
            id?: string | undefined;
        }, {
            name: string;
            priceCents: number;
            maxQuantity: number;
            id?: string | undefined;
        }>, "many">;
        fiscal: z.ZodObject<{
            ncm: z.ZodString;
            cest: z.ZodDefault<z.ZodString>;
            cfop: z.ZodString;
            origem: z.ZodNumber;
            cstCsosn: z.ZodString;
            aliquotaIcms: z.ZodNumber;
            ibsRate: z.ZodNumber;
            cbsRate: z.ZodNumber;
            aliquotaIbpt: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            ncm: string;
            cest: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
        }, {
            ncm: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
            cest?: string | undefined;
        }>;
    }, "strict", z.ZodTypeAny, {
        name: string;
        active: boolean;
        categoryId: string;
        description: string;
        imageUrl: string;
        basePriceCents: number;
        availableInKiosk: boolean;
        availableInPdv: boolean;
        sizes: {
            name: string;
            priceModifierCents: number;
            id?: string | undefined;
            priceCents?: number | null | undefined;
        }[];
        additions: {
            name: string;
            priceCents: number;
            maxQuantity: number;
            id?: string | undefined;
        }[];
        fiscal: {
            ncm: string;
            cest: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
        };
    }, {
        name: string;
        active: boolean;
        categoryId: string;
        description: string;
        basePriceCents: number;
        availableInKiosk: boolean;
        availableInPdv: boolean;
        sizes: {
            name: string;
            priceModifierCents: number;
            id?: string | undefined;
            priceCents?: number | null | undefined;
        }[];
        additions: {
            name: string;
            priceCents: number;
            maxQuantity: number;
            id?: string | undefined;
        }[];
        fiscal: {
            ncm: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
            cest?: string | undefined;
        };
        imageUrl?: string | undefined;
    }>, {
        name: string;
        active: boolean;
        categoryId: string;
        description: string;
        imageUrl: string;
        basePriceCents: number;
        availableInKiosk: boolean;
        availableInPdv: boolean;
        sizes: {
            name: string;
            priceModifierCents: number;
            id?: string | undefined;
            priceCents?: number | null | undefined;
        }[];
        additions: {
            name: string;
            priceCents: number;
            maxQuantity: number;
            id?: string | undefined;
        }[];
        fiscal: {
            ncm: string;
            cest: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
        };
    }, {
        name: string;
        active: boolean;
        categoryId: string;
        description: string;
        basePriceCents: number;
        availableInKiosk: boolean;
        availableInPdv: boolean;
        sizes: {
            name: string;
            priceModifierCents: number;
            id?: string | undefined;
            priceCents?: number | null | undefined;
        }[];
        additions: {
            name: string;
            priceCents: number;
            maxQuantity: number;
            id?: string | undefined;
        }[];
        fiscal: {
            ncm: string;
            cfop: string;
            origem: number;
            cstCsosn: string;
            aliquotaIcms: number;
            ibsRate: number;
            cbsRate: number;
            aliquotaIbpt: number;
            cest?: string | undefined;
        };
        imageUrl?: string | undefined;
    }>;
    CategoryInput: z.ZodObject<{
        name: z.ZodString;
        slug: z.ZodString;
        order: z.ZodDefault<z.ZodNumber>;
        active: z.ZodDefault<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        name: string;
        active: boolean;
        slug: string;
        order: number;
    }, {
        name: string;
        slug: string;
        active?: boolean | undefined;
        order?: number | undefined;
    }>;
    OrderInput: z.ZodEffects<z.ZodObject<{
        idempotencyKey: z.ZodString;
        terminalId: z.ZodString;
        origin: z.ZodEnum<["PDV_ASSISTIDO", "TOTEM"]>;
        items: z.ZodArray<z.ZodEffects<z.ZodObject<{
            productId: z.ZodString;
            sizeId: z.ZodOptional<z.ZodString>;
            quantity: z.ZodNumber;
            additions: z.ZodArray<z.ZodObject<{
                additionId: z.ZodString;
                quantity: z.ZodNumber;
            }, "strict", z.ZodTypeAny, {
                additionId: string;
                quantity: number;
            }, {
                additionId: string;
                quantity: number;
            }>, "many">;
            notes: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            additions: {
                additionId: string;
                quantity: number;
            }[];
            quantity: number;
            productId: string;
            sizeId?: string | undefined;
            notes?: string | undefined;
        }, {
            additions: {
                additionId: string;
                quantity: number;
            }[];
            quantity: number;
            productId: string;
            sizeId?: string | undefined;
            notes?: string | undefined;
        }>, {
            additions: {
                additionId: string;
                quantity: number;
            }[];
            quantity: number;
            productId: string;
            sizeId?: string | undefined;
            notes?: string | undefined;
        }, {
            additions: {
                additionId: string;
                quantity: number;
            }[];
            quantity: number;
            productId: string;
            sizeId?: string | undefined;
            notes?: string | undefined;
        }>, "many">;
        payment: z.ZodObject<{
            idempotencyKey: z.ZodString;
            method: z.ZodEnum<["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
            amountTenderedCents: z.ZodOptional<z.ZodNumber>;
            terminalTransactionId: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            idempotencyKey: string;
            method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountTenderedCents?: number | undefined;
            terminalTransactionId?: string | undefined;
        }, {
            idempotencyKey: string;
            method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountTenderedCents?: number | undefined;
            terminalTransactionId?: string | undefined;
        }>;
        offline: z.ZodOptional<z.ZodObject<{
            authorizedPayment: z.ZodObject<{
                idempotencyKey: z.ZodString;
                method: z.ZodEnum<["CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
                amountCents: z.ZodNumber;
                nsu: z.ZodString;
                authorizationCode: z.ZodString;
                authorizedAt: z.ZodString;
            }, "strict", z.ZodTypeAny, {
                idempotencyKey: string;
                method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
                amountCents: number;
                nsu: string;
                authorizationCode: string;
                authorizedAt: string;
            }, {
                idempotencyKey: string;
                method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
                amountCents: number;
                nsu: string;
                authorizationCode: string;
                authorizedAt: string;
            }>;
            createdAt: z.ZodString;
            contingencyTicket: z.ZodOptional<z.ZodString>;
            printedAt: z.ZodOptional<z.ZodString>;
            confirmedAt: z.ZodOptional<z.ZodString>;
            lines: z.ZodOptional<z.ZodArray<z.ZodObject<{
                productId: z.ZodString;
                productName: z.ZodString;
                sizeId: z.ZodOptional<z.ZodString>;
                sizeName: z.ZodOptional<z.ZodString>;
                unitPriceCents: z.ZodNumber;
                quantity: z.ZodNumber;
                additions: z.ZodArray<z.ZodObject<{
                    additionId: z.ZodString;
                    name: z.ZodString;
                    priceCents: z.ZodNumber;
                    quantity: z.ZodNumber;
                }, "strict", z.ZodTypeAny, {
                    name: string;
                    priceCents: number;
                    additionId: string;
                    quantity: number;
                }, {
                    name: string;
                    priceCents: number;
                    additionId: string;
                    quantity: number;
                }>, "many">;
                notes: z.ZodOptional<z.ZodString>;
                totalCents: z.ZodNumber;
                fiscal: z.ZodObject<{
                    ncm: z.ZodString;
                    cest: z.ZodDefault<z.ZodString>;
                    cfop: z.ZodString;
                    origem: z.ZodNumber;
                    cstCsosn: z.ZodString;
                    aliquotaIcms: z.ZodNumber;
                    ibsRate: z.ZodNumber;
                    cbsRate: z.ZodNumber;
                    aliquotaIbpt: z.ZodNumber;
                }, "strict", z.ZodTypeAny, {
                    ncm: string;
                    cest: string;
                    cfop: string;
                    origem: number;
                    cstCsosn: string;
                    aliquotaIcms: number;
                    ibsRate: number;
                    cbsRate: number;
                    aliquotaIbpt: number;
                }, {
                    ncm: string;
                    cfop: string;
                    origem: number;
                    cstCsosn: string;
                    aliquotaIcms: number;
                    ibsRate: number;
                    cbsRate: number;
                    aliquotaIbpt: number;
                    cest?: string | undefined;
                }>;
            }, "strict", z.ZodTypeAny, {
                additions: {
                    name: string;
                    priceCents: number;
                    additionId: string;
                    quantity: number;
                }[];
                fiscal: {
                    ncm: string;
                    cest: string;
                    cfop: string;
                    origem: number;
                    cstCsosn: string;
                    aliquotaIcms: number;
                    ibsRate: number;
                    cbsRate: number;
                    aliquotaIbpt: number;
                };
                quantity: number;
                productId: string;
                productName: string;
                unitPriceCents: number;
                totalCents: number;
                sizeId?: string | undefined;
                notes?: string | undefined;
                sizeName?: string | undefined;
            }, {
                additions: {
                    name: string;
                    priceCents: number;
                    additionId: string;
                    quantity: number;
                }[];
                fiscal: {
                    ncm: string;
                    cfop: string;
                    origem: number;
                    cstCsosn: string;
                    aliquotaIcms: number;
                    ibsRate: number;
                    cbsRate: number;
                    aliquotaIbpt: number;
                    cest?: string | undefined;
                };
                quantity: number;
                productId: string;
                productName: string;
                unitPriceCents: number;
                totalCents: number;
                sizeId?: string | undefined;
                notes?: string | undefined;
                sizeName?: string | undefined;
            }>, "many">>;
        }, "strict", z.ZodTypeAny, {
            authorizedPayment: {
                idempotencyKey: string;
                method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
                amountCents: number;
                nsu: string;
                authorizationCode: string;
                authorizedAt: string;
            };
            createdAt: string;
            contingencyTicket?: string | undefined;
            printedAt?: string | undefined;
            confirmedAt?: string | undefined;
            lines?: {
                additions: {
                    name: string;
                    priceCents: number;
                    additionId: string;
                    quantity: number;
                }[];
                fiscal: {
                    ncm: string;
                    cest: string;
                    cfop: string;
                    origem: number;
                    cstCsosn: string;
                    aliquotaIcms: number;
                    ibsRate: number;
                    cbsRate: number;
                    aliquotaIbpt: number;
                };
                quantity: number;
                productId: string;
                productName: string;
                unitPriceCents: number;
                totalCents: number;
                sizeId?: string | undefined;
                notes?: string | undefined;
                sizeName?: string | undefined;
            }[] | undefined;
        }, {
            authorizedPayment: {
                idempotencyKey: string;
                method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
                amountCents: number;
                nsu: string;
                authorizationCode: string;
                authorizedAt: string;
            };
            createdAt: string;
            contingencyTicket?: string | undefined;
            printedAt?: string | undefined;
            confirmedAt?: string | undefined;
            lines?: {
                additions: {
                    name: string;
                    priceCents: number;
                    additionId: string;
                    quantity: number;
                }[];
                fiscal: {
                    ncm: string;
                    cfop: string;
                    origem: number;
                    cstCsosn: string;
                    aliquotaIcms: number;
                    ibsRate: number;
                    cbsRate: number;
                    aliquotaIbpt: number;
                    cest?: string | undefined;
                };
                quantity: number;
                productId: string;
                productName: string;
                unitPriceCents: number;
                totalCents: number;
                sizeId?: string | undefined;
                notes?: string | undefined;
                sizeName?: string | undefined;
            }[] | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        idempotencyKey: string;
        terminalId: string;
        origin: "PDV_ASSISTIDO" | "TOTEM";
        items: {
            additions: {
                additionId: string;
                quantity: number;
            }[];
            quantity: number;
            productId: string;
            sizeId?: string | undefined;
            notes?: string | undefined;
        }[];
        payment: {
            idempotencyKey: string;
            method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountTenderedCents?: number | undefined;
            terminalTransactionId?: string | undefined;
        };
        offline?: {
            authorizedPayment: {
                idempotencyKey: string;
                method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
                amountCents: number;
                nsu: string;
                authorizationCode: string;
                authorizedAt: string;
            };
            createdAt: string;
            contingencyTicket?: string | undefined;
            printedAt?: string | undefined;
            confirmedAt?: string | undefined;
            lines?: {
                additions: {
                    name: string;
                    priceCents: number;
                    additionId: string;
                    quantity: number;
                }[];
                fiscal: {
                    ncm: string;
                    cest: string;
                    cfop: string;
                    origem: number;
                    cstCsosn: string;
                    aliquotaIcms: number;
                    ibsRate: number;
                    cbsRate: number;
                    aliquotaIbpt: number;
                };
                quantity: number;
                productId: string;
                productName: string;
                unitPriceCents: number;
                totalCents: number;
                sizeId?: string | undefined;
                notes?: string | undefined;
                sizeName?: string | undefined;
            }[] | undefined;
        } | undefined;
    }, {
        idempotencyKey: string;
        terminalId: string;
        origin: "PDV_ASSISTIDO" | "TOTEM";
        items: {
            additions: {
                additionId: string;
                quantity: number;
            }[];
            quantity: number;
            productId: string;
            sizeId?: string | undefined;
            notes?: string | undefined;
        }[];
        payment: {
            idempotencyKey: string;
            method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountTenderedCents?: number | undefined;
            terminalTransactionId?: string | undefined;
        };
        offline?: {
            authorizedPayment: {
                idempotencyKey: string;
                method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
                amountCents: number;
                nsu: string;
                authorizationCode: string;
                authorizedAt: string;
            };
            createdAt: string;
            contingencyTicket?: string | undefined;
            printedAt?: string | undefined;
            confirmedAt?: string | undefined;
            lines?: {
                additions: {
                    name: string;
                    priceCents: number;
                    additionId: string;
                    quantity: number;
                }[];
                fiscal: {
                    ncm: string;
                    cfop: string;
                    origem: number;
                    cstCsosn: string;
                    aliquotaIcms: number;
                    ibsRate: number;
                    cbsRate: number;
                    aliquotaIbpt: number;
                    cest?: string | undefined;
                };
                quantity: number;
                productId: string;
                productName: string;
                unitPriceCents: number;
                totalCents: number;
                sizeId?: string | undefined;
                notes?: string | undefined;
                sizeName?: string | undefined;
            }[] | undefined;
        } | undefined;
    }>, {
        idempotencyKey: string;
        terminalId: string;
        origin: "PDV_ASSISTIDO" | "TOTEM";
        items: {
            additions: {
                additionId: string;
                quantity: number;
            }[];
            quantity: number;
            productId: string;
            sizeId?: string | undefined;
            notes?: string | undefined;
        }[];
        payment: {
            idempotencyKey: string;
            method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountTenderedCents?: number | undefined;
            terminalTransactionId?: string | undefined;
        };
        offline?: {
            authorizedPayment: {
                idempotencyKey: string;
                method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
                amountCents: number;
                nsu: string;
                authorizationCode: string;
                authorizedAt: string;
            };
            createdAt: string;
            contingencyTicket?: string | undefined;
            printedAt?: string | undefined;
            confirmedAt?: string | undefined;
            lines?: {
                additions: {
                    name: string;
                    priceCents: number;
                    additionId: string;
                    quantity: number;
                }[];
                fiscal: {
                    ncm: string;
                    cest: string;
                    cfop: string;
                    origem: number;
                    cstCsosn: string;
                    aliquotaIcms: number;
                    ibsRate: number;
                    cbsRate: number;
                    aliquotaIbpt: number;
                };
                quantity: number;
                productId: string;
                productName: string;
                unitPriceCents: number;
                totalCents: number;
                sizeId?: string | undefined;
                notes?: string | undefined;
                sizeName?: string | undefined;
            }[] | undefined;
        } | undefined;
    }, {
        idempotencyKey: string;
        terminalId: string;
        origin: "PDV_ASSISTIDO" | "TOTEM";
        items: {
            additions: {
                additionId: string;
                quantity: number;
            }[];
            quantity: number;
            productId: string;
            sizeId?: string | undefined;
            notes?: string | undefined;
        }[];
        payment: {
            idempotencyKey: string;
            method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
            amountTenderedCents?: number | undefined;
            terminalTransactionId?: string | undefined;
        };
        offline?: {
            authorizedPayment: {
                idempotencyKey: string;
                method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
                amountCents: number;
                nsu: string;
                authorizationCode: string;
                authorizedAt: string;
            };
            createdAt: string;
            contingencyTicket?: string | undefined;
            printedAt?: string | undefined;
            confirmedAt?: string | undefined;
            lines?: {
                additions: {
                    name: string;
                    priceCents: number;
                    additionId: string;
                    quantity: number;
                }[];
                fiscal: {
                    ncm: string;
                    cfop: string;
                    origem: number;
                    cstCsosn: string;
                    aliquotaIcms: number;
                    ibsRate: number;
                    cbsRate: number;
                    aliquotaIbpt: number;
                    cest?: string | undefined;
                };
                quantity: number;
                productId: string;
                productName: string;
                unitPriceCents: number;
                totalCents: number;
                sizeId?: string | undefined;
                notes?: string | undefined;
                sizeName?: string | undefined;
            }[] | undefined;
        } | undefined;
    }>;
    PaymentAuthorizeInput: z.ZodObject<{
        idempotencyKey: z.ZodString;
        terminalId: z.ZodString;
        method: z.ZodEnum<["CREDIT_CARD", "DEBIT_CARD", "PIX"]>;
        amountCents: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        idempotencyKey: string;
        method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountCents: number;
        terminalId: string;
    }, {
        idempotencyKey: string;
        method: "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
        amountCents: number;
        terminalId: string;
    }>;
    ShiftOpenInput: z.ZodObject<{
        terminalId: z.ZodString;
        initialCashCents: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        terminalId: string;
        initialCashCents: number;
    }, {
        terminalId: string;
        initialCashCents: number;
    }>;
    CashMovementInput: z.ZodObject<{
        idempotencyKey: z.ZodString;
        type: z.ZodEnum<["SUPPLY", "BLEED_SANGRIA"]>;
        amountCents: z.ZodNumber;
        reason: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "SUPPLY" | "BLEED_SANGRIA";
        idempotencyKey: string;
        amountCents: number;
        reason: string;
    }, {
        type: "SUPPLY" | "BLEED_SANGRIA";
        idempotencyKey: string;
        amountCents: number;
        reason: string;
    }>;
    ShiftCloseInput: z.ZodObject<{
        declared: z.ZodObject<{
            CASH: z.ZodNumber;
            CREDIT_CARD: z.ZodNumber;
            DEBIT_CARD: z.ZodNumber;
            PIX: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            CASH: number;
            CREDIT_CARD: number;
            DEBIT_CARD: number;
            PIX: number;
        }, {
            CASH: number;
            CREDIT_CARD: number;
            DEBIT_CARD: number;
            PIX: number;
        }>;
        reason: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        reason: string;
        declared: {
            CASH: number;
            CREDIT_CARD: number;
            DEBIT_CARD: number;
            PIX: number;
        };
    }, {
        reason: string;
        declared: {
            CASH: number;
            CREDIT_CARD: number;
            DEBIT_CARD: number;
            PIX: number;
        };
    }>;
    CompanySettingsInput: z.ZodObject<{
        legalName: z.ZodString;
        tradeName: z.ZodString;
        cnpj: z.ZodString;
        stateRegistration: z.ZodString;
        address: z.ZodObject<{
            street: z.ZodString;
            number: z.ZodString;
            complement: z.ZodString;
            neighborhood: z.ZodString;
            city: z.ZodString;
            state: z.ZodEnum<["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]>;
            postalCode: z.ZodString;
            ibgeCityCode: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            number: string;
            street: string;
            complement: string;
            neighborhood: string;
            city: string;
            state: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";
            postalCode: string;
            ibgeCityCode: string;
        }, {
            number: string;
            street: string;
            complement: string;
            neighborhood: string;
            city: string;
            state: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";
            postalCode: string;
            ibgeCityCode: string;
        }>;
        taxRegime: z.ZodEnum<["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"]>;
        cscId: z.ZodString;
        cscToken: z.ZodOptional<z.ZodString>;
        nfceSeries: z.ZodNumber;
        nextNfceNumber: z.ZodNumber;
        acceptsCashOnPdv: z.ZodBoolean;
        inactivityTimeoutSeconds: z.ZodDefault<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        legalName: string;
        tradeName: string;
        cnpj: string;
        stateRegistration: string;
        address: {
            number: string;
            street: string;
            complement: string;
            neighborhood: string;
            city: string;
            state: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";
            postalCode: string;
            ibgeCityCode: string;
        };
        taxRegime: "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
        cscId: string;
        nfceSeries: number;
        nextNfceNumber: number;
        acceptsCashOnPdv: boolean;
        inactivityTimeoutSeconds: number;
        cscToken?: string | undefined;
    }, {
        legalName: string;
        tradeName: string;
        cnpj: string;
        stateRegistration: string;
        address: {
            number: string;
            street: string;
            complement: string;
            neighborhood: string;
            city: string;
            state: "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";
            postalCode: string;
            ibgeCityCode: string;
        };
        taxRegime: "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
        cscId: string;
        nfceSeries: number;
        nextNfceNumber: number;
        acceptsCashOnPdv: boolean;
        cscToken?: string | undefined;
        inactivityTimeoutSeconds?: number | undefined;
    }>;
    TerminalInput: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        type: z.ZodEnum<["PDV", "TOTEM"]>;
    }, "strict", z.ZodTypeAny, {
        type: "TOTEM" | "PDV";
        name: string;
        id: string;
    }, {
        type: "TOTEM" | "PDV";
        name: string;
        id: string;
    }>;
    HeartbeatInput: z.ZodObject<{
        appVersion: z.ZodString;
        printerStatus: z.ZodEnum<["READY", "OUT_OF_PAPER", "ERROR"]>;
        pinpadStatus: z.ZodEnum<["CONNECTED", "DISCONNECTED"]>;
    }, "strict", z.ZodTypeAny, {
        appVersion: string;
        printerStatus: "READY" | "OUT_OF_PAPER" | "ERROR";
        pinpadStatus: "CONNECTED" | "DISCONNECTED";
    }, {
        appVersion: string;
        printerStatus: "READY" | "OUT_OF_PAPER" | "ERROR";
        pinpadStatus: "CONNECTED" | "DISCONNECTED";
    }>;
    MaintenanceInput: z.ZodObject<{
        enabled: z.ZodBoolean;
        message: z.ZodString;
        reason: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        message: string;
        reason: string;
        enabled: boolean;
    }, {
        message: string;
        reason: string;
        enabled: boolean;
    }>;
};
