import { type PaymentAuthorizeInput, type PaymentState, type PaymentTransaction } from '@totem-pdv/shared-types';
export type { PaymentAuthorizeInput, PaymentTransaction, PaymentState } from '@totem-pdv/shared-types';
/** Implementations MUST use durable storage, a unique idempotency key and atomic CAS. */
export interface PaymentTransactionStore {
    get(id: string): Promise<PaymentTransaction | undefined>;
    findByIdempotencyKey(key: string): Promise<PaymentTransaction | undefined>;
    /** Insert-or-return-existing, atomically protected by the unique idempotency key. */
    create(transaction: PaymentTransaction): Promise<PaymentTransaction>;
    /** Match both expectedStatus AND stored version === transaction.version - 1. */
    update(transaction: PaymentTransaction, expectedStatus: PaymentState): Promise<PaymentTransaction>;
    listPending(): Promise<PaymentTransaction[]>;
}
export type PaymentGatewayErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'INVALID_STATE' | 'AUTHORIZATION_FAILED' | 'CONFIRMATION_FAILED' | 'REVERSAL_FAILED' | 'ABORTED' | 'TIMEOUT';
export declare class PaymentGatewayError extends Error {
    readonly code: PaymentGatewayErrorCode;
    constructor(code: PaymentGatewayErrorCode, message: string);
}
export interface PaymentProgressEvent {
    transactionId: string;
    status: PaymentState;
    message: string;
}
export interface PaymentOperationContext {
    signal?: AbortSignal;
    timeoutMs?: number;
    /** Observers do not change the provider state and must not receive card credentials. */
    onProgress?: (event: PaymentProgressEvent) => void;
}
export type OrphanDecision = {
    kind: 'confirm';
    orderId: string;
} | {
    kind: 'reverse';
} | {
    kind: 'defer';
};
export interface OrphanResolutionReport {
    confirmed: number;
    reversed: number;
    deferred: number;
    failed: string[];
}
export interface IPaymentTerminalGateway {
    authorize(input: PaymentAuthorizeInput, context?: PaymentOperationContext): Promise<PaymentTransaction>;
    confirm(transactionId: string, context?: PaymentOperationContext): Promise<PaymentTransaction>;
    reverse(transactionId: string, context?: PaymentOperationContext): Promise<PaymentTransaction>;
    /** The caller checks a durable order AND receipt before deciding to confirm. */
    resolveOrphanPendencies(resolveCommittedOrder: (transaction: PaymentTransaction) => Promise<OrphanDecision>, context?: PaymentOperationContext): Promise<OrphanResolutionReport>;
}
export interface SimulatedPinpadOptions {
    stepDelayMs?: number;
    timeoutMs?: number;
    /** Pending operations younger than this remain available to their running owner. */
    orphanGracePeriodMs?: number;
    failAuthorization?: boolean;
    failConfirmation?: boolean;
    failReversal?: boolean;
    now?: () => Date;
}
/** Sandbox provider with full 2PC semantics. There is deliberately no default store. */
export declare class SimulatedPinpadAdapter implements IPaymentTerminalGateway {
    private readonly store;
    private readonly options;
    private readonly stepDelayMs;
    private readonly timeoutMs;
    private readonly orphanGracePeriodMs;
    private readonly now;
    constructor(store: PaymentTransactionStore, options?: SimulatedPinpadOptions);
    authorize(input: PaymentAuthorizeInput, context?: PaymentOperationContext): Promise<PaymentTransaction>;
    confirm(transactionId: string, context?: PaymentOperationContext): Promise<PaymentTransaction>;
    reverse(transactionId: string, context?: PaymentOperationContext): Promise<PaymentTransaction>;
    resolveOrphanPendencies(resolveCommittedOrder: (transaction: PaymentTransaction) => Promise<OrphanDecision>, context?: PaymentOperationContext): Promise<OrphanResolutionReport>;
    private assertSameRequest;
    private required;
    private transition;
    private transitionOrReplay;
    private notify;
    private operation;
}
