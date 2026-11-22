import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleCheck,
  EyeOff,
  LockKeyhole,
  Plus,
  Printer,
  Wallet,
} from "lucide-react";
import {
  type CashMovement,
  type PaymentMethod,
  type ShiftReport,
  type ShiftSummary,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { post, errorMessage } from "@/lib/api";
import { central, type Collection, type CurrentShift } from "@/lib/services";
import { cents, dateTime, money } from "@/lib/utils";
import {
  beginCashMovement,
  pendingCashMovement,
  submitCashMovement,
  type CashMovementIntent,
} from "@/lib/cash-movement";

export default function CashPage() {
  const { user, terminalId, terminals, revision, invalidate, authorize } =
    useApp();
  const current = useResource<CurrentShift>(
    terminalId
      ? `/shifts/current?terminalId=${encodeURIComponent(terminalId)}`
      : null,
    revision,
  );
  const history = useResource<Collection<ShiftSummary>>(
    "/shifts?page=1&pageSize=25",
    revision,
  );
  const shift = current.data?.shift;
  const movements = useResource<Collection<CashMovement>>(
    shift ? `/shifts/${shift.id}/movements?page=1&pageSize=100` : null,
    revision,
  );
  const [openDialog, setOpenDialog] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [initial, setInitial] = useState("");
  const [moveType, setMoveType] = useState<"SUPPLY" | "BLEED_SANGRIA">(
    "BLEED_SANGRIA",
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [movementRecovery] = useState(() => {
    try {
      return { intent: pendingCashMovement(user.id), error: "" };
    } catch (cause) {
      return { intent: null, error: errorMessage(cause) };
    }
  });
  const [movementIntent, setMovementIntent] =
    useState<CashMovementIntent | null>(movementRecovery.intent);
  const [declared, setDeclared] = useState<Record<PaymentMethod, string>>({
    CASH: "",
    CREDIT_CARD: "",
    DEBIT_CARD: "",
    PIX: "",
  });
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<ShiftReport | null>(null);
  const movementFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (sessionStorage.getItem("central-open-movement")) {
      sessionStorage.removeItem("central-open-movement");
      setMovementOpen(true);
    }
  }, []);
  useLayoutEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "F8") {
        event.preventDefault();
        if (
          busy ||
          movementOpen ||
          closeOpen ||
          openDialog ||
          movementRecovery.error
        )
          return;
        movementFocus.current = document.activeElement as HTMLElement;
        setMovementOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, movementOpen, closeOpen, openDialog, movementRecovery.error]);
  const openShift = async () => {
    setBusy(true);
    setError("");
    try {
      await central.openShift(terminalId, cents(initial || "0"));
      setOpenDialog(false);
      setInitial("");
      invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const move = async () => {
    if (movementRecovery.error) {
      setError(movementRecovery.error);
      return;
    }
    if (!movementIntent && !shift) return;
    if (
      !movementIntent &&
      (movementReason.trim().length < 3 ||
        !Number.isFinite(cents(amount)) ||
        cents(amount) <= 0)
    ) {
      setError("Informe um valor maior que zero e o motivo da movimentação.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const intent =
        movementIntent ??
        beginCashMovement({
          actorId: user.id,
          shiftId: shift!.id,
          terminalId: shift!.terminalId,
          terminalName:
            terminals.find((terminal) => terminal.id === shift!.terminalId)
              ?.name ?? shift!.terminalId,
          type: moveType,
          amountCents: cents(amount),
          reason: movementReason,
        });
      setMovementIntent(intent);
      await submitCashMovement(intent, authorize);
      setMovementIntent(pendingCashMovement(user.id));
      setMovementOpen(false);
      setAmount("");
      setMovementReason("");
      invalidate();
      setMessage(
        movementIntent
          ? "Movimentação anterior conferida sem duplicar lançamento."
          : "Movimentação registrada e auditada.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
      try {
        setMovementIntent(pendingCashMovement(user.id));
      } catch (storageCause) {
        setError(errorMessage(storageCause));
      }
    } finally {
      setBusy(false);
    }
  };
  const closeShift = async () => {
    if (!shift) return;
    setBusy(true);
    setError("");
    try {
      const token = await authorize("SHIFT_CLOSED", shift.id);
      const result = await post<ShiftReport>(
        `/shifts/${shift.id}/close`,
        {
          declared: Object.fromEntries(
            Object.entries(declared).map(([method, value]) => [
              method,
              cents(value),
            ]),
          ),
          reason,
        },
        token,
      );
      setReport(result);
      setCloseOpen(false);
      setConfirmClose(false);
      setReason("");
      invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const print = async () => {
    if (!report) return;
    try {
      await central.printReport(report.id);
      setMessage("Relatório enviado para a fila de impressão.");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <>
      <Heading
        title="Caixa & Turnos"
        description="Organize o fundo de troco, registre movimentos e encerre com conferência cega."
      />
      {message && (
        <p role="status" className="mb-5 text-success flex gap-2 items-center">
          <CircleCheck size={18} />
          {message}
        </p>
      )}
      {movementRecovery.error && (
        <Notice title="Movimentação local precisa de conferência">
          {movementRecovery.error}
        </Notice>
      )}
      {movementIntent && (
        <Notice title="Há uma movimentação aguardando conferência">
          {movementIntent.terminalName}:{" "}
          {movementIntent.payload.type === "SUPPLY" ? "suprimento" : "sangria"}{" "}
          de {money(movementIntent.payload.amountCents)} preservado desde{" "}
          {dateTime(movementIntent.createdAt)}.{" "}
          <button
            className="underline font-semibold"
            disabled={busy}
            onClick={(event) => {
              movementFocus.current = event.currentTarget;
              setMovementOpen(true);
            }}
          >
            Conferir movimentação anterior
          </button>
          . Uma nova movimentação será liberada após esta conferência.
        </Notice>
      )}
      <LoadState
        loading={current.loading && !current.data}
        error={current.error}
        retry={current.refresh}
      />
      {current.data && (
        <div className="shift-layout">
          <section className="panel">
            <div className="panel-head">
              <h2>Turno atual</h2>
              <StatusBadge status={shift ? "OPEN" : "CLOSED"} />
            </div>
            <div className="panel-body stack">
              <div>
                <p className="muted text-sm">Terminal de operação</p>
                <h3 className="mt-1">
                  {terminals.find((terminal) => terminal.id === terminalId)
                    ?.name ?? "Selecione um terminal"}
                </h3>
              </div>
              {shift ? (
                <>
                  <div className="form-grid">
                    <div>
                      <p className="muted text-xs">Operador</p>
                      <p className="font-semibold mt-1">{shift.operatorName}</p>
                    </div>
                    <div>
                      <p className="muted text-xs">Aberto em</p>
                      <p className="font-data text-sm mt-1">
                        {dateTime(shift.openedAt)}
                      </p>
                    </div>
                  </div>
                  <Notice title="Conferência cega ativa">
                    Os totais calculados pela Central serão apresentados após a
                    declaração e o fechamento do turno.
                  </Notice>
                  <div className="inline-actions">
                    <Button
                      variant="outline"
                      disabled={busy || Boolean(movementRecovery.error)}
                      onClick={(event) => {
                        movementFocus.current = event.currentTarget;
                        if (!movementIntent) setError("");
                        setMovementOpen(true);
                      }}
                    >
                      <ArrowUpFromLine />
                      Sangria / Suprimento{" "}
                      <kbd className="muted text-xs">F8</kbd>
                    </Button>
                    <Dialog
                      open={closeOpen}
                      onOpenChange={(open) => {
                        if (!busy) {
                          setCloseOpen(open);
                          setConfirmClose(false);
                          setError("");
                          setReason("");
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          disabled={
                            busy ||
                            Boolean(movementIntent) ||
                            Boolean(movementRecovery.error)
                          }
                        >
                          <LockKeyhole />
                          Fechamento cego
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                          <DialogTitle>
                            {confirmClose
                              ? "Confirmar valores contados"
                              : "Fechamento cego do turno"}
                          </DialogTitle>
                          <DialogDescription>
                            {confirmClose
                              ? "Confira sua declaração. O fechamento exige autorização e não pode ser editado depois."
                              : "Conte os valores de cada forma de pagamento e informe abaixo. O saldo calculado permanece oculto."}
                          </DialogDescription>
                        </DialogHeader>
                        <form
                          className="stack"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (confirmClose) {
                              void closeShift();
                              return;
                            }
                            if (reason.trim().length < 3) {
                              setError("Informe o motivo do fechamento.");
                              return;
                            }
                            setConfirmClose(true);
                            setError("");
                          }}
                        >
                          <div className="form-grid">
                            {(Object.keys(methods) as PaymentMethod[]).map(
                              (method) => (
                                <Field
                                  key={method}
                                  label={`${methods[method]} contado (R$)`}
                                  help={
                                    method === "CASH"
                                      ? "Valor em dinheiro contado no caixa."
                                      : "Valor líquido de vendas e estornos; pode ser negativo."
                                  }
                                  type="number"
                                  inputMode="decimal"
                                  min={method === "CASH" ? 0 : undefined}
                                  step="0.01"
                                  required
                                  readOnly={confirmClose}
                                  value={declared[method]}
                                  onChange={(event) =>
                                    setDeclared((values) => ({
                                      ...values,
                                      [method]: event.target.value,
                                    }))
                                  }
                                />
                              ),
                            )}
                          </div>
                          <Field label="Motivo do fechamento">
                            <Textarea
                              value={reason}
                              required
                              minLength={3}
                              maxLength={500}
                              readOnly={confirmClose}
                              onChange={(event) =>
                                setReason(event.target.value)
                              }
                            />
                          </Field>
                          <FormError error={error} />
                          <div className="flex gap-3 justify-end">
                            {confirmClose && (
                              <Button
                                variant="outline"
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmClose(false)}
                              >
                                Revisar contagem
                              </Button>
                            )}
                            <Button type="submit" disabled={busy}>
                              <EyeOff />
                              {busy
                                ? "Fechando turno..."
                                : confirmClose
                                  ? "Autorizar e fechar turno"
                                  : "Conferir declaração"}
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">
                    Inicie o turno com o valor disponível para troco. Cada
                    terminal pode ter somente um turno aberto.
                  </p>
                  <Dialog
                    open={openDialog}
                    onOpenChange={(open) => {
                      if (!busy) {
                        setOpenDialog(open);
                        setError("");
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button disabled={!terminalId}>
                        <Plus />
                        Abrir turno neste terminal
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Abrir turno</DialogTitle>
                        <DialogDescription>
                          O fundo inicial será registrado como suprimento do
                          caixa.
                        </DialogDescription>
                      </DialogHeader>
                      <form
                        className="stack"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void openShift();
                        }}
                      >
                        <Field
                          label="Fundo de troco inicial (R$)"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          required
                          value={initial}
                          onChange={(event) => setInitial(event.target.value)}
                        />
                        <FormError error={error} />
                        <Button type="submit" disabled={busy}>
                          {busy ? "Abrindo..." : "Confirmar abertura"}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </section>
          <aside className="panel">
            <div className="panel-head">
              <h2 className="text-lg">Rotina do caixa</h2>
              <Wallet className="muted" size={20} />
            </div>
            <div className="panel-body stack">
              <p className="muted">
                Suprimento adiciona dinheiro para troco. Sangria retira valores
                do caixa com autorização.
              </p>
              <p className="muted">
                O fechamento registra valores contados por meio de pagamento e
                apresenta quebras ou sobras após a confirmação.
              </p>
              <p className="text-sm flex gap-2 items-center">
                <CircleCheck size={17} className="text-success" />
                Operações com registro de auditoria
              </p>
            </div>
          </aside>
        </div>
      )}
      {shift && (
        <section className="panel mt-6">
          <div className="panel-head">
            <h2>Movimentações deste turno</h2>
          </div>
          <LoadState
            loading={movements.loading && !movements.data}
            error={movements.error}
            retry={movements.refresh}
          />
          {movements.data &&
            (!movements.data.items.length ? (
              <EmptyState
                title="Nenhuma movimentação"
                description="As vendas e os movimentos autorizados aparecerão aqui."
              />
            ) : (
              <>
                <div className="desktop-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Movimentação</th>
                        <th>Motivo</th>
                        <th>Data e hora</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.data.items.map((movement) => (
                        <tr key={movement.id}>
                          <td>{movementLabels[movement.type]}</td>
                          <td className="max-w-72 break-words">
                            {movement.reason}
                          </td>
                          <td className="font-data text-xs">
                            {dateTime(movement.createdAt)}
                          </td>
                          <td className="money whitespace-nowrap">
                            {["BLEED_SANGRIA", "ORDER_REFUND"].includes(
                              movement.type,
                            )
                              ? "− "
                              : "+ "}
                            {money(movement.amountCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="responsive-list">
                  {movements.data.items.map((movement) => (
                    <div className="list-row" key={movement.id}>
                      <div className="list-row-top">
                        <strong>{movementLabels[movement.type]}</strong>
                        <span className="money">
                          {money(movement.amountCents)}
                        </span>
                      </div>
                      <p className="muted text-sm break-words">
                        {movement.reason}
                      </p>
                      <span className="font-data text-xs muted">
                        {dateTime(movement.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ))}
        </section>
      )}
      <section className="panel mt-6">
        <div className="panel-head">
          <h2>Histórico de turnos</h2>
        </div>
        <LoadState
          loading={history.loading && !history.data}
          error={history.error}
          retry={history.refresh}
        />
        {history.data &&
          (!history.data.items.length ? (
            <EmptyState
              title="Seu primeiro turno começa aqui"
              description="Abra o caixa para iniciar o histórico da operação."
              action="Abrir turno"
              onAction={() => setOpenDialog(true)}
            />
          ) : (
            <div>
              {history.data.items.map((item) => (
                <div className="list-row" key={item.id}>
                  <div className="list-row-top">
                    <div>
                      <strong>{item.terminalName ?? item.terminalId}</strong>
                      <p className="muted text-sm mt-1">
                        {item.operatorName} ·{" "}
                        <span className="font-data text-xs">
                          {dateTime(item.openedAt)}
                        </span>
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  {item.status === "CLOSED" && (
                    <Button
                      variant="outline"
                      className="w-fit"
                      onClick={() => {
                        void central
                          .report(item.id)
                          .then(setReport)
                          .catch((cause) => setError(errorMessage(cause)));
                      }}
                    >
                      Ver relatório do turno
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ))}
      </section>
      <Dialog
        open={movementOpen}
        onOpenChange={(open) => {
          if (!busy) {
            setMovementOpen(open);
            if (!movementIntent) setError("");
          }
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            movementFocus.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Movimentação de caixa</DialogTitle>
            <DialogDescription>
              Movimentos exigem motivo e autorização de gerente ou dono.
            </DialogDescription>
          </DialogHeader>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void move();
            }}
          >
            {movementIntent && (
              <Notice title="Movimentação preservada">
                {movementIntent.terminalName} ·{" "}
                {movementIntent.payload.type === "SUPPLY"
                  ? "Suprimento"
                  : "Sangria"}{" "}
                de {money(movementIntent.payload.amountCents)}. A chave e os
                dados originais serão reenviados, inclusive se o turno já
                estiver fechado.
              </Notice>
            )}
            <fieldset
              className="stack"
              disabled={
                busy ||
                Boolean(movementIntent) ||
                Boolean(movementRecovery.error)
              }
            >
              <Tabs
                value={movementIntent?.payload.type ?? moveType}
                onValueChange={(value) => setMoveType(value as typeof moveType)}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="BLEED_SANGRIA" className="flex-1 gap-2">
                    <ArrowUpFromLine size={16} />
                    Sangria
                  </TabsTrigger>
                  <TabsTrigger value="SUPPLY" className="flex-1 gap-2">
                    <ArrowDownToLine size={16} />
                    Suprimento
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Field
                label="Valor da movimentação (R$)"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                required
                value={
                  movementIntent
                    ? (movementIntent.payload.amountCents / 100).toFixed(2)
                    : amount
                }
                onChange={(event) => setAmount(event.target.value)}
              />
              <Field
                label="Motivo da movimentação"
                help="Descreva a finalidade para a auditoria."
              >
                <Textarea
                  minLength={3}
                  maxLength={500}
                  required
                  value={movementIntent?.payload.reason ?? movementReason}
                  onChange={(event) => setMovementReason(event.target.value)}
                />
              </Field>
            </fieldset>
            <FormError error={error || movementRecovery.error} />
            <Button type="submit" disabled={busy}>
              {busy
                ? "Registrando..."
                : movementIntent
                  ? "Reenviar a mesma movimentação"
                  : "Solicitar autorização e registrar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(report)}
        onOpenChange={(open) => {
          if (!open) setReport(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Relatório do turno fechado</DialogTitle>
            <DialogDescription>
              Valores declarados e conferência calculada após o fechamento.
            </DialogDescription>
          </DialogHeader>
          {report && (
            <div className="stack">
              <StatusBadge status="CLOSED" />
              {report.reconciliations.map((item) => (
                <div className="panel p-4 grid gap-3" key={item.method}>
                  <strong>{methods[item.method]}</strong>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="muted">
                      Calculado
                      <p className="money text-ink mt-1">
                        {money(item.systemCalculatedAmountCents)}
                      </p>
                    </div>
                    <div className="muted">
                      Contado
                      <p className="money text-ink mt-1">
                        {money(item.operatorDeclaredAmountCents)}
                      </p>
                    </div>
                    <div
                      className={
                        item.differenceCents ? "text-warning" : "text-success"
                      }
                    >
                      Diferença
                      <p className="money mt-1">
                        {money(item.differenceCents)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <FormError error={error} />
              <Button
                onClick={() => {
                  void print();
                }}
              >
                <Printer />
                Imprimir relatório do turno
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
const movementLabels = {
  INITIAL_SUPPLY: "Fundo inicial",
  SUPPLY: "Suprimento",
  BLEED_SANGRIA: "Sangria",
  ORDER_PAYMENT: "Venda em dinheiro",
  ORDER_REFUND: "Estorno em dinheiro",
};
