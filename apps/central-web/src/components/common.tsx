import {
  cloneElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  CircleCheck,
  CircleDashed,
  SquareX,
  TriangleAlert,
  PackageOpen,
  RotateCw,
  Clock3,
  CookingPot,
  CheckCheck,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";

const states = {
  ONLINE: ["Online", CircleCheck, "success"],
  OFFLINE: ["Offline", WifiOff, "warning"],
  MAINTENANCE: ["Em manutenção", TriangleAlert, "warning"],
  OPEN: ["Turno aberto", CircleDashed, "warning"],
  CLOSED: ["Turno fechado", CircleCheck, "success"],
  RECEIVED: ["Recebido", Clock3, "neutral"],
  PREPARING: ["Em preparo", CookingPot, "warning"],
  READY: ["Pronto", CircleCheck, "success"],
  DELIVERED: ["Entregue", CheckCheck, "success"],
  CANCELLED: ["Cancelado", SquareX, "danger"],
  INITIALIZING: ["Iniciando", CircleDashed, "warning"],
  WAITING_CARD_OR_QR: ["Aguardando cartão ou Pix", CircleDashed, "warning"],
  PROCESSING: ["Processando", CircleDashed, "warning"],
  AUTHORIZED: ["Autorizado, aguarda impressão", CircleDashed, "warning"],
  CONFIRMED: ["Confirmado", CircleCheck, "success"],
  REVERSED: ["Estornado", SquareX, "danger"],
  FAILED: ["Falhou", SquareX, "danger"],
  QUEUED: ["Na fila de impressão", CircleDashed, "warning"],
  CLAIMED: ["Impressão em andamento", CircleDashed, "warning"],
  PRINTED: ["Impresso", CircleCheck, "success"],
  NOT_EMITTED: ["Nota não emitida", CircleDashed, "warning"],
  SIMULATED: ["Fiscal simulado", ShieldCheck, "neutral"],
  ACTIVE: ["Ativo", CircleCheck, "success"],
  INACTIVE: ["Desativado", SquareX, "neutral"],
  CONNECTED: ["Pinpad conectado", CircleCheck, "success"],
  DISCONNECTED: ["Pinpad desconectado", SquareX, "danger"],
  PRINTER_READY: ["Impressora pronta", CircleCheck, "success"],
  OUT_OF_PAPER: ["Sem papel", TriangleAlert, "danger"],
  ERROR: ["Erro na impressora", SquareX, "danger"],
} as const;
export function StatusBadge({ status }: { status: string }) {
  const [label, Icon, tone] = states[status as keyof typeof states] ?? [
    status,
    CircleDashed,
    "neutral",
  ];
  return (
    <Badge variant="outline" className="pill" data-tone={tone}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
export const methods = {
  CASH: "Dinheiro",
  CREDIT_CARD: "Crédito",
  DEBIT_CARD: "Débito",
  PIX: "Pix",
} as const;
export const roles = {
  OWNER: "Dono",
  MANAGER: "Gerente",
  CASHIER: "Atendente",
} as const;
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="inline-actions">{children}</div>}
    </div>
  );
}
export function Field({
  label,
  error,
  help,
  children,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  help?: string;
  children?: ReactElement;
}) {
  const generated = useId();
  const id = input.id ?? generated;
  const described = error ? `${id}-error` : help ? `${id}-help` : undefined;
  const invalid = error ? true : (input["aria-invalid"] ?? false);
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      {children ? (
        cloneElement(children as ReactElement<Record<string, unknown>>, {
          id,
          "aria-invalid": invalid,
          "aria-describedby": described,
        })
      ) : (
        <Input
          {...input}
          id={id}
          aria-invalid={invalid}
          aria-describedby={described}
        />
      )}
      {help && (
        <p id={`${id}-help`} className="field-help">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="inline-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function FormError({ error }: { error?: string | null }) {
  return error ? (
    <p role="alert" className="inline-error">
      <TriangleAlert aria-hidden="true" />
      {error}
    </p>
  ) : null;
}
export function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <PackageOpen aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action && onAction && (
        <Button variant="outline" onClick={onAction}>
          <RotateCw aria-hidden="true" />
          {action}
        </Button>
      )}
    </div>
  );
}
export function LoadState({
  loading,
  error,
  retry,
  kind = "table",
}: {
  loading: boolean;
  error?: string;
  retry: () => void;
  kind?: "table" | "products";
}) {
  if (error)
    return (
      <div className="panel">
        <EmptyState
          title="Não foi possível carregar"
          description={error}
          action="Tentar novamente"
          onAction={retry}
        />
      </div>
    );
  if (!loading) return null;
  return kind === "products" ? (
    <div className="product-grid" aria-label="Carregando produtos">
      {Array.from({ length: 6 }, (_, i) => (
        <div className="panel overflow-hidden" key={i}>
          <Skeleton className="h-36 w-full" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="panel p-5 space-y-4" aria-label="Carregando dados">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton className="h-12 w-full" key={i} />
      ))}
    </div>
  );
}
export function Notice({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="notice">
      <TriangleAlert aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}
export function PageControls({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex justify-between items-center gap-3 mt-4">
      <span className="muted text-sm font-data">{total} registros</span>
      <div className="inline-actions">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </Button>
        <span className="font-data text-sm">Página {page}</span>
        <Button
          variant="outline"
          disabled={page * 25 >= total}
          onClick={() => onPage(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
