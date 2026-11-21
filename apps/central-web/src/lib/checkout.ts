import {
  uuidV7,
  type ElectronicPaymentMethod,
  type OrderDTO,
  type OrderInput,
  type PaymentMethod,
} from "@totem-pdv/shared-types";
import { ApiError } from "./api";
import { central } from "./services";

export interface CheckoutAttempt {
  actorId: string;
  orderKey: string;
  paymentKey: string;
  terminalId: string;
  method: PaymentMethod;
  amountCents: number;
  amountTenderedCents?: number;
  items: OrderInput["items"];
  transactionId?: string;
  createdAt: string;
}
const storageKey = (actorId: string) => `central-checkout:${actorId}`;
export function rememberAttempt(attempt: CheckoutAttempt): void {
  // This must succeed before any authorization is requested.
  localStorage.setItem(storageKey(attempt.actorId), JSON.stringify(attempt));
}
export function pendingAttempt(actorId: string): CheckoutAttempt | null {
  const value = localStorage.getItem(storageKey(actorId));
  if (!value) return null;
  try {
    const attempt = JSON.parse(value) as CheckoutAttempt;
    return attempt.actorId === actorId &&
      typeof attempt.orderKey === "string" &&
      Array.isArray(attempt.items)
      ? attempt
      : null;
  } catch {
    throw new Error(
      "A tentativa de pagamento salva está ilegível. Solicite conferência ao supervisor antes de iniciar outra venda.",
    );
  }
}
export function forgetAttempt(actorId: string) {
  localStorage.removeItem(storageKey(actorId));
}
export function newAttempt(
  input: Omit<CheckoutAttempt, "orderKey" | "paymentKey" | "createdAt">,
): CheckoutAttempt {
  if (pendingAttempt(input.actorId))
    throw new Error(
      "Já existe uma tentativa deste operador. Retome a venda preservada antes de iniciar outra.",
    );
  const attempt = {
    ...input,
    orderKey: uuidV7(),
    paymentKey: uuidV7(),
    createdAt: new Date().toISOString(),
  };
  rememberAttempt(attempt);
  return attempt;
}

/** Persisted intent survives reloads; all retries reuse authorization and order keys. */
export async function submitAttempt(
  attempt: CheckoutAttempt,
  onStep: (step: string) => void,
): Promise<OrderDTO> {
  rememberAttempt(attempt);
  // A previous POST may have committed after the browser timed out.
  onStep("Conferindo tentativa anterior");
  try {
    const existing = await central.orderByKey(attempt.orderKey);
    forgetAttempt(attempt.actorId);
    return existing;
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.problem.status === 404))
      throw cause;
  }
  if (attempt.method !== "CASH" && !attempt.transactionId) {
    onStep("Aguardando autorização do pinpad simulado");
    const payment = await central.authorize({
      idempotencyKey: attempt.paymentKey,
      terminalId: attempt.terminalId,
      method: attempt.method as ElectronicPaymentMethod,
      amountCents: attempt.amountCents,
    });
    attempt.transactionId = payment.id;
    rememberAttempt(attempt);
    if (payment.status !== "AUTHORIZED")
      throw new Error(
        `Pagamento em estado ${payment.status}. Solicite conferência antes de tentar outra venda.`,
      );
  }
  onStep("Gravando pedido e solicitando impressão");
  const order = await central.createOrder({
    idempotencyKey: attempt.orderKey,
    terminalId: attempt.terminalId,
    origin: "PDV_ASSISTIDO",
    items: attempt.items,
    expectedTotalCents: attempt.amountCents,
    payment: {
      idempotencyKey: attempt.paymentKey,
      method: attempt.method,
      ...(attempt.method === "CASH"
        ? { amountTenderedCents: attempt.amountTenderedCents }
        : { terminalTransactionId: attempt.transactionId }),
    },
  });
  forgetAttempt(attempt.actorId);
  return order;
}

export async function abandonAttempt(
  attempt: CheckoutAttempt,
): Promise<OrderDTO | null> {
  // Never reverse solely because of a network error.
  try {
    const order = await central.orderByKey(attempt.orderKey);
    forgetAttempt(attempt.actorId);
    return order;
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.problem.status === 404))
      throw cause;
  }
  if (attempt.method !== "CASH") {
    // An interrupted authorize call may have completed; retrieve by the original key.
    const payment = attempt.transactionId
      ? null
      : await central.authorize({
          idempotencyKey: attempt.paymentKey,
          terminalId: attempt.terminalId,
          method: attempt.method as ElectronicPaymentMethod,
          amountCents: attempt.amountCents,
        });
    const transactionId = attempt.transactionId ?? payment?.id;
    if (!transactionId)
      throw new Error(
        "Não foi possível localizar a autorização para desfazimento.",
      );
    await central.reverseAuthorization(
      transactionId,
      "Desistência do checkout antes da gravação do pedido",
    );
  }
  forgetAttempt(attempt.actorId);
  return null;
}
