import { useRef, useState } from "react";
import { FilePenLine, Plus, Search, Trash2 } from "lucide-react";
import {
  productInputSchema,
  uuidV7,
  type Product,
  type ProductCategory,
  type ProductInput,
} from "@totem-pdv/shared-types";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  Field,
  FormError,
  Heading,
  LoadState,
  PageControls,
  StatusBadge,
} from "@/components/common";
import { useResource } from "@/hooks/use-resource";
import { central, type Collection } from "@/lib/services";
import { ApiError, errorMessage, patch, post } from "@/lib/api";
import { cents, money } from "@/lib/utils";

const blankProduct = (categoryId = ""): ProductInput => ({
  name: "",
  categoryId,
  description: "",
  imageUrl: "",
  basePriceCents: 0,
  active: true,
  availableInKiosk: true,
  availableInPdv: true,
  sizes: [],
  additions: [],
  fiscal: {
    ncm: "",
    cest: "",
    cfop: "",
    origem: 0,
    cstCsosn: "",
    aliquotaIcms: 0,
    ibsRate: 0,
    cbsRate: 0,
    aliquotaIbpt: 0,
  },
});
const selectClass =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm";
export default function ProductsPage() {
  const { revision, invalidate } = useApp();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const products = useResource<Collection<Product>>(
    `/products?page=${page}&pageSize=25&search=${encodeURIComponent(query)}`,
    revision,
  );
  const categories = useResource<ProductCategory[]>("/categories", revision);
  const [editingVersion, setEditingVersion] = useState<number | undefined>();
  const [changeReason, setChangeReason] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ProductInput>(blankProduct());
  const [tab, setTab] = useState("general");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const trigger = useRef<HTMLElement | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [toggleId, setToggleId] = useState("");
  const open = (product: Product | null, target: HTMLElement) => {
    trigger.current = target;
    setEditing(product?.id ?? null);
    setEditingVersion(product?.version);
    setChangeReason("");
    setDraft(
      product
        ? {
            categoryId: product.categoryId,
            name: product.name,
            description: product.description,
            imageUrl: product.imageUrl,
            basePriceCents: product.basePriceCents,
            active: product.active,
            availableInKiosk: product.availableInKiosk,
            availableInPdv: product.availableInPdv,
            sizes: product.sizes.map((size) => ({ ...size })),
            additions: product.additions.map((addition) => ({ ...addition })),
            fiscal: { ...product.fiscal },
          }
        : blankProduct(categories.data?.[0]?.id),
    );
    setTab("general");
    setError("");
    setErrors({});
    setSheetOpen(true);
  };
  const save = async () => {
    if (editing && changeReason.trim().length < 3) {
      setError("Informe o motivo da alteração com pelo menos 3 caracteres.");
      setErrors({ changeReason: "Motivo obrigatório." });
      return;
    }
    const parsed = productInputSchema.safeParse({
      ...draft,
      ...(editing ? { expectedVersion: editingVersion, changeReason } : {}),
    });
    if (!parsed.success) {
      const next = Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      );
      setErrors(next);
      setError("Revise os campos indicados antes de salvar.");
      const first = parsed.error.issues[0]?.path[0];
      setTab(
        first === "fiscal"
          ? "fiscal"
          : first === "sizes" || first === "additions"
            ? "options"
            : "general",
      );
      return;
    }
    setBusy(true);
    setError("");
    setErrors({});
    try {
      await central.saveProduct(parsed.data, editing ?? undefined);
      setSheetOpen(false);
      invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError)
        setErrors(
          Object.fromEntries(
            Object.entries(cause.problem.errors ?? {}).map(([key, value]) => [
              key,
              value.join(" "),
            ]),
          ),
        );
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (product: Product) => {
    setToggleId(product.id);
    setError("");
    try {
      await patch(`/products/${product.id}/availability`, {
        active: !product.active,
      });
      invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setToggleId("");
    }
  };
  const fiscal = <K extends keyof ProductInput["fiscal"]>(
    key: K,
    value: ProductInput["fiscal"][K],
  ) =>
    setDraft((current) => ({
      ...current,
      fiscal: { ...current.fiscal, [key]: value },
    }));
  return (
    <>
      <Heading
        title="Produtos & Cardápio"
        description="Disponibilidade, personalizações e cadastro fiscal que acompanham toda a operação."
      >
        <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus />
              Nova categoria
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova categoria</DialogTitle>
              <DialogDescription>
                Organize os produtos exibidos no PDV e no totem.
              </DialogDescription>
            </DialogHeader>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setCategoryError("");
                const slug = categoryName
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "");
                void post("/categories", {
                  name: categoryName,
                  slug,
                  order: categories.data?.length ?? 0,
                  active: true,
                })
                  .then(() => {
                    setCategoryOpen(false);
                    setCategoryName("");
                    invalidate();
                  })
                  .catch((cause) => setCategoryError(errorMessage(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              <Field
                label="Nome da categoria"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                required
                minLength={2}
                maxLength={80}
                error={categoryError || undefined}
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Criando..." : "Criar categoria"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        <Button onClick={(event) => open(null, event.currentTarget)}>
          <Plus />
          Novo produto
        </Button>
      </Heading>
      <div className="toolbar">
        <Search size={18} className="muted" />
        <div className="w-full max-w-md">
          <Field
            label="Buscar produtos"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Nome do produto"
          />
        </div>
      </div>
      <FormError error={!sheetOpen ? error : undefined} />
      <LoadState
        loading={products.loading && !products.data}
        error={products.error}
        retry={products.refresh}
      />
      {products.data && (
        <>
          <div className="panel">
            {!products.data.items.length ? (
              <EmptyState
                title="Seu cardápio começa aqui"
                description="Cadastre um produto com preço, disponibilidade e regras fiscais."
                action="Cadastrar produto"
                onAction={() =>
                  open(null, document.activeElement as HTMLElement)
                }
              />
            ) : (
              <>
                <div className="desktop-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th>Preço base</th>
                        <th>Disponibilidade</th>
                        <th>Ativo</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.data.items.map((product) => (
                        <tr key={product.id}>
                          <td>
                            <strong>{product.name}</strong>
                            <p className="muted text-xs mt-1">
                              {product.sizes.length} tamanhos ·{" "}
                              {product.additions.length} adicionais
                            </p>
                          </td>
                          <td className="text-sm muted">
                            {
                              categories.data?.find(
                                (category) =>
                                  category.id === product.categoryId,
                              )?.name
                            }
                          </td>
                          <td className="money whitespace-nowrap">
                            {money(product.basePriceCents)}
                          </td>
                          <td className="text-sm muted">
                            {[
                              product.availableInPdv && "Balcão",
                              product.availableInKiosk && "Totem",
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Sem canal"}
                          </td>
                          <td>
                            <Switch
                              checked={product.active}
                              disabled={toggleId === product.id}
                              aria-label={`${product.active ? "Desativar" : "Ativar"} ${product.name}`}
                              onCheckedChange={() => {
                                void toggle(product);
                              }}
                            />
                          </td>
                          <td>
                            <Button
                              variant="outline"
                              onClick={(event) =>
                                open(product, event.currentTarget)
                              }
                              aria-label={`Editar ${product.name}`}
                            >
                              <FilePenLine />
                              Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="responsive-list">
                  {products.data.items.map((product) => (
                    <div className="list-row" key={product.id}>
                      <div className="list-row-top">
                        <strong>{product.name}</strong>
                        <span className="money">
                          {money(product.basePriceCents)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <StatusBadge
                          status={product.active ? "ACTIVE" : "INACTIVE"}
                        />
                        <Switch
                          checked={product.active}
                          disabled={toggleId === product.id}
                          aria-label={`${product.active ? "Desativar" : "Ativar"} ${product.name}`}
                          onCheckedChange={() => {
                            void toggle(product);
                          }}
                        />
                      </div>
                      <Button
                        variant="outline"
                        onClick={(event) => open(product, event.currentTarget)}
                      >
                        <FilePenLine />
                        Editar {product.name}
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <PageControls
            page={page}
            total={products.data.total}
            onPage={setPage}
          />
        </>
      )}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!busy) setSheetOpen(open);
        }}
      >
        <SheetContent
          className="w-full sm:max-w-2xl overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>
              {editing ? "Editar produto" : "Novo produto"}
            </SheetTitle>
            <SheetDescription>
              Os dados fiscais são preservados mesmo com emissão desativada ou
              simulada.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 stack"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {editing && (
              <Field
                label="Motivo da alteração"
                error={errors.changeReason}
                help="O motivo será registrado na auditoria, junto aos preços anteriores e novos."
              >
                <Textarea
                  value={changeReason}
                  onChange={(event) => setChangeReason(event.target.value)}
                  required
                  minLength={3}
                  maxLength={500}
                />
              </Field>
            )}
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full h-auto flex-wrap">
                <TabsTrigger value="general">Dados gerais & Foto</TabsTrigger>
                <TabsTrigger value="options">Tamanhos & Adicionais</TabsTrigger>
                <TabsTrigger value="fiscal">Regras fiscais</TabsTrigger>
              </TabsList>
              <TabsContent value="general" className="stack pt-4">
                <Field
                  label="Nome do produto"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      name: event.target.value,
                    }))
                  }
                  required
                  maxLength={160}
                  error={errors.name}
                />
                <Field label="Descrição">
                  <Textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        description: event.target.value,
                      }))
                    }
                    maxLength={2000}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Categoria" error={errors.categoryId}>
                    <select
                      value={draft.categoryId}
                      onChange={(event) =>
                        setDraft((value) => ({
                          ...value,
                          categoryId: event.target.value,
                        }))
                      }
                      required
                      className={selectClass}
                    >
                      <option value="">Selecione uma categoria</option>
                      {categories.data?.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Preço base (R$)"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={(draft.basePriceCents / 100).toString()}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        basePriceCents: cents(event.target.value),
                      }))
                    }
                    required
                    error={errors.basePriceCents}
                  />
                </div>
                <Field
                  label="URL da foto"
                  type="url"
                  value={draft.imageUrl}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      imageUrl: event.target.value,
                    }))
                  }
                  help="Fotos AVIF e WebP são aceitas. Use uma URL HTTPS acessível pelos terminais."
                  error={errors.imageUrl}
                />
                {(
                  ["active", "availableInPdv", "availableInKiosk"] as const
                ).map((key) => (
                  <label className="check-row" key={key}>
                    <div>
                      <strong>
                        {key === "active"
                          ? "Produto ativo"
                          : key === "availableInPdv"
                            ? "Disponível no balcão"
                            : "Disponível no totem"}
                      </strong>
                    </div>
                    <Switch
                      checked={draft[key]}
                      onCheckedChange={(checked) =>
                        setDraft((value) => ({ ...value, [key]: checked }))
                      }
                      aria-label={
                        key === "active"
                          ? "Produto ativo"
                          : key === "availableInPdv"
                            ? "Disponível no balcão"
                            : "Disponível no totem"
                      }
                    />
                  </label>
                ))}
              </TabsContent>
              <TabsContent value="options" className="stack pt-4">
                <div className="flex justify-between items-center gap-3">
                  <h3>Tamanhos</h3>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setDraft((value) => ({
                        ...value,
                        sizes: [
                          ...value.sizes,
                          {
                            id: uuidV7(),
                            name: "",
                            priceModifierCents: 0,
                            priceCents: null,
                          },
                        ],
                      }))
                    }
                  >
                    <Plus />
                    Tamanho
                  </Button>
                </div>
                <p className="muted text-sm">
                  O tamanho pode acrescentar um valor ao preço base ou definir
                  um preço próprio.
                </p>
                {draft.sizes.map((size, index) => (
                  <div className="panel p-4 stack" key={size.id ?? index}>
                    <div className="flex justify-between items-center">
                      <strong className="text-sm">Tamanho {index + 1}</strong>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir tamanho ${index + 1}`}
                        onClick={() =>
                          setDraft((value) => ({
                            ...value,
                            sizes: value.sizes.filter(
                              (_, current) => current !== index,
                            ),
                          }))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <Field
                      label={`Nome do tamanho ${index + 1}`}
                      value={size.name}
                      onChange={(event) =>
                        setDraft((value) => ({
                          ...value,
                          sizes: value.sizes.map((item, current) =>
                            current === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        }))
                      }
                      error={errors[`sizes.${index}.name`]}
                    />
                    <div className="form-grid">
                      <Field
                        label="Acréscimo ao preço (R$)"
                        type="number"
                        step="0.01"
                        value={size.priceModifierCents / 100}
                        onChange={(event) =>
                          setDraft((value) => ({
                            ...value,
                            sizes: value.sizes.map((item, current) =>
                              current === index
                                ? {
                                    ...item,
                                    priceModifierCents: cents(
                                      event.target.value,
                                    ),
                                  }
                                : item,
                            ),
                          }))
                        }
                        error={errors[`sizes.${index}.priceModifierCents`]}
                      />
                      <Field
                        label="Preço próprio (R$)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          size.priceCents == null ? "" : size.priceCents / 100
                        }
                        help="Deixe vazio para usar o acréscimo."
                        onChange={(event) =>
                          setDraft((value) => ({
                            ...value,
                            sizes: value.sizes.map((item, current) =>
                              current === index
                                ? {
                                    ...item,
                                    priceCents:
                                      event.target.value === ""
                                        ? null
                                        : cents(event.target.value),
                                  }
                                : item,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
                <div className="section-rule flex justify-between items-center gap-3">
                  <h3>Adicionais</h3>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setDraft((value) => ({
                        ...value,
                        additions: [
                          ...value.additions,
                          {
                            id: uuidV7(),
                            name: "",
                            priceCents: 0,
                            maxQuantity: 1,
                          },
                        ],
                      }))
                    }
                  >
                    <Plus />
                    Adicional
                  </Button>
                </div>
                {draft.additions.map((addition, index) => (
                  <div className="panel p-4 stack" key={addition.id ?? index}>
                    <div className="flex justify-between items-center">
                      <strong className="text-sm">Adicional {index + 1}</strong>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir adicional ${index + 1}`}
                        onClick={() =>
                          setDraft((value) => ({
                            ...value,
                            additions: value.additions.filter(
                              (_, current) => current !== index,
                            ),
                          }))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <Field
                      label={`Nome do adicional ${index + 1}`}
                      value={addition.name}
                      onChange={(event) =>
                        setDraft((value) => ({
                          ...value,
                          additions: value.additions.map((item, current) =>
                            current === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        }))
                      }
                      error={errors[`additions.${index}.name`]}
                    />
                    <div className="form-grid">
                      <Field
                        label="Preço adicional (R$)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={addition.priceCents / 100}
                        onChange={(event) =>
                          setDraft((value) => ({
                            ...value,
                            additions: value.additions.map((item, current) =>
                              current === index
                                ? {
                                    ...item,
                                    priceCents: cents(event.target.value),
                                  }
                                : item,
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Quantidade máxima"
                        type="number"
                        min="1"
                        max="50"
                        step="1"
                        value={addition.maxQuantity}
                        onChange={(event) =>
                          setDraft((value) => ({
                            ...value,
                            additions: value.additions.map((item, current) =>
                              current === index
                                ? {
                                    ...item,
                                    maxQuantity: Number(event.target.value),
                                  }
                                : item,
                            ),
                          }))
                        }
                        error={errors[`additions.${index}.maxQuantity`]}
                      />
                    </div>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="fiscal" className="pt-4 stack">
                <p className="muted text-sm">
                  Informe dados fiscais revisados pelo responsável contábil.
                  Nenhuma emissão SEFAZ real será realizada nesta etapa.
                </p>
                <div className="form-grid">
                  <Field
                    label="NCM"
                    inputMode="numeric"
                    maxLength={8}
                    value={draft.fiscal.ncm}
                    onChange={(event) => fiscal("ncm", event.target.value)}
                    error={errors["fiscal.ncm"]}
                  />
                  <Field
                    label="CEST"
                    inputMode="numeric"
                    maxLength={7}
                    value={draft.fiscal.cest}
                    onChange={(event) => fiscal("cest", event.target.value)}
                    error={errors["fiscal.cest"]}
                  />
                  <Field
                    label="CFOP"
                    inputMode="numeric"
                    maxLength={4}
                    value={draft.fiscal.cfop}
                    onChange={(event) => fiscal("cfop", event.target.value)}
                    error={errors["fiscal.cfop"]}
                  />
                  <Field
                    label="CST / CSOSN"
                    inputMode="numeric"
                    maxLength={3}
                    value={draft.fiscal.cstCsosn}
                    onChange={(event) => fiscal("cstCsosn", event.target.value)}
                    error={errors["fiscal.cstCsosn"]}
                  />
                  <Field
                    label="Origem"
                    type="number"
                    min="0"
                    max="8"
                    step="1"
                    value={draft.fiscal.origem}
                    onChange={(event) =>
                      fiscal("origem", Number(event.target.value))
                    }
                    error={errors["fiscal.origem"]}
                  />
                  {(
                    [
                      ["aliquotaIcms", "ICMS (%)"],
                      ["ibsRate", "IBS (%)"],
                      ["cbsRate", "CBS (%)"],
                      ["aliquotaIbpt", "IBPT (%)"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field
                      label={label}
                      key={key}
                      type="number"
                      min="0"
                      max="100"
                      step="0.0001"
                      value={draft.fiscal[key]}
                      onChange={(event) =>
                        fiscal(key, Number(event.target.value))
                      }
                      error={errors[`fiscal.${key}`]}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
            <FormError error={error} />
            <div className="flex gap-3 justify-end section-rule">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSheetOpen(false)}
              >
                Voltar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Salvando..." : "Salvar produto"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
