import { type FiscalMode, type FiscalResult } from '@totem-pdv/shared-types';
export interface FiscalOrder {
    id: string;
    idempotencyKey: string;
}
export interface FiscalOperationContext {
    signal?: AbortSignal;
}
/** A real adapter must validate the signed XML against the applicable SEFAZ XSD. */
export interface IFiscalGateway {
    process(order: FiscalOrder, context?: FiscalOperationContext): Promise<FiscalResult>;
}
/** No certificate, XML, access key or authorization is fabricated by this adapter. */
export declare class SandboxFiscalAdapter implements IFiscalGateway {
    private readonly now;
    readonly mode: FiscalMode;
    constructor(mode?: FiscalMode, now?: () => Date);
    process(order: FiscalOrder, context?: FiscalOperationContext): Promise<FiscalResult>;
}
