import { paymentAuthorizeInputSchema, uuidV7, } from '@totem-pdv/shared-types';
export class PaymentGatewayError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'PaymentGatewayError';
        this.code = code;
    }
}
const progressMessages = {
    INITIALIZING: 'Inicializando o terminal simulado',
    WAITING_CARD_OR_QR: 'Aproxime o cartão ou leia o QR Code Pix simulado',
    PROCESSING: 'Processando o pagamento simulado',
    AUTHORIZED: 'Pagamento autorizado. Aguardando gravação e impressão do pedido',
    CONFIRMED: 'Pagamento confirmado',
    REVERSED: 'Pagamento desfeito',
    FAILED: 'Pagamento não autorizado',
};
function checkAbort(signal) {
    if (signal.aborted) {
        throw signal.reason instanceof PaymentGatewayError
            ? signal.reason
            : new PaymentGatewayError('ABORTED', 'Operação de pagamento interrompida.');
    }
}
function delay(milliseconds, signal) {
    checkAbort(signal);
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            try {
                checkAbort(signal);
            }
            catch (error) {
                reject(error);
            }
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, milliseconds);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
async function interruptible(operation, signal) {
    checkAbort(signal);
    return await new Promise((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            try {
                checkAbort(signal);
            }
            catch (error) {
                reject(error);
            }
        };
        signal.addEventListener('abort', onAbort, { once: true });
        operation.then((result) => {
            signal.removeEventListener('abort', onAbort);
            resolve(result);
        }, (error) => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}
function randomDigits(length) {
    // Rejection sampling avoids modulo bias while keeping provider references numeric.
    const digits = [];
    while (digits.length < length) {
        for (const byte of globalThis.crypto.getRandomValues(new Uint8Array(length))) {
            if (byte < 250)
                digits.push(String(byte % 10));
            if (digits.length === length)
                break;
        }
    }
    return digits.join('');
}
/** Sandbox provider with full 2PC semantics. There is deliberately no default store. */
export class SimulatedPinpadAdapter {
    store;
    options;
    stepDelayMs;
    timeoutMs;
    orphanGracePeriodMs;
    now;
    constructor(store, options = {}) {
        this.store = store;
        this.options = options;
        this.stepDelayMs = options.stepDelayMs ?? 350;
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.orphanGracePeriodMs = options.orphanGracePeriodMs ?? 30_000;
        this.now = options.now ?? (() => new Date());
        if (!Number.isFinite(this.stepDelayMs) || this.stepDelayMs < 0 || !Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || !Number.isFinite(this.orphanGracePeriodMs) || this.orphanGracePeriodMs < 0) {
            throw new RangeError('Os tempos do terminal devem ser finitos e não negativos.');
        }
    }
    async authorize(input, context = {}) {
        const parsed = paymentAuthorizeInputSchema.parse(input);
        return await this.operation(context, async (signal) => {
            const existing = await interruptible(this.store.findByIdempotencyKey(parsed.idempotencyKey), signal);
            checkAbort(signal);
            const now = this.now().toISOString();
            const transaction = existing ?? await interruptible(this.store.create({
                ...parsed, id: uuidV7(this.now().getTime()), status: 'INITIALIZING', version: 0, createdAt: now, updatedAt: now,
            }), signal);
            checkAbort(signal);
            this.assertSameRequest(transaction, parsed);
            if (transaction.status !== 'INITIALIZING')
                return transaction;
            this.notify(transaction, context);
            let current;
            try {
                // Only one replica claims INITIALIZING; retries never call the provider twice.
                current = await this.transition(transaction, 'WAITING_CARD_OR_QR', signal);
            }
            catch (error) {
                if (error instanceof PaymentGatewayError && error.code === 'CONFLICT') {
                    const claimed = await interruptible(this.store.get(transaction.id), signal);
                    if (claimed)
                        return claimed;
                }
                throw error;
            }
            this.notify(current, context);
            await delay(this.stepDelayMs, signal);
            current = await this.transition(current, 'PROCESSING', signal);
            this.notify(current, context);
            await delay(this.stepDelayMs, signal);
            current = this.options.failAuthorization
                ? await this.transition(current, 'FAILED', signal, { failureCode: 'SIMULATED_DECLINE' })
                : await this.transition(current, 'AUTHORIZED', signal, { nsu: randomDigits(12), authorizationCode: randomDigits(6) });
            this.notify(current, context);
            return current;
        });
    }
    async confirm(transactionId, context = {}) {
        return await this.operation(context, async (signal) => {
            const transaction = await this.required(transactionId, signal);
            if (transaction.status === 'CONFIRMED')
                return transaction;
            if (transaction.status !== 'AUTHORIZED')
                throw new PaymentGatewayError('INVALID_STATE', 'Apenas um pagamento autorizado pode ser confirmado.');
            if (this.options.failConfirmation)
                throw new PaymentGatewayError('CONFIRMATION_FAILED', 'Confirmação simulada indisponível. A pendência permanece recuperável.');
            await delay(this.stepDelayMs, signal);
            const result = await this.transitionOrReplay(transaction, 'CONFIRMED', signal);
            this.notify(result, context);
            return result;
        });
    }
    async reverse(transactionId, context = {}) {
        return await this.operation(context, async (signal) => {
            const transaction = await this.required(transactionId, signal);
            if (transaction.status === 'REVERSED')
                return transaction;
            if (transaction.status === 'FAILED')
                throw new PaymentGatewayError('INVALID_STATE', 'Um pagamento recusado não possui autorização para desfazer.');
            if (this.options.failReversal)
                throw new PaymentGatewayError('REVERSAL_FAILED', 'Desfazimento simulado indisponível. A pendência permanece recuperável.');
            await delay(this.stepDelayMs, signal);
            const result = await this.transitionOrReplay(transaction, 'REVERSED', signal);
            this.notify(result, context);
            return result;
        });
    }
    async resolveOrphanPendencies(resolveCommittedOrder, context = {}) {
        return await this.operation(context, async (signal) => {
            const report = { confirmed: 0, reversed: 0, deferred: 0, failed: [] };
            const transactions = await interruptible(this.store.listPending(), signal);
            for (const transaction of transactions) {
                checkAbort(signal);
                // listPending must exclude settled payments; also defend against stale stores.
                if (['CONFIRMED', 'REVERSED', 'FAILED'].includes(transaction.status))
                    continue;
                if (this.now().getTime() - Date.parse(transaction.updatedAt) < this.orphanGracePeriodMs) {
                    report.deferred += 1;
                    continue;
                }
                try {
                    const decision = await interruptible(resolveCommittedOrder(transaction), signal);
                    if (decision.kind === 'defer') {
                        report.deferred += 1;
                    }
                    else if (decision.kind === 'confirm') {
                        if (transaction.status !== 'AUTHORIZED' || decision.orderId.length === 0) {
                            report.failed.push(transaction.id);
                            continue;
                        }
                        await this.confirm(transaction.id, { ...context, signal });
                        report.confirmed += 1;
                    }
                    else {
                        await this.reverse(transaction.id, { ...context, signal });
                        report.reversed += 1;
                    }
                }
                catch (error) {
                    checkAbort(signal);
                    report.failed.push(transaction.id);
                }
            }
            return report;
        });
    }
    assertSameRequest(transaction, input) {
        if (transaction.idempotencyKey !== input.idempotencyKey || transaction.terminalId !== input.terminalId || transaction.method !== input.method || transaction.amountCents !== input.amountCents) {
            throw new PaymentGatewayError('IDEMPOTENCY_CONFLICT', 'A chave de idempotência já está vinculada a outro pagamento.');
        }
    }
    async required(id, signal) {
        const transaction = await interruptible(this.store.get(id), signal);
        checkAbort(signal);
        if (!transaction)
            throw new PaymentGatewayError('NOT_FOUND', 'Pagamento não encontrado.');
        return transaction;
    }
    async transition(transaction, status, signal, extra = {}) {
        checkAbort(signal);
        return await interruptible(this.store.update({ ...transaction, ...extra, status, version: transaction.version + 1, updatedAt: this.now().toISOString() }, transaction.status), signal);
    }
    async transitionOrReplay(transaction, status, signal) {
        try {
            return await this.transition(transaction, status, signal);
        }
        catch (error) {
            if (error instanceof PaymentGatewayError && error.code === 'CONFLICT') {
                const settled = await this.required(transaction.id, signal);
                if (settled.status === status)
                    return settled;
            }
            throw error;
        }
    }
    notify(transaction, context) {
        try {
            context.onProgress?.({ transactionId: transaction.id, status: transaction.status, message: progressMessages[transaction.status] });
        }
        catch {
            // A broken UI observer must never change a provider-side financial result.
        }
    }
    async operation(context, execute) {
        const timeoutMs = context.timeoutMs ?? this.timeoutMs;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
            throw new RangeError('timeoutMs deve ser positivo e finito.');
        const controller = new AbortController();
        const onAbort = () => controller.abort(new PaymentGatewayError('ABORTED', 'Operação de pagamento interrompida.'));
        const timer = setTimeout(() => controller.abort(new PaymentGatewayError('TIMEOUT', 'O terminal excedeu o tempo limite. A pendência será conciliada.')), timeoutMs);
        context.signal?.addEventListener('abort', onAbort, { once: true });
        if (context.signal?.aborted)
            onAbort();
        try {
            checkAbort(controller.signal);
            return await execute(controller.signal);
        }
        finally {
            clearTimeout(timer);
            context.signal?.removeEventListener('abort', onAbort);
        }
    }
}
