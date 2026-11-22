import { useState } from "react";
import {
  Copy,
  Monitor,
  Plus,
  Printer,
  Settings2,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import type { KioskTerminal } from "@totem-pdv/shared-types";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  Field,
  FormError,
  Heading,
  LoadState,
  Notice,
  StatusBadge,
} from "@/components/common";
import { errorMessage, patch, post } from "@/lib/api";
import { dateTime } from "@/lib/utils";

export default function TerminalsPage() {
  const { terminals, terminalsLoading, terminalsError, user, invalidate } =
    useApp();
  const canManage = user.role !== "CASHIER";
  const [createOpen, setCreateOpen] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"PDV" | "TOTEM">("TOTEM");
  const [maintenance, setMaintenance] = useState<KioskTerminal | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credential, setCredential] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await post<KioskTerminal & { token?: string }>(
        "/terminals",
        { id, name, type },
      );
      setCreateOpen(false);
      setId("");
      setName("");
      if (result.token) setCredential(result.token);
      invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    if (!maintenance) return;
    if (reason.trim().length < 3) {
      setError("Informe o motivo da alteração para a auditoria.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await patch(
        `/terminals/${encodeURIComponent(maintenance.id)}/maintenance`,
        { enabled: maintenance.status !== "MAINTENANCE", message, reason },
      );
      setMaintenance(null);
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
        title="Terminais & Totens"
        description="Acompanhe conexão, impressora e pinpad. O modo manutenção é enviado ao próximo heartbeat."
      >
        {canManage && (
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              setError("");
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus />
                Cadastrar terminal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar terminal</DialogTitle>
                <DialogDescription>
                  Totens recebem uma credencial própria, exibida uma única vez
                  após o cadastro.
                </DialogDescription>
              </DialogHeader>
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void create();
                }}
              >
                <Field
                  label="Identificador do terminal"
                  value={id}
                  onChange={(event) => setId(event.target.value)}
                  placeholder="TOTEM-02"
                  required
                  minLength={2}
                  maxLength={64}
                />
                <Field
                  label="Nome do terminal"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                />
                <Field label="Tipo de terminal">
                  <select
                    className="border border-input rounded-md px-3 py-2"
                    value={type}
                    onChange={(event) =>
                      setType(event.target.value as typeof type)
                    }
                  >
                    <option value="TOTEM">Totem de autoatendimento</option>
                    <option value="PDV">PDV assistido</option>
                  </select>
                </Field>
                <FormError error={error} />
                <Button type="submit" disabled={busy}>
                  {busy ? "Cadastrando..." : "Cadastrar terminal"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </Heading>
      <LoadState
        loading={terminalsLoading && !terminals.length}
        error={terminalsError}
        retry={invalidate}
      />
      {!terminalsLoading && !terminalsError && !terminals.length ? (
        <div className="panel">
          <EmptyState
            title="Nenhum terminal cadastrado"
            description="Cadastre o primeiro PDV ou totem para iniciar a operação."
            action={canManage ? "Cadastrar terminal" : "Atualizar terminais"}
            onAction={() => (canManage ? setCreateOpen(true) : invalidate())}
          />
        </div>
      ) : (
        <div className="terminal-grid">
          {terminals.map((terminal) => (
            <article className="panel" key={terminal.id}>
              <div className="panel-head">
                <div>
                  <h2 className="text-lg">{terminal.name}</h2>
                  <p className="muted text-xs font-data mt-1">{terminal.id}</p>
                </div>
                <Monitor className="muted" size={22} />
              </div>
              <div className="panel-body stack">
                <div>
                  <StatusBadge status={terminal.status} />
                </div>
                <div className="terminal-meta text-sm">
                  <div>
                    <span className="muted flex gap-2 items-center">
                      <Printer size={16} />
                      Impressora
                    </span>
                    <StatusBadge
                      status={
                        terminal.printerStatus === "READY"
                          ? "PRINTER_READY"
                          : terminal.printerStatus
                      }
                    />
                  </div>
                  <div>
                    <span className="muted flex gap-2 items-center">
                      <CreditCard size={16} />
                      Pinpad
                    </span>
                    <StatusBadge status={terminal.pinpadStatus} />
                  </div>
                  <div>
                    <span className="muted">Tipo</span>
                    <strong>
                      {terminal.type === "TOTEM" ? "Autoatendimento" : "Balcão"}
                    </strong>
                  </div>
                  <div>
                    <span className="muted">Versão do app</span>
                    <span className="font-data text-xs">
                      {terminal.appVersion || "Não informada"}
                    </span>
                  </div>
                  <div>
                    <span className="muted">Último sinal</span>
                    <span className="font-data text-xs">
                      {terminal.lastHeartbeatAt
                        ? dateTime(terminal.lastHeartbeatAt)
                        : "Ainda sem sinal"}
                    </span>
                  </div>
                </div>
                {terminal.status === "MAINTENANCE" && (
                  <Notice title="Mensagem ao cliente">
                    {terminal.maintenanceMessage ||
                      "Terminal temporariamente indisponível."}
                  </Notice>
                )}
                <label className="check-row border-t pt-4">
                  <span className="flex gap-2 items-center font-semibold text-sm">
                    <Settings2 size={17} />
                    Modo manutenção
                  </span>
                  <Switch
                    checked={terminal.status === "MAINTENANCE"}
                    disabled={!canManage}
                    aria-label={`Modo manutenção de ${terminal.name}`}
                    onCheckedChange={() => {
                      setMaintenance(terminal);
                      setReason("");
                      setMessage(
                        terminal.maintenanceMessage ||
                          "Estamos preparando este terminal para atender você.",
                      );
                      setError("");
                    }}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
      <AlertDialog
        open={Boolean(maintenance)}
        onOpenChange={(open) => {
          if (!open && !busy) setMaintenance(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {maintenance?.status === "MAINTENANCE"
                ? "Retomar atendimento"
                : "Ativar modo manutenção"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              A alteração no terminal {maintenance?.name} ficará registrada na
              auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void toggle();
            }}
          >
            {maintenance?.status !== "MAINTENANCE" && (
              <Field label="Mensagem exibida ao cliente">
                <Textarea
                  maxLength={300}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </Field>
            )}
            <Field label="Motivo da alteração">
              <Textarea
                minLength={3}
                maxLength={500}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </Field>
            <FormError error={error} />
            <div className="inline-actions justify-end">
              <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
              <Button type="submit" disabled={busy}>
                {busy ? "Atualizando..." : "Confirmar alteração"}
              </Button>
            </div>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(credential)}
        onOpenChange={(open) => {
          if (!open) {
            setCredential(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credencial do totem</DialogTitle>
            <DialogDescription>
              Copie esta credencial para configurar o aplicativo. Ela não será
              exibida novamente e não deve ser compartilhada.
            </DialogDescription>
          </DialogHeader>
          <div className="stack">
            <ShieldCheck className="text-success" />
            <code className="font-data break-all text-xs p-4 bg-subtle rounded border">
              {credential}
            </code>
            <Button
              onClick={() => {
                if (credential)
                  void navigator.clipboard
                    .writeText(credential)
                    .then(() => setCopied(true));
              }}
            >
              <Copy />
              {copied ? "Credencial copiada" : "Copiar credencial"}
            </Button>
            <Button variant="outline" onClick={() => setCredential(null)}>
              Concluir configuração
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
