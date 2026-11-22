import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CashMovement } from "@totem-pdv/shared-types";
import { ApiError, post } from "./api";
import {
  beginCashMovement,
  pendingCashMovement,
  submitCashMovement,
} from "./cash-movement";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  post: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  const records = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return records.size;
    },
    key: (index: number) => [...records.keys()][index] ?? null,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
const start = (shiftId = "shift") =>
  beginCashMovement({
    actorId: "actor",
    shiftId,
    terminalId: "PDV",
    terminalName: "Caixa de teste",
    type: "SUPPLY",
    amountCents: 1000,
    reason: "Fundo adicional de troco",
  });

describe("movimentação de caixa durável", () => {
  it("recupera após resposta perdida e fechamento do turno sem registrar outro movimento", async () => {
    const intent = start();
    const authorize = vi.fn().mockResolvedValue("one-use-supervisor-token");
    let committed: CashMovement | undefined;
    let writes = 0;
    vi.mocked(post).mockImplementation(async (_path, body) => {
      if (committed) return committed;
      writes++;
      committed = {
        id: "movement",
        shiftId: intent.shiftId,
        operatorId: "actor",
        ...(body as typeof intent.payload),
        createdAt: new Date().toISOString(),
      };
      throw new TypeError("Resposta perdida após commit");
    });
    await expect(submitCashMovement(intent, authorize)).rejects.toThrow(
      "Resposta perdida",
    );
    const restored = pendingCashMovement("actor")!;
    expect(restored).not.toBe(intent);
    expect(restored.payload).toEqual(intent.payload);
    expect(JSON.stringify(restored)).not.toContain("one-use-supervisor-token");
    // The second request models the idempotent lookup on the now-closed shift.
    expect(await submitCashMovement(restored, authorize)).toEqual(committed);
    expect(writes).toBe(1);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(vi.mocked(post).mock.calls[0]?.[1]).toEqual(
      vi.mocked(post).mock.calls[1]?.[1],
    );
    expect(pendingCashMovement("actor")).toBeNull();
  });
  it("não permite sobrescrever a intenção com novos dados ou outro turno", () => {
    const original = start();
    expect(() => start()).toThrow("movimentação anterior");
    expect(() => start("other-shift")).toThrow("movimentação anterior");
    expect(pendingCashMovement("actor")).toEqual(original);
    expect(pendingCashMovement("another-actor")).toBeNull();
  });
  it("preserva falha transitória e só libera após rejeição definitiva do POST", async () => {
    const intent = start();
    const authorize = vi.fn().mockResolvedValue("grant");
    vi.mocked(post)
      .mockRejectedValueOnce(
        new ApiError({
          type: "about:blank",
          title: "Indisponível",
          status: 503,
        }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          type: "about:blank",
          title: "Saldo insuficiente",
          status: 409,
        }),
      );
    await expect(submitCashMovement(intent, authorize)).rejects.toMatchObject({
      problem: { status: 503 },
    });
    expect(pendingCashMovement("actor")?.payload.idempotencyKey).toBe(
      intent.payload.idempotencyKey,
    );
    await expect(
      submitCashMovement(pendingCashMovement("actor")!, authorize),
    ).rejects.toMatchObject({ problem: { status: 409 } });
    expect(pendingCashMovement("actor")).toBeNull();
  });
});
