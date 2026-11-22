import { useRef, useState } from "react";
import { FilePenLine, Plus, ShieldCheck } from "lucide-react";
import {
  userInputSchema,
  userUpdateInputSchema,
  type Role,
  type User,
} from "@totem-pdv/shared-types";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  EmptyState,
  Field,
  FormError,
  Heading,
  LoadState,
  Notice,
  roles,
  StatusBadge,
} from "@/components/common";
import { useResource } from "@/hooks/use-resource";
import { central, type Collection } from "@/lib/services";
import { errorMessage, patch } from "@/lib/api";

export default function UsersPage() {
  const { user, revision, invalidate } = useApp();
  const resource = useResource<Collection<User>>(
    "/users?page=1&pageSize=100",
    revision,
  );
  const canEdit = user.role === "OWNER";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("CASHIER");
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const trigger = useRef<HTMLElement | null>(null);
  const edit = (value: User | null, target: HTMLElement) => {
    setEditing(value);
    setName(value?.name ?? "");
    setEmail(value?.email ?? "");
    setRole(value?.role ?? "CASHIER");
    setActive(value?.active ?? true);
    setPassword("");
    setPin("");
    setError("");
    setErrors({});
    trigger.current = target;
    setOpen(true);
  };
  const save = async () => {
    const payload = {
      name,
      email,
      role,
      active,
      ...(password ? { password } : {}),
      ...(pin ? { supervisorPin: pin } : {}),
    };
    const parsed = editing
      ? userUpdateInputSchema.safeParse(payload)
      : userInputSchema.safeParse({ ...payload, password });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join("."),
            issue.message,
          ]),
        ),
      );
      setError("Revise os dados do usuário.");
      return;
    }
    setBusy(true);
    setError("");
    setErrors({});
    try {
      if (editing) await patch(`/users/${editing.id}`, parsed.data);
      else await central.createUser(userInputSchema.parse(parsed.data));
      setOpen(false);
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
        title="Usuários & Permissões"
        description="Cada pessoa tem seu acesso. Ações restritas exigem um supervisor identificado."
      >
        {canEdit && (
          <Button onClick={(event) => edit(null, event.currentTarget)}>
            <Plus />
            Novo usuário
          </Button>
        )}
      </Heading>
      {!canEdit && (
        <Notice title="Consulta de permissões">
          Somente o dono pode criar usuários, alterar perfis e redefinir
          credenciais.
        </Notice>
      )}
      <LoadState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.refresh}
      />
      {resource.data && (
        <div className="panel">
          {!resource.data.items.length ? (
            <EmptyState
              title="Nenhum usuário encontrado"
              description="Os acessos cadastrados aparecerão aqui."
              action="Atualizar usuários"
              onAction={resource.refresh}
            />
          ) : (
            resource.data.items.map((item) => (
              <div className="list-row" key={item.id}>
                <div className="list-row-top">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted text-sm break-all">{item.email}</p>
                  </div>
                  <StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} />
                </div>
                <div className="flex justify-between items-center gap-3">
                  <p className="muted flex gap-2 items-center text-sm">
                    <ShieldCheck size={17} />
                    {roles[item.role]}
                  </p>
                  {canEdit && (
                    <Button
                      variant="outline"
                      onClick={(event) => edit(item, event.currentTarget)}
                      aria-label={`Editar acesso de ${item.name}`}
                    >
                      <FilePenLine />
                      Editar acesso
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <SheetContent
          className="w-full sm:max-w-lg overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>
              {editing ? "Editar acesso" : "Novo usuário"}
            </SheetTitle>
            <SheetDescription>
              Senhas e PINs são armazenados com hash. Eles nunca são exibidos
              novamente.
            </SheetDescription>
          </SheetHeader>
          <form
            className="stack mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Field
              label="Nome completo"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              error={errors.name}
            />
            <Field
              label="E-mail do usuário"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              error={errors.email}
            />
            <Field label="Perfil de acesso">
              <select
                className="border border-input rounded-md px-3"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {(Object.keys(roles) as Role[]).map((value) => (
                  <option value={value} key={value}>
                    {roles[value]}
                  </option>
                ))}
              </select>
            </Field>
            <p className="muted text-sm">
              {role === "OWNER"
                ? "Administra a empresa, usuários e toda a operação."
                : role === "MANAGER"
                  ? "Gerencia catálogo, terminais, cozinha e autoriza operações de caixa."
                  : "Registra vendas, acompanha pedidos e opera seus próprios turnos."}
            </p>
            <Field
              label={editing ? "Nova senha (opcional)" : "Senha de acesso"}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required={!editing}
              minLength={password ? 12 : undefined}
              maxLength={128}
              help="Use pelo menos 12 caracteres."
              error={errors.password}
            />
            {role !== "CASHIER" && (
              <Field
                label="PIN de supervisor"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                minLength={pin ? 6 : undefined}
                maxLength={12}
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                help={
                  editing
                    ? "Deixe vazio para manter o PIN atual. Um novo PIN deve ter 6 a 12 dígitos."
                    : "Defina 6 a 12 dígitos para autorizar operações restritas."
                }
                error={errors.supervisorPin}
              />
            )}
            <label className="check-row">
              <strong>Usuário ativo</strong>
              <Switch
                checked={active}
                onCheckedChange={setActive}
                aria-label="Usuário ativo"
              />
            </label>
            <FormError error={error} />
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando..." : "Salvar acesso"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
