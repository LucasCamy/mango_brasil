import { fiscalModeSchema } from '@totem-pdv/shared-types';
/** No certificate, XML, access key or authorization is fabricated by this adapter. */
export class SandboxFiscalAdapter {
    now;
    mode;
    constructor(mode = 'disabled', now = () => new Date()) {
        this.now = now;
        this.mode = fiscalModeSchema.parse(mode);
    }
    async process(order, context = {}) {
        context.signal?.throwIfAborted();
        if (order.id.length === 0 || order.idempotencyKey.length === 0)
            throw new TypeError('Pedido fiscal exige identificador e chave de idempotência.');
        return {
            orderId: order.id,
            mode: this.mode,
            nfceStatus: this.mode === 'sandbox' ? 'SIMULATED' : 'NOT_EMITTED',
            processedAt: this.now().toISOString(),
        };
    }
}
