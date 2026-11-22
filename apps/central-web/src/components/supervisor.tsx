import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { SupervisorInput } from "@totem-pdv/shared-types";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Field, FormError } from "./common";
import { central } from "@/lib/services";
import { errorMessage } from "@/lib/api";
export interface SupervisorRequest {
  action: SupervisorInput["action"];
  resourceId: string;
  returnFocus: HTMLElement | null;
  resolve: (token: string | null) => void;
}
export function SupervisorDialog({
  request,
  close,
}: {
  request: SupervisorRequest | null;
  close: () => void;
}) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const focusTarget = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (request) focusTarget.current = request.returnFocus;
  }, [request]);
  const dismiss = () => {
    request?.resolve(null);
    setPin("");
    setError("");
    close();
  };
  return (
    <AlertDialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open && !busy) dismiss();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => focusTarget.current?.focus());
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex gap-2 items-center">
            <ShieldCheck />
            Autorização de supervisor
          </AlertDialogTitle>
          <AlertDialogDescription>
            Um gerente ou dono deve autorizar esta operação com seu PIN. A
            autorização fica registrada na auditoria.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!request) return;
            setBusy(true);
            setError("");
            void central
              .supervisor({
                email,
                pin,
                action: request.action,
                resourceId: request.resourceId,
              })
              .then((grant) => {
                request.resolve(grant.token);
                setPin("");
                close();
              })
              .catch((cause) => setError(errorMessage(cause)))
              .finally(() => setBusy(false));
          }}
        >
          <Field
            label="E-mail do supervisor"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            error={error || undefined}
          />
          <Field
            label="PIN do supervisor"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            minLength={4}
            maxLength={12}
            error={error || undefined}
          />
          <FormError error={error} />
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel disabled={busy} onClick={dismiss}>
              Voltar
            </AlertDialogCancel>
            <Button type="submit" disabled={busy}>
              {busy ? "Autorizando..." : "Autorizar operação"}
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
