import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  Check,
  CircleCheck,
  CreditCard,
  Minus,
  Package,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  uuidV7,
  type OrderDTO,
  type PaymentMethod,
  type Product,
} from "@totem-pdv/shared-types";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  Field,
  FormError,
  Heading,
  LoadState,
  methods,
  Notice,
  StatusBadge,
} from "@/components/common";
import { useResource } from "@/hooks/use-resource";
import type { CurrentShift } from "@/lib/services";
import { errorMessage } from "@/lib/api";
import {
  cartTotal,
  lineUnitPrice,
  orderLines,
  type CartLine,
} from "@/lib/cart";
import {
  abandonAttempt,
  newAttempt,
  pendingAttempt,
  submitAttempt,
  type CheckoutAttempt,
} from "@/lib/checkout";
import { cents, money } from "@/lib/utils";

function ProductBuilder({
  product,
  close,
  add,
  focusTarget,
}: {
  product: Product | null;
  close: () => void;
  add: (line: CartLine) => void;
  focusTarget: React.RefObject<HTMLElement | null>;
}) {
  const [sizeId, setSizeId] = useState("");
  const [additions, setAdditions] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setSizeId("");
    setAdditions({});
    setNotes("");
    setError("");
  }, [product?.id]);
  const draft: CartLine | null = product
    ? {
        key: "",
        product,
        sizeId: sizeId || undefined,
        quantity: 1,
        additions: Object.entries(additions)
          .filter(([, quantity]) => quantity > 0)
          .map(([additionId, quantity]) => ({ additionId, quantity })),
        notes,
      }
    : null;
  return (
    <Dialog
      open={Boolean(product)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusTarget.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{product?.name ?? "Montar item"}</DialogTitle>
          <DialogDescription>
            {product?.description ||
              "Escolha as opções para adicionar ao pedido."}
          </DialogDescription>
        </DialogHeader>
        {product && draft && (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (product.sizes.length && !sizeId) {
                setError("Selecione um tamanho para continuar.");
                return;
              }
              add({ ...draft, key: uuidV7() });
              close();
            }}
          >
            {product.sizes.length > 0 && (
              <fieldset className="stack">
                <legend className="font-semibold mb-3">
                  Tamanho <span className="muted text-sm">obrigatório</span>
                </legend>
                <div className="grid gap-2">
                  {product.sizes.map((size) => (
                    <label className="check-row panel px-4" key={size.id}>
                      <span className="flex gap-3 items-center">
                        <input
                          type="radio"
                          name="size"
                          value={size.id}
                          checked={sizeId === size.id}
                          onChange={() => {
                            setSizeId(size.id);
                            setError("");
                          }}
                          aria-invalid={Boolean(error)}
                          className="accent-[var(--action)]"
                        />
                        {size.name}
                      </span>
                      <span className="money text-sm">
                        {money(
                          size.priceCents ??
                            product.basePriceCents + size.priceModifierCents,
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                <FormError error={error} />
              </fieldset>
            )}
            {product.additions.length > 0 && (
              <fieldset>
                <legend className="font-semibold mb-3">Adicionais</legend>
                {product.additions.map((addition) => (
                  <div className="check-row" key={addition.id}>
                    <div>
                      <strong className="text-sm">{addition.name}</strong>
                      <p className="money">
                        + {money(addition.priceCents)} · até{" "}
                        {addition.maxQuantity} un.
                      </p>
                    </div>
                    <div className="qty-control">
                      <button
                        type="button"
                        aria-label={`Remover ${addition.name}`}
                        disabled={!additions[addition.id]}
                        onClick={() =>
                          setAdditions((values) => ({
                            ...values,
                            [addition.id]: (values[addition.id] ?? 0) - 1,
                          }))
                        }
                      >
                        <Minus size={16} />
                      </button>
                      <span className="font-data">
                        {additions[addition.id] ?? 0}
                      </span>
                      <button
                        type="button"
                        aria-label={`Adicionar ${addition.name}`}
                        disabled={
                          (additions[addition.id] ?? 0) >= addition.maxQuantity
                        }
                        onClick={() =>
                          setAdditions((values) => ({
                            ...values,
                            [addition.id]: (values[addition.id] ?? 0) + 1,
                          }))
                        }
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </fieldset>
            )}
            <Field label="Observações" help="Até 300 caracteres.">
              <Textarea
                value={notes}
                maxLength={300}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: sem cebola"
              />
            </Field>
            <Button type="submit" className="w-full">
              <Plus />
              Adicionar por {money(lineUnitPrice(draft))}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PdvPage() {
  const {
    user,
    catalog,
    catalogLoading,
    catalogError,
    terminalId,
    revision,
    invalidate,
    navigate,
    terminals,
  } = useApp();
  const shift = useResource<CurrentShift>(
    terminalId
      ? `/shifts/current?terminalId=${encodeURIComponent(terminalId)}`
      : null,
    revision,
  );
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [tendered, setTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("");
  const [receipt, setReceipt] = useState<OrderDTO | null>(null);
  const [recovery] = useState(() => {
    try {
      return { attempt: pendingAttempt(user.id), error: "" };
    } catch (cause) {
      return { attempt: null, error: errorMessage(cause) };
    }
  });
  const [attempt, setAttempt] = useState<CheckoutAttempt | null>(
    recovery.attempt,
  );
  const receiptState = useResource<OrderDTO>(
    receipt ? `/orders/by-key/${receipt.idempotencyKey}` : null,
    revision,
  );
  useEffect(() => {
    if (receiptState.data) setReceipt(receiptState.data);
  }, [receiptState.data]);
  const lastCheckoutFocus = useRef<HTMLElement | null>(null);
  const cartPanel = useRef<HTMLElement | null>(null);
  const lastProduct = useRef<HTMLElement | null>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const checkoutTrigger = useRef<HTMLButtonElement>(null);
  const total = cartTotal(cart);
  const amountTendered = cents(tendered || "0");
  const currentTerminal = terminals.find(
    (terminal) => terminal.id === terminalId,
  );
  const available =
    catalog?.products.filter(
      (product) => product.active && product.availableInPdv,
    ) ?? [];
  const products = available.filter(
    (product) =>
      (category === "all" || product.categoryId === category) &&
      product.name
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!["F2", "F4", "F8"].includes(event.key)) return;
      event.preventDefault();
      if (busy || searchOpen || checkoutOpen || selected) return;
      if (event.key === "F2") searchTrigger.current?.click();
      if (event.key === "F4") checkoutTrigger.current?.click();
      if (event.key === "F8") {
        sessionStorage.setItem("central-open-movement", "true");
        navigate("caixa");
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [navigate, busy, searchOpen, checkoutOpen, selected]);
  const selectProduct = (product: Product, target?: HTMLElement) => {
    if (target) lastProduct.current = target;
    setSelected(product);
  };
  const finish = async () => {
    if (!attempt && (!shift.data?.open || !cart.length)) return;
    if (
      !attempt &&
      method === "CASH" &&
      (!Number.isFinite(amountTendered) || amountTendered < total)
    ) {
      setError("O valor recebido precisa cobrir o total da venda.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const current =
        attempt ??
        newAttempt({
          actorId: user.id,
          terminalId,
          method,
          amountCents: total,
          ...(method === "CASH" ? { amountTenderedCents: amountTendered } : {}),
          items: orderLines(cart),
        });
      setAttempt(current);
      const result = await submitAttempt(current, setStep);
      setReceipt(result);
      setAttempt(null);
      setCart([]);
      setTendered("");
      invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      setStep("");
    }
  };
  const dismissAttempt = async () => {
    if (!attempt) return;
    setBusy(true);
    setError("");
    try {
      const existing = await abandonAttempt(attempt);
      setAttempt(null);
      if (existing) {
        setReceipt(existing);
        setCart([]);
      }
      invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        title="PDV Assistido"
        description="Monte o pedido e conclua o atendimento no balcão."
      >
        <Button variant="outline" onClick={() => navigate("caixa")}>
          <Wallet />
          Caixa <kbd className="muted text-xs">F8</kbd>
        </Button>
      </Heading>
      {recovery.error && (
        <Notice title="Conferência de pagamento necessária">
          {recovery.error}
        </Notice>
      )}
      {attempt && (
        <Notice title="Há um pagamento aguardando conferência">
          A tentativa foi preservada.{" "}
          <button
            className="underline font-semibold"
            onClick={() => setCheckoutOpen(true)}
          >
            Retomar a mesma venda
          </button>{" "}
          antes de iniciar outra.
        </Notice>
      )}
      {!shift.data?.open && !shift.loading && (
        <Notice title="Abra um turno para vender neste terminal">
          {shift.error ||
            "Selecione o terminal e abra o caixa com seu fundo inicial."}{" "}
          <button
            className="underline font-semibold"
            onClick={() => navigate("caixa")}
          >
            Abrir Caixa & Turnos
          </button>
        </Notice>
      )}
      {currentTerminal?.type === "TOTEM" && (
        <Notice title="Terminal de autoatendimento selecionado">
          Escolha um terminal PDV para registrar atendimento no balcão.
        </Notice>
      )}
      <div className="pdv-layout">
        <section aria-label="Catálogo de produtos">
          <div className="toolbar">
            <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  ref={searchTrigger}
                  aria-label="Buscar produtos"
                >
                  <span className="flex gap-2 items-center">
                    <Search />
                    Buscar produtos
                  </span>
                  <kbd className="muted text-xs">F2</kbd>
                </Button>
              </DialogTrigger>
              <DialogContent className="p-0 overflow-hidden">
                <DialogHeader className="sr-only">
                  <DialogTitle>Buscar produtos</DialogTitle>
                  <DialogDescription>
                    Busque pelo nome e selecione um produto.
                  </DialogDescription>
                </DialogHeader>
                <Command>
                  <CommandInput placeholder="Digite o nome do produto..." />
                  <CommandList>
                    <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                    {available.map((product) => (
                      <CommandItem
                        key={product.id}
                        value={product.name}
                        onSelect={() => {
                          setSearchOpen(false);
                          lastProduct.current = searchTrigger.current;
                          selectProduct(product);
                        }}
                        className="min-h-12 flex justify-between"
                      >
                        <span>{product.name}</span>
                        <span className="money">
                          {money(product.basePriceCents)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </DialogContent>
            </Dialog>
          </div>
          <div className="toolbar">
            <Tabs
              value={category}
              onValueChange={setCategory}
              className="w-full"
            >
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="all">Todos</TabsTrigger>
                {catalog?.categories.map((item) => (
                  <TabsTrigger value={item.id} key={item.id}>
                    {item.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <Field
            label="Filtrar catálogo"
            type="search"
            placeholder="Nome do produto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-4"
          />
          {!catalog ? (
            <LoadState
              loading={catalogLoading}
              error={catalogError}
              kind="products"
              retry={invalidate}
            />
          ) : !products.length ? (
            <div className="panel">
              <EmptyState
                title="Nenhum produto disponível"
                description="Limpe a busca ou revise a disponibilidade do cardápio."
                action="Limpar filtros"
                onAction={() => {
                  setQuery("");
                  setCategory("all");
                }}
              />
            </div>
          ) : (
            <div className="product-grid">
              {products.map((product) => (
                <button
                  className="product-card"
                  key={product.id}
                  onClick={(event) =>
                    selectProduct(product, event.currentTarget)
                  }
                  disabled={Boolean(attempt) || Boolean(recovery.error)}
                  aria-label={`Montar ${product.name}`}
                >
                  {product.imageUrl ? (
                    <img
                      className="product-photo"
                      src={product.imageUrl}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="product-photo-fallback">
                      <Package aria-hidden="true" />
                    </div>
                  )}
                  <div className="product-card-content">
                    <strong>{product.name}</strong>
                    <p>{product.description}</p>
                    <span className="money">
                      {money(product.basePriceCents)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
        <aside
          ref={cartPanel}
          className="panel cart-panel"
          aria-label="Pedido atual"
        >
          <div className="panel-head">
            <h2 className="text-lg">Pedido atual</h2>
            <span className="font-data muted text-xs">
              {cart.reduce((sum, line) => sum + line.quantity, 0)} un.
            </span>
          </div>
          {!cart.length ? (
            <EmptyState
              title="Comece pelo cardápio"
              description="Selecione um produto para montar o pedido."
            />
          ) : (
            <ScrollArea className="max-h-[52vh] overflow-y-auto">
              {cart.map((line) => (
                <div className="cart-line" key={line.key}>
                  <div className="cart-line-title">
                    <strong className="text-sm">{line.product.name}</strong>
                    <span className="money text-sm whitespace-nowrap">
                      {money(lineUnitPrice(line) * line.quantity)}
                    </span>
                  </div>
                  {line.sizeId && (
                    <small>
                      {
                        line.product.sizes.find(
                          (size) => size.id === line.sizeId,
                        )?.name
                      }
                    </small>
                  )}
                  {line.additions.length > 0 && (
                    <small>
                      {line.additions
                        .map(
                          (value) =>
                            `${value.quantity}× ${line.product.additions.find((addition) => addition.id === value.additionId)?.name}`,
                        )
                        .join(", ")}
                    </small>
                  )}
                  {line.notes && <small>{line.notes}</small>}
                  <div className="flex justify-between items-center">
                    <div className="qty-control">
                      <button
                        aria-label={`Diminuir ${line.product.name}`}
                        disabled={Boolean(attempt)}
                        onClick={() =>
                          setCart((lines) =>
                            lines.map((item) =>
                              item.key === line.key
                                ? {
                                    ...item,
                                    quantity: Math.max(1, item.quantity - 1),
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <Minus size={16} />
                      </button>
                      <span className="font-data">{line.quantity}</span>
                      <button
                        aria-label={`Aumentar ${line.product.name}`}
                        disabled={line.quantity >= 99 || Boolean(attempt)}
                        onClick={() =>
                          setCart((lines) =>
                            lines.map((item) =>
                              item.key === line.key
                                ? { ...item, quantity: item.quantity + 1 }
                                : item,
                            ),
                          )
                        }
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir ${line.product.name}`}
                      disabled={Boolean(attempt)}
                      onClick={() =>
                        setCart((lines) =>
                          lines.filter((item) => item.key !== line.key),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </ScrollArea>
          )}
          <div className="cart-footer">
            <div className="total-row">
              <span>Total do pedido</span>
              <strong className="money">{money(total)}</strong>
            </div>
            <Dialog
              open={checkoutOpen}
              onOpenChange={(open) => {
                if (!busy) {
                  if (open)
                    lastCheckoutFocus.current =
                      document.activeElement as HTMLElement;
                  setCheckoutOpen(open);
                  if (open) setReceipt(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  ref={checkoutTrigger}
                  className="w-full h-14"
                  disabled={
                    Boolean(recovery.error) ||
                    (!attempt &&
                      (!cart.length ||
                        !shift.data?.open ||
                        currentTerminal?.type !== "PDV"))
                  }
                >
                  <ShoppingBag />
                  Ir para pagamento <kbd className="text-xs ml-auto">F4</kbd>
                </Button>
              </DialogTrigger>
              <DialogContent
                className="sm:max-w-lg"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  (
                    lastCheckoutFocus.current ?? checkoutTrigger.current
                  )?.focus();
                }}
              >
                <DialogHeader>
                  <DialogTitle>
                    {receipt ? "Pedido registrado" : "Concluir atendimento"}
                  </DialogTitle>
                  <DialogDescription>
                    {receipt
                      ? "Acompanhe a confirmação e a impressão no histórico de pedidos."
                      : "Confira o valor e escolha a forma de pagamento."}
                  </DialogDescription>
                </DialogHeader>
                {receipt ? (
                  <div className="stack">
                    <div className="flex justify-center gap-3 items-center py-5">
                      <CircleCheck className="text-success" size={32} />
                      <strong className="font-data text-4xl">
                        #{receipt.publicTicketNumber}
                      </strong>
                    </div>
                    <StatusBadge
                      status={receipt.payments[0]?.status ?? "AUTHORIZED"}
                    />
                    <p className="muted">
                      {receipt.payments[0]?.status === "CONFIRMED"
                        ? "Pagamento confirmado. O pedido está na fila da cozinha."
                        : "O pedido foi gravado. O pagamento será confirmado após a impressão do comprovante."}
                    </p>
                    <div className="total-row">
                      <span>Total registrado</span>
                      <strong className="money">
                        {money(receipt.totalCents)}
                      </strong>
                    </div>
                    <Button
                      onClick={() => {
                        setCheckoutOpen(false);
                        setReceipt(null);
                      }}
                    >
                      <Check />
                      Novo atendimento
                    </Button>
                  </div>
                ) : (
                  <div className="stack">
                    <div className="checkout-total">
                      {money(attempt?.amountCents ?? total)}
                    </div>
                    {attempt ? (
                      <Notice title="Conferir a mesma tentativa">
                        Forma: {methods[attempt.method]}. A chave original será
                        reutilizada para impedir duplicidade.
                      </Notice>
                    ) : (
                      <>
                        <div className="method-grid">
                          {(
                            [
                              ["CASH", Banknote],
                              ["CREDIT_CARD", CreditCard],
                              ["DEBIT_CARD", CreditCard],
                              ["PIX", QrCode],
                            ] as const
                          ).map(([value, Icon]) => (
                            <button
                              key={value}
                              className="method-button"
                              aria-pressed={method === value}
                              onClick={() => {
                                setMethod(value);
                                setError("");
                              }}
                            >
                              <Icon size={20} />
                              {methods[value]}
                            </button>
                          ))}
                        </div>
                        {method === "CASH" && (
                          <>
                            <Field
                              label="Valor recebido (R$)"
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              value={tendered}
                              onChange={(e) => setTendered(e.target.value)}
                              error={
                                amountTendered < total && tendered
                                  ? "O valor recebido é insuficiente."
                                  : undefined
                              }
                            />
                            <div className="total-row p-4 bg-subtle rounded-lg">
                              <span>Troco a devolver</span>
                              <strong className="money">
                                {money(Math.max(0, amountTendered - total))}
                              </strong>
                            </div>
                          </>
                        )}
                      </>
                    )}
                    <FormError error={error} />
                    {step && (
                      <p role="status" className="muted text-sm">
                        {step}
                      </p>
                    )}
                    <Button
                      onClick={() => {
                        void finish();
                      }}
                      disabled={
                        busy ||
                        (!attempt &&
                          method === "CASH" &&
                          amountTendered < total)
                      }
                      className="w-full h-14"
                    >
                      <CreditCard />
                      {busy
                        ? "Conferindo operação..."
                        : attempt
                          ? "Conferir e concluir tentativa"
                          : `Concluir em ${methods[method].toLowerCase()}`}
                    </Button>
                    {attempt && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          void dismissAttempt();
                        }}
                      >
                        Conferir e desfazer tentativa
                      </Button>
                    )}
                    <p className="muted text-xs">
                      Pinpad simulado. Fiscal desativado ou sandbox conforme
                      configuração da Central.
                    </p>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <p className="muted text-xs flex gap-2 items-center">
              {shift.data?.open ? (
                <CircleCheck size={14} />
              ) : (
                <Wallet size={14} />
              )}
              {shift.data?.open
                ? `Turno aberto · ${shift.data.shift?.operatorName}`
                : "Turno fechado neste terminal"}
            </p>
          </div>
        </aside>
      </div>
      {cart.length > 0 && !checkoutOpen && (
        <div className="mobile-checkout-bar">
          <Button
            variant="outline"
            onClick={() =>
              cartPanel.current?.scrollIntoView({
                behavior: "instant",
                block: "center",
              })
            }
          >
            Ver pedido
          </Button>
          <Button
            disabled={
              !shift.data?.open ||
              currentTerminal?.type !== "PDV" ||
              Boolean(recovery.error)
            }
            onClick={(event) => {
              lastCheckoutFocus.current = event.currentTarget;
              setReceipt(null);
              setCheckoutOpen(true);
            }}
          >
            Pagar {money(total)}
          </Button>
        </div>
      )}
      <ProductBuilder
        product={selected}
        close={() => setSelected(null)}
        add={(line) => setCart((lines) => [...lines, line])}
        focusTarget={lastProduct}
      />
    </>
  );
}
