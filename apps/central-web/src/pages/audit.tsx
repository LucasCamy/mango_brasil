import { useRef, useState } from "react";
import { FileSearch, ShieldCheck } from "lucide-react";
import type { AuditLog } from "@totem-pdv/shared-types";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  Heading,
  LoadState,
  PageControls,
} from "@/components/common";
import { useResource } from "@/hooks/use-resource";
import type { Collection } from "@/lib/services";
import { dateTime } from "@/lib/utils";
const actions: Record<string, string> = {
  ORDER_CANCELLED: "Pedido cancelado",
  PAYMENT_REVERSED: "Pagamento estornado",
  SHIFT_CLOSED: "Turno fechado",
  CASH_BLEED: "Sangria de caixa",
  CASH_SUPPLY: "Suprimento de caixa",
  PRODUCT_PRICE_CHANGED: "Preço alterado",
  PRODUCT_CREATED: "Produto cadastrado",
  PRODUCT_UPDATED: "Produto atualizado",
  KIOSK_MAINTENANCE_TOGGLED: "Manutenção alterada",
  USER_CREATED: "Usuário cadastrado",
  USER_UPDATED: "Acesso atualizado",
  COMPANY_SETTINGS_UPDATED: "Empresa atualizada",
  TERMINAL_CREATED: "Terminal cadastrado",
};
export default function AuditPage() {
  const { revision } = useApp();
  const [page, setPage] = useState(1);
  const resource = useResource<Collection<AuditLog>>(
    `/audit-logs?page=${page}&pageSize=25`,
    revision,
  );
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  return (
    <>
      <Heading
        title="Auditoria da operação"
        description="Histórico imutável de cancelamentos, estornos, caixa, permissões e alterações de cadastro."
      />
      <LoadState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.refresh}
      />
      {resource.data && (
        <>
          <div className="panel">
            {!resource.data.items.length ? (
              <EmptyState
                title="A auditoria começa com a operação"
                description="Ações auditadas aparecerão aqui com autor, motivo e autorização."
                action="Atualizar auditoria"
                onAction={resource.refresh}
              />
            ) : (
              resource.data.items.map((log) => (
                <div className="list-row" key={log.id}>
                  <div className="list-row-top">
                    <div>
                      <strong className="flex gap-2 items-center">
                        <ShieldCheck size={18} className="text-action" />
                        {actions[log.action] ?? log.action}
                      </strong>
                      <p className="muted text-sm mt-1">
                        {log.actorName ?? log.actorUserId}
                      </p>
                    </div>
                    <span className="muted font-data text-xs whitespace-nowrap">
                      {dateTime(log.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm break-words">{log.reason}</p>
                  <div className="flex justify-between items-center gap-3">
                    <p className="muted text-xs break-all">
                      {log.authorizedByUserId
                        ? `Autorizado por ${log.authorizedByUserId}`
                        : "Ação de acordo com o perfil de acesso"}
                    </p>
                    <Button
                      variant="outline"
                      onClick={(event) => {
                        trigger.current = event.currentTarget;
                        setSelected(log);
                      }}
                    >
                      <FileSearch />
                      Ver alterações
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <PageControls
            page={page}
            total={resource.data.total}
            onPage={setPage}
          />
        </>
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          className="sm:max-w-2xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {selected
                ? (actions[selected.action] ?? selected.action)
                : "Detalhe da auditoria"}
            </DialogTitle>
            <DialogDescription>
              Registro anterior e posterior. Este histórico não pode ser
              editado.
            </DialogDescription>
          </DialogHeader>
          <div className="stack">
            <div>
              <h3 className="text-sm mb-2">Antes</h3>
              <pre className="font-data text-xs whitespace-pre-wrap break-all bg-subtle p-4 rounded">
                {JSON.stringify(selected?.before, null, 2) ??
                  "Sem registro anterior"}
              </pre>
            </div>
            <div>
              <h3 className="text-sm mb-2">Depois</h3>
              <pre className="font-data text-xs whitespace-pre-wrap break-all bg-subtle p-4 rounded">
                {JSON.stringify(selected?.after, null, 2) ??
                  "Sem registro posterior"}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
