import { useEffect, useRef, useState } from "react";
import {
  CircleDashed,
  FileText,
  Printer,
  Search,
  SquareX,
  TriangleAlert,
} from "lucide-react";
import type { OrderDTO, PrintJob } from "@totem-pdv/shared-types";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  Field,
  FormError,
  Heading,
  LoadState,
  methods,
  PageControls,
  StatusBadge,
} from "@/components/common";
import { useResource } from "@/hooks/use-resource";
import { central, type Collection } from "@/lib/services";
import { errorMessage } from "@/lib/api";
import { dateTime, money } from "@/lib/utils";

export default function OrdersPage() {
  const { revision, invalidate, authorize, terminalId } = useApp();
  const [page, setPage] = useState(1);
  const orders = useResource<Collection<OrderDTO>>(
    `/orders?page=${page}&pageSize=25`,
    revision,
  );
  const printJobs = useResource<Collection<PrintJob>>(
    terminalId
      ? `/print-jobs?page=1&pageSize=5&terminalId=${encodeURIComponent(terminalId)}`
      : null,
    revision,
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<OrderDTO | null>(null);
  const [cancel, setCancel] = useState<OrderDTO | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const items =
    orders.data?.items.filter(
      (order) =>
        order.publicTicketNumber.includes(query) ||
        order.id.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  useEffect(() => {
    if (selected) {
      const updated = orders.data?.items.find(
        (order) => order.id === selected.id,
      );
      if (updated) setSelected(updated);
    }
  }, [orders.data, selected?.id]);
  const cancelOrder = async () => {
    if (!cancel || reason.trim().length < 3) {
      setError("Informe o motivo do cancelamento com pelo menos 3 caracteres.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const token = await authorize("ORDER_CANCELLED", cancel.id);
      await central.cancelOrder(cancel.id, reason, token);
      setCancel(null);
      setSelected(null);
      setReason("");
      setMessage("Pedido cancelado e pagamento estornado com auditoria.");
      invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const printOrder = async (order: OrderDTO) => {
    try {
      await central.printOrder(order.id);
      setMessage("Comprovante enviado para a fila de impressão.");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <>
      <Heading
        title="Pedidos"
        description="Consulte vendas, acompanhe confirmações e solicite reimpressão ou cancelamento auditado."
      />
      <div className="toolbar">
        <div className="flex gap-2 items-center w-full max-w-md">
          <Search size={18} className="muted" />
          <Field
            label="Buscar senha ou código nesta página"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <FormError error={!cancel ? error : undefined} />
      {message && (
        <p role="status" className="text-success mb-4">
          {message}
        </p>
      )}
      <LoadState
        loading={orders.loading && !orders.data}
        error={orders.error}
        retry={orders.refresh}
      />
      {orders.data && (
        <>
          <div className="panel">
            {!items.length ? (
              <EmptyState
                title="Nenhum pedido encontrado"
                description="As vendas registradas aparecerão aqui com seu estado de pagamento."
                action="Atualizar pedidos"
                onAction={orders.refresh}
              />
            ) : (
              <>
                <div className="desktop-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Senha / origem</th>
                        <th>Produção</th>
                        <th>Pagamento</th>
                        <th>Registrado em</th>
                        <th>Total</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <strong className="font-data">
                              #{order.publicTicketNumber}
                            </strong>
                            <p className="muted text-xs mt-1">
                              {order.origin === "TOTEM" ? "Totem" : "Balcão"}
                            </p>
                          </td>
                          <td>
                            <StatusBadge status={order.status} />
                          </td>
                          <td>
                            <StatusBadge
                              status={order.payments[0]?.status ?? "AUTHORIZED"}
                            />
                          </td>
                          <td className="font-data text-xs">
                            {dateTime(order.createdAt)}
                          </td>
                          <td className="money whitespace-nowrap">
                            {money(order.totalCents)}
                          </td>
                          <td>
                            <Button
                              variant="outline"
                              onClick={(event) => {
                                trigger.current = event.currentTarget;
                                setSelected(order);
                              }}
                              aria-label={`Ver pedido ${order.publicTicketNumber}`}
                            >
                              <FileText />
                              Detalhes
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="responsive-list">
                  {items.map((order) => (
                    <div className="list-row" key={order.id}>
                      <div className="list-row-top">
                        <strong className="font-data">
                          #{order.publicTicketNumber}
                        </strong>
                        <span className="money">{money(order.totalCents)}</span>
                      </div>
                      <div className="inline-actions">
                        <StatusBadge status={order.status} />
                        <StatusBadge
                          status={order.payments[0]?.status ?? "AUTHORIZED"}
                        />
                      </div>
                      <span className="muted text-xs font-data">
                        {dateTime(order.createdAt)}
                      </span>
                      <Button
                        variant="outline"
                        onClick={(event) => {
                          trigger.current = event.currentTarget;
                          setSelected(order);
                        }}
                      >
                        Ver pedido {order.publicTicketNumber}
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <PageControls
            page={page}
            total={orders.data.total}
            onPage={setPage}
          />
        </>
      )}
      {printJobs.data && printJobs.data.items.length > 0 && (
        <section
          className="panel mb-6"
          aria-label="Fila de impressão do terminal"
        >
          <div className="panel-head">
            <h2 className="text-lg flex gap-2 items-center">
              <Printer size={19} />
              Impressões deste terminal
            </h2>
          </div>
          {printJobs.data.items.map((job) => (
            <div className="list-row" key={job.id}>
              <div className="list-row-top">
                <div>
                  <strong className="text-sm">
                    {job.kind === "SHIFT_REPORT"
                      ? "Relatório de turno"
                      : "Comprovante de pedido"}
                  </strong>
                  <p className="muted font-data text-xs mt-1">
                    {dateTime(job.createdAt)}
                  </p>
                </div>
                {job.status === "SIMULATED" ? (
                  <Badge variant="outline" className="pill" data-tone="warning">
                    <TriangleAlert aria-hidden="true" />
                    Impressão simulada
                  </Badge>
                ) : (
                  <StatusBadge status={job.status} />
                )}
              </div>
              {job.lastError && (
                <p className="inline-error text-sm">{job.lastError}</p>
              )}
              {job.status === "FAILED" && job.orderId && (
                <Button
                  variant="outline"
                  className="w-fit"
                  onClick={() => {
                    void central
                      .printOrder(job.orderId!)
                      .then(() => {
                        setMessage(
                          "Reimpressão solicitada. Confira o resultado na fila.",
                        );
                        invalidate();
                      })
                      .catch((cause) => setError(errorMessage(cause)));
                  }}
                >
                  <Printer />
                  Solicitar reimpressão
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          className="sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Pedido #{selected?.publicTicketNumber}</DialogTitle>
            <DialogDescription>
              Itens e referências do pagamento registrado.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="stack">
              <div className="inline-actions">
                <StatusBadge status={selected.status} />
                <StatusBadge
                  status={selected.payments[0]?.status ?? "AUTHORIZED"}
                />
                <StatusBadge status={selected.nfceStatus} />
              </div>
              {selected.payments.some(
                (payment) => payment.status === "AUTHORIZED",
              ) && (
                <p className="notice">
                  <CircleDashed size={18} />
                  Aguardando a confirmação de impressão do comprovante para
                  concluir o pagamento.
                </p>
              )}
              {selected.items.map((item) => (
                <div className="border-b pb-3" key={item.id}>
                  <div className="total-row">
                    <strong>
                      {item.quantity}× {item.productName}
                    </strong>
                    <span className="money text-sm">
                      {money(item.totalCents)}
                    </span>
                  </div>
                  <p className="muted text-sm">
                    {item.sizeName}
                    {item.additions
                      .map(
                        (addition) =>
                          ` · ${addition.quantity}× ${addition.name}`,
                      )
                      .join("")}
                  </p>
                  {item.notes && (
                    <p className="text-sm mt-1">Obs.: {item.notes}</p>
                  )}
                </div>
              ))}
              {selected.payments.map((payment) => (
                <div className="panel p-4 text-sm stack" key={payment.id}>
                  <div className="total-row">
                    <span>{methods[payment.method]}</span>
                    <strong className="money">
                      {money(payment.amountCents)}
                    </strong>
                  </div>
                  {payment.method === "CASH" && (
                    <p className="muted money">
                      Recebido {money(payment.amountTenderedCents ?? 0)} · troco{" "}
                      {money(payment.changeAmountCents ?? 0)}
                    </p>
                  )}
                  {payment.nsu && (
                    <p className="muted font-data text-xs break-all">
                      NSU {payment.nsu} · autorização{" "}
                      {payment.authorizationCode}
                    </p>
                  )}
                </div>
              ))}
              <div className="inline-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    void printOrder(selected);
                  }}
                >
                  <Printer />
                  Reimprimir comprovante
                </Button>
                {selected.status !== "CANCELLED" && (
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={() => {
                      setCancel(selected);
                      setError("");
                      setReason("");
                    }}
                  >
                    <SquareX />
                    Cancelar pedido
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(cancel)}
        onOpenChange={(open) => {
          if (!open && !busy) setCancel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancelar pedido #{cancel?.publicTicketNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O pagamento será estornado junto ao cancelamento. Informe o motivo
              e solicite a autorização de supervisor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void cancelOrder();
            }}
          >
            <Field label="Motivo do cancelamento">
              <Textarea
                value={reason}
                required
                minLength={3}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </Field>
            <FormError error={error} />
            <div className="inline-actions justify-end">
              <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
              <Button variant="destructive" type="submit" disabled={busy}>
                {busy ? "Cancelando..." : "Autorizar cancelamento e estorno"}
              </Button>
            </div>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
