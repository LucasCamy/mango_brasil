import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderDTO } from "@totem-pdv/shared-types";
import { ApiError } from "./api";
import { central } from "./services";
import {
  abandonAttempt,
  newAttempt,
  pendingAttempt,
  submitAttempt,
} from "./checkout";

vi.mock("./services", () => ({
  central: {
    orderByKey: vi.fn(),
    authorize: vi.fn(),
    createOrder: vi.fn(),
    reverseAuthorization: vi.fn(),
  },
}));
const missing = () =>
  new ApiError({
    type: "about:blank",
    title: "Pedido não encontrado",
    status: 404,
  });
const order = { id: "saved-order", publicTicketNumber: "042" } as OrderDTO;
beforeEach(() => {
  vi.resetAllMocks();
  const records = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
const attempt = () =>
  newAttempt({
    actorId: "actor",
    terminalId: "pdv",
    method: "CREDIT_CARD",
    amountCents: 1990,
    items: [{ productId: "product", quantity: 1, additions: [] }],
  });

describe("recuperação do checkout", () => {
  it("recupera venda que persistiu antes de um timeout sem autorizar uma segunda cobrança", async () => {
    vi.mocked(central.orderByKey)
      .mockRejectedValueOnce(missing())
      .mockResolvedValueOnce(order);
    vi.mocked(central.authorize).mockResolvedValue({
      id: "tx",
      status: "AUTHORIZED",
    } as Awaited<ReturnType<typeof central.authorize>>);
    vi.mocked(central.createOrder).mockRejectedValue(
      new TypeError("Network failed"),
    );
    const current = attempt();
    await expect(submitAttempt(current, () => undefined)).rejects.toThrow(
      "Network failed",
    );
    const recovered = pendingAttempt("actor");
    expect(recovered?.transactionId).toBe("tx");
    expect(await submitAttempt(recovered!, () => undefined)).toBe(order);
    expect(central.authorize).toHaveBeenCalledTimes(1);
    expect(central.createOrder).toHaveBeenCalledTimes(1);
    expect(pendingAttempt("actor")).toBeNull();
  });
  it("reenvia a mesma chave depois de resposta perdida na autorização", async () => {
    vi.mocked(central.orderByKey).mockRejectedValue(missing());
    vi.mocked(central.authorize)
      .mockRejectedValueOnce(new TypeError("Timeout"))
      .mockResolvedValueOnce({ id: "tx", status: "AUTHORIZED" } as Awaited<
        ReturnType<typeof central.authorize>
      >);
    vi.mocked(central.createOrder).mockResolvedValue(order);
    const current = attempt();
    await expect(submitAttempt(current, () => undefined)).rejects.toThrow(
      "Timeout",
    );
    await submitAttempt(pendingAttempt("actor")!, () => undefined);
    expect(vi.mocked(central.authorize).mock.calls[0]?.[0].idempotencyKey).toBe(
      vi.mocked(central.authorize).mock.calls[1]?.[0].idempotencyKey,
    );
  });
  it("não reverte autorização quando a consulta de pedido falha por rede", async () => {
    vi.mocked(central.orderByKey).mockRejectedValue(new TypeError("Offline"));
    await expect(abandonAttempt(attempt())).rejects.toThrow("Offline");
    expect(central.reverseAuthorization).not.toHaveBeenCalled();
    expect(pendingAttempt("actor")).not.toBeNull();
  });
  it("falha antes de autorizar se não consegue persistir a intenção local", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage unavailable");
      },
    });
    expect(attempt).toThrow("Storage unavailable");
    expect(central.authorize).not.toHaveBeenCalled();
  });
  it("não sobrescreve uma tentativa já preservada ao abrir outro atendimento", () => {
    const original = attempt();
    expect(attempt).toThrow("Já existe uma tentativa");
    expect(pendingAttempt("actor")?.orderKey).toBe(original.orderKey);
    expect(central.authorize).not.toHaveBeenCalled();
  });
});
