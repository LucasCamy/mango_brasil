import { useEffect, useState } from "react";
import { ArrowRight, Check, Clock3, TriangleAlert } from "lucide-react";
import type { ProductionOrderDTO, OrderStatus } from "@totem-pdv/shared-types";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  FormError,
  Heading,
  LoadState,
  StatusBadge,
} from "@/components/common";
import { useResource } from "@/hooks/use-resource";
import { errorMessage, patch } from "@/lib/api";

const stages = [
  {
    status: "RECEIVED",
    label: "Recebidos",
    action: "Iniciar preparo",
    next: "PREPARING",
  },
  {
    status: "PREPARING",
    label: "Em preparo",
    action: "Marcar pronto",
    next: "READY",
  },
  {
    status: "READY",
    label: "Prontos",
    action: "Confirmar entrega",
    next: "DELIVERED",
  },
] as const;
export default function KdsPage() {
  const { revision, invalidate } = useApp();
  const orders = useResource<ProductionOrderDTO[]>("/orders/kds", revision);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const advance = async (order: ProductionOrderDTO, status: OrderStatus) => {
    setBusy(order.id);
    setError("");
    try {
      await patch(`/orders/${order.id}/status`, { status });
      invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <Heading
        title="Cozinha KDS"
        description="Pedidos confirmados, do mais antigo para o mais recente. A próxima etapa está em cada ticket."
      >
        <Button variant="outline" onClick={orders.refresh}>
          <Clock3 />
          Atualizar fila
        </Button>
      </Heading>
      <FormError error={error} />
      <LoadState
        loading={orders.loading && !orders.data}
        error={orders.error}
        retry={orders.refresh}
      />
      {orders.data && (
        <div className="kds-grid mt-5">
          {stages.map((stage) => {
            const items = (orders.data ?? [])
              .filter((order) => order.status === stage.status)
              .sort(
                (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
              );
            return (
              <section
                className="kds-column"
                key={stage.status}
                aria-label={stage.label}
              >
                <div className="kds-column-head">
                  <h2 className="text-lg">{stage.label}</h2>
                  <span className="font-data text-sm muted">
                    {items.length} pedidos
                  </span>
                </div>
                {!items.length ? (
                  <div className="panel pending">
                    <EmptyState
                      title="Fila em dia"
                      description={`Novos pedidos ${stage.label.toLowerCase()} aparecerão aqui.`}
                      action="Atualizar fila"
                      onAction={orders.refresh}
                    />
                  </div>
                ) : (
                  items.map((order) => {
                    const elapsed = Math.max(
                      0,
                      Math.floor((now - Date.parse(order.createdAt)) / 1000),
                    );
                    const late = elapsed >= 600;
                    return (
                      <article
                        className={`panel ticket ${late ? "pending" : ""}`}
                        key={order.id}
                      >
                        <div className="ticket-header">
                          <div>
                            <p className="muted text-xs mb-2">
                              Senha do pedido
                            </p>
                            <h3 className="ticket-number">
                              #{order.publicTicketNumber}
                            </h3>
                          </div>
                          <div
                            className={`flex gap-1.5 items-center text-xs font-data ${late ? "text-warning" : "muted"}`}
                          >
                            {late ? (
                              <TriangleAlert size={16} />
                            ) : (
                              <Clock3 size={16} />
                            )}
                            <span>
                              {Math.floor(elapsed / 60)}m{" "}
                              {String(elapsed % 60).padStart(2, "0")}s
                            </span>
                          </div>
                        </div>
                        <StatusBadge status={order.status} />
                        <div>
                          {order.items.map((item) => (
                            <div className="ticket-item" key={item.id}>
                              <strong className="text-sm">
                                <span className="font-data mr-2">
                                  {item.quantity}×
                                </span>
                                {item.productName}
                              </strong>
                              {item.sizeName && (
                                <small>Tamanho: {item.sizeName}</small>
                              )}
                              {item.additions.map((addition) => (
                                <small key={addition.additionId}>
                                  + {addition.quantity}× {addition.name}
                                </small>
                              ))}
                              {item.notes && (
                                <p className="p-2 mt-2 bg-subtle rounded text-sm">
                                  <strong>Obs.:</strong> {item.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                        <Button
                          className="w-full min-h-12"
                          disabled={busy === order.id}
                          onClick={() => {
                            void advance(order, stage.next);
                          }}
                        >
                          {stage.next === "DELIVERED" ? (
                            <Check />
                          ) : (
                            <ArrowRight />
                          )}
                          {busy === order.id ? "Atualizando..." : stage.action}
                        </Button>
                        <p className="muted text-xs">
                          {order.origin === "TOTEM"
                            ? "Autoatendimento"
                            : "Balcão"}{" "}
                          ·{" "}
                          {order.items.reduce(
                            (sum, item) => sum + item.quantity,
                            0,
                          )}{" "}
                          un.
                        </p>
                      </article>
                    );
                  })
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
