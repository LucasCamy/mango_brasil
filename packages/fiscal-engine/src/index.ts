import { fiscalModeSchema, type FiscalMode, type FiscalResult } from '@totem-pdv/shared-types';

export interface FiscalOrder {
  id: string;
  idempotencyKey: string;
}

export interface FiscalOperationContext { signal?: AbortSignal }

/** A real adapter must validate the signed XML against the applicable SEFAZ XSD. */
export interface IFiscalGateway {
  process(order: FiscalOrder, context?: FiscalOperationContext): Promise<FiscalResult>;
}

/** No certificate, XML, access key or authorization is fabricated by this adapter. */
export class SandboxFiscalAdapter implements IFiscalGateway {
  readonly mode: FiscalMode;

  constructor(mode: FiscalMode = 'disabled', private readonly now: () => Date = () => new Date()) {
    this.mode = fiscalModeSchema.parse(mode);
  }

  async process(order: FiscalOrder, context: FiscalOperationContext = {}): Promise<FiscalResult> {
    context.signal?.throwIfAborted();
    if (order.id.length === 0 || order.idempotencyKey.length === 0) throw new TypeError('Pedido fiscal exige identificador e chave de idempotência.');
    return {
      orderId: order.id,
      mode: this.mode,
      nfceStatus: this.mode === 'sandbox' ? 'SIMULATED' : 'NOT_EMITTED',
      processedAt: this.now().toISOString(),
    };
  }
}
