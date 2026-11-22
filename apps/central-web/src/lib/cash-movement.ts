import {
  cashMovementInputSchema,
  uuidV7,
  type CashMovement,
  type CashMovementInput,
  type SupervisorInput,
} from "@totem-pdv/shared-types";
import { ApiError, post } from "./api";

export interface CashMovementIntent {
  version: 1;
  actorId: string;
  shiftId: string;
  terminalId: string;
  terminalName: string;
  createdAt: string;
  payload: CashMovementInput;
}
const prefix = (actorId: string) =>
  `central-cash-movement:${encodeURIComponent(actorId)}:`;
const storageKey = (intent: Pick<CashMovementIntent, "actorId" | "shiftId">) =>
  `${prefix(intent.actorId)}${encodeURIComponent(intent.shiftId)}`;

/** Includes closed shifts: an uncertain POST must be reconciled before another movement. */
export function pendingCashMovement(
  actorId: string,
): CashMovementIntent | null {
  const pending: CashMovementIntent[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix(actorId))) continue;
    try {
      const saved = JSON.parse(
        localStorage.getItem(key) ?? "null",
      ) as CashMovementIntent | null;
      if (
        !saved ||
        saved.version !== 1 ||
        saved.actorId !== actorId ||
        typeof saved.shiftId !== "string" ||
        !saved.shiftId ||
        typeof saved.terminalId !== "string" ||
        typeof saved.terminalName !== "string" ||
        !Number.isFinite(Date.parse(saved.createdAt))
      )
        throw new Error("Invalid saved movement");
      const payload = cashMovementInputSchema.parse(saved.payload);
      if (storageKey(saved) !== key) throw new Error("Invalid movement key");
      pending.push({
        version: 1,
        actorId,
        shiftId: saved.shiftId,
        terminalId: saved.terminalId,
        terminalName: saved.terminalName,
        createdAt: saved.createdAt,
        payload,
      });
    } catch {
      throw new Error(
        "A movimentação preservada está ilegível. Solicite conferência ao supervisor antes de registrar outro movimento.",
      );
    }
  }
  return (
    pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null
  );
}

function persist(intent: CashMovementIntent) {
  const pending = pendingCashMovement(intent.actorId);
  if (
    pending &&
    (pending.payload.idempotencyKey !== intent.payload.idempotencyKey ||
      pending.shiftId !== intent.shiftId ||
      JSON.stringify(pending.payload) !== JSON.stringify(intent.payload))
  ) {
    throw new Error("Confira a movimentação anterior antes de iniciar outra.");
  }
  // Failure here prevents both PIN authorization and the financial request.
  localStorage.setItem(storageKey(intent), JSON.stringify(intent));
}

export function beginCashMovement(
  input: Omit<CashMovementIntent, "version" | "createdAt" | "payload"> &
    Omit<CashMovementInput, "idempotencyKey">,
): CashMovementIntent {
  if (pendingCashMovement(input.actorId))
    throw new Error("Confira a movimentação anterior antes de iniciar outra.");
  const payload = cashMovementInputSchema.parse({
    idempotencyKey: uuidV7(),
    type: input.type,
    amountCents: input.amountCents,
    reason: input.reason,
  });
  const intent: CashMovementIntent = {
    version: 1,
    actorId: input.actorId,
    shiftId: input.shiftId,
    terminalId: input.terminalId,
    terminalName: input.terminalName,
    createdAt: new Date().toISOString(),
    payload,
  };
  persist(intent);
  return intent;
}

export async function submitCashMovement(
  intent: CashMovementIntent,
  authorize: (
    action: SupervisorInput["action"],
    resourceId: string,
  ) => Promise<string>,
): Promise<CashMovement> {
  persist(intent);
  // Tokens and PINs never enter storage. Every recovery requests a fresh grant.
  const token = await authorize(
    intent.payload.type === "SUPPLY" ? "CASH_SUPPLY" : "CASH_BLEED",
    intent.shiftId,
  );
  try {
    const result = await post<CashMovement>(
      `/shifts/${encodeURIComponent(intent.shiftId)}/movements`,
      intent.payload,
      token,
    );
    localStorage.removeItem(storageKey(intent));
    return result;
  } catch (cause) {
    // These business responses follow the server's idempotency lookup. Auth,
    // request timeouts, rate limits, network failures and 5xx remain uncertain.
    if (
      cause instanceof ApiError &&
      [400, 404, 409, 422].includes(cause.problem.status)
    )
      localStorage.removeItem(storageKey(intent));
    throw cause;
  }
}
