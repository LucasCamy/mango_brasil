import { describe, expect, it } from "vitest";
import type { Product } from "@totem-pdv/shared-types";
import { cartTotal, lineUnitPrice, orderLines, type CartLine } from "./cart";

const product: Product = {
  id: "019ab890-0520-7000-8000-000000000001",
  categoryId: "019ab890-0520-7000-8000-000000000002",
  version: 1,
  name: "Produto de teste",
  description: "",
  imageUrl: "",
  basePriceCents: 1990,
  active: true,
  availableInKiosk: true,
  availableInPdv: true,
  sizes: [
    { id: "small", name: "Padrão", priceModifierCents: 0 },
    { id: "large", name: "Grande", priceModifierCents: 500 },
    {
      id: "fixed",
      name: "Preço próprio",
      priceModifierCents: 900,
      priceCents: 2500,
    },
  ],
  additions: [
    { id: "extra", name: "Adicional", priceCents: 350, maxQuantity: 3 },
  ],
  fiscal: {
    ncm: "21069090",
    cest: "",
    cfop: "5102",
    origem: 0,
    cstCsosn: "102",
    aliquotaIcms: 0,
    ibsRate: 0,
    cbsRate: 0,
    aliquotaIbpt: 0,
  },
  createdAt: "2026-11-21T00:00:00.000Z",
  updatedAt: "2026-11-21T00:00:00.000Z",
};
const line = (updates: Partial<CartLine> = {}): CartLine => ({
  key: "line",
  product,
  quantity: 1,
  additions: [],
  notes: "",
  ...updates,
});

describe("totais do carrinho em centavos", () => {
  it("aplica modificador e adicionais em cada unidade antes de multiplicar quantidade", () => {
    expect(
      cartTotal([
        line({
          sizeId: "large",
          quantity: 3,
          additions: [{ additionId: "extra", quantity: 2 }],
        }),
      ]),
    ).toBe(9570);
  });
  it("preço específico do tamanho substitui base e modificador", () => {
    expect(lineUnitPrice(line({ sizeId: "fixed" }))).toBe(2500);
  });
  it("envia somente referências e quantidades para preço ser validado no servidor", () => {
    expect(orderLines([line({ sizeId: "large", notes: "Sem molho" })])).toEqual(
      [
        {
          productId: product.id,
          sizeId: "large",
          quantity: 1,
          additions: [],
          notes: "Sem molho",
        },
      ],
    );
  });
  it("carrinho vazio não inventa valor mínimo", () => {
    expect(cartTotal([])).toBe(0);
  });
});
