import type { Product } from "@totem-pdv/shared-types";

export interface CartLine {
  key: string;
  product: Product;
  sizeId?: string;
  quantity: number;
  additions: { additionId: string; quantity: number }[];
  notes: string;
}
export function lineUnitPrice(line: CartLine): number {
  const size = line.product.sizes.find((value) => value.id === line.sizeId);
  const base =
    size?.priceCents ??
    line.product.basePriceCents + (size?.priceModifierCents ?? 0);
  return (
    base +
    line.additions.reduce(
      (sum, selected) =>
        sum +
        (line.product.additions.find(
          (value) => value.id === selected.additionId,
        )?.priceCents ?? 0) *
          selected.quantity,
      0,
    )
  );
}
export const cartTotal = (lines: CartLine[]) =>
  lines.reduce((sum, line) => sum + lineUnitPrice(line) * line.quantity, 0);
export const orderLines = (lines: CartLine[]) =>
  lines.map(({ product, sizeId, quantity, additions, notes }) => ({
    productId: product.id,
    ...(sizeId ? { sizeId } : {}),
    quantity,
    additions,
    ...(notes ? { notes } : {}),
  }));
