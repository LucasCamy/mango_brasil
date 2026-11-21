import { useEffect, useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { Check, Save } from "lucide-react";
import {
  companySettingsInputSchema,
  type CompanySettings,
  type CompanySettingsInput,
} from "@totem-pdv/shared-types";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import {
  FormError,
  Heading,
  LoadState,
  Notice,
  StatusBadge,
} from "@/components/common";
import { useResource } from "@/hooks/use-resource";
import { central } from "@/lib/services";
import { ApiError, errorMessage } from "@/lib/api";

const toInput = (settings: CompanySettings): CompanySettingsInput => ({
  legalName: settings.legalName,
  tradeName: settings.tradeName,
  cnpj: settings.cnpj,
  stateRegistration: settings.stateRegistration,
  address: { ...settings.address },
  taxRegime: settings.taxRegime,
  cscId: settings.cscId,
  nfceSeries: settings.nfceSeries,
  nextNfceNumber: settings.nextNfceNumber,
  acceptsCashOnPdv: settings.acceptsCashOnPdv,
  inactivityTimeoutSeconds: settings.inactivityTimeoutSeconds,
});
export default function SettingsPage() {
  const { user, revision, invalidate } = useApp();
  const settings = useResource<CompanySettings>("/settings", revision);
  const form = useForm<CompanySettingsInput>();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const canEdit = user.role === "OWNER";
  useEffect(() => {
    if (settings.data && !form.formState.isDirty)
      form.reset(toInput(settings.data));
  }, [settings.data, form]);
  const save = async (input: CompanySettingsInput) => {
    setError("");
    setSaved(false);
    form.clearErrors();
    const parsed = companySettingsInputSchema.safeParse({
      ...input,
      cscToken: input.cscToken || undefined,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        form.setError(issue.path.join(".") as Path<CompanySettingsInput>, {
          message: issue.message,
        });
      setError("Revise os dados da empresa antes de salvar.");
      return;
    }
    setBusy(true);
    try {
      const result = await central.saveSettings(parsed.data);
      form.reset(toInput(result));
      setSaved(true);
      invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError)
        for (const [path, errors] of Object.entries(cause.problem.errors ?? {}))
          form.setError(path as Path<CompanySettingsInput>, {
            message: errors.join(" "),
          });
    } finally {
      setBusy(false);
    }
  };
  const input = (
    name: Path<CompanySettingsInput>,
    label: string,
    options: {
      type?: string;
      numeric?: boolean;
      maxLength?: number;
      help?: string;
      step?: string;
      min?: number;
      max?: number;
    } = {},
  ) => (
    <FormField
      key={name}
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={
                typeof field.value === "string" ||
                typeof field.value === "number"
                  ? field.value
                  : ""
              }
              type={options.type ?? "text"}
              min={options.min}
              max={options.max}
              step={options.step}
              maxLength={options.maxLength}
              inputMode={options.numeric ? "numeric" : undefined}
              onChange={(event) =>
                field.onChange(
                  options.type === "number"
                    ? Number(event.target.value)
                    : event.target.value,
                )
              }
            />
          </FormControl>
          {options.help && <FormDescription>{options.help}</FormDescription>}
          <FormMessage role="alert" />
        </FormItem>
      )}
    />
  );
  return (
    <>
      <Heading
        title="Configurações da empresa"
        description="Dados da operação e parâmetros fiscais preservados para a integração futura."
      />
      <LoadState
        loading={settings.loading && !settings.data}
        error={settings.error}
        retry={settings.refresh}
      />
      {settings.data && (
        <>
          {!canEdit && (
            <Notice title="Permissão de consulta">
              Somente o dono pode alterar os dados da empresa.
            </Notice>
          )}
          <div className="mb-5 inline-actions">
            <StatusBadge
              status={
                settings.data.fiscalMode === "sandbox"
                  ? "SIMULATED"
                  : "NOT_EMITTED"
              }
            />
            <span className="muted text-sm">
              Emissão SEFAZ e certificado A1 não são utilizados nesta etapa.
            </span>
          </div>
          <Form {...form}>
            <form className="stack" onSubmit={form.handleSubmit(save)}>
              <fieldset disabled={!canEdit || busy} className="stack min-w-0">
                <section className="panel">
                  <div className="panel-head">
                    <h2>Identificação da empresa</h2>
                  </div>
                  <div className="panel-body form-grid">
                    {input("legalName", "Razão social")}
                    {input("tradeName", "Nome fantasia")}
                    {input("cnpj", "CNPJ", {
                      numeric: true,
                      maxLength: 14,
                      help: "Informe somente os 14 dígitos.",
                    })}
                    {input("stateRegistration", "Inscrição estadual")}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <h2>Endereço</h2>
                  </div>
                  <div className="panel-body form-grid">
                    {(
                      [
                        ["address.street", "Logradouro"],
                        ["address.number", "Número"],
                        ["address.complement", "Complemento"],
                        ["address.neighborhood", "Bairro"],
                        ["address.city", "Cidade"],
                      ] as const
                    ).map(([name, label]) => input(name, label))}
                    <FormField
                      control={form.control}
                      name="address.state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estado (UF)</FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              value={field.value ?? ""}
                              className="flex w-full border border-input rounded-md px-3 bg-surface"
                            >
                              <option value="">Selecione a UF</option>
                              {[
                                "AC",
                                "AL",
                                "AP",
                                "AM",
                                "BA",
                                "CE",
                                "DF",
                                "ES",
                                "GO",
                                "MA",
                                "MT",
                                "MS",
                                "MG",
                                "PA",
                                "PB",
                                "PR",
                                "PE",
                                "PI",
                                "RJ",
                                "RN",
                                "RS",
                                "RO",
                                "RR",
                                "SC",
                                "SP",
                                "SE",
                                "TO",
                              ].map((state) => (
                                <option value={state} key={state}>
                                  {state}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage role="alert" />
                        </FormItem>
                      )}
                    />
                    {input("address.postalCode", "CEP", {
                      numeric: true,
                      maxLength: 8,
                    })}
                    {input("address.ibgeCityCode", "Código IBGE do município", {
                      numeric: true,
                      maxLength: 7,
                    })}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <h2>Parâmetros fiscais</h2>
                  </div>
                  <div className="panel-body form-grid">
                    <FormField
                      control={form.control}
                      name="taxRegime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Regime tributário</FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              value={field.value ?? ""}
                              className="flex w-full border border-input rounded-md px-3 bg-surface"
                            >
                              <option value="SIMPLES_NACIONAL">
                                Simples Nacional
                              </option>
                              <option value="LUCRO_PRESUMIDO">
                                Lucro Presumido
                              </option>
                              <option value="LUCRO_REAL">Lucro Real</option>
                            </select>
                          </FormControl>
                          <FormMessage role="alert" />
                        </FormItem>
                      )}
                    />
                    {input("cscId", "Identificador do CSC", {
                      numeric: true,
                      maxLength: 6,
                    })}
                    {input("cscToken", "Novo token CSC (opcional)", {
                      type: "password",
                      help: settings.data.cscTokenConfigured
                        ? "Já existe um token protegido. Deixe vazio para mantê-lo."
                        : "O token será protegido e não será retornado pela API.",
                    })}
                    {input("nfceSeries", "Série NFC-e", {
                      type: "number",
                      min: 1,
                      max: 999,
                      step: "1",
                    })}
                    {input("nextNfceNumber", "Próxima numeração NFC-e", {
                      type: "number",
                      min: 1,
                      max: 999999999,
                      step: "1",
                    })}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <h2>Operação do balcão e totem</h2>
                  </div>
                  <div className="panel-body stack">
                    <FormField
                      control={form.control}
                      name="acceptsCashOnPdv"
                      render={({ field }) => (
                        <FormItem className="check-row">
                          <div>
                            <FormLabel>
                              Aceitar dinheiro no PDV assistido
                            </FormLabel>
                            <FormDescription>
                              O totem continua oferecendo somente crédito,
                              débito e Pix.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={Boolean(field.value)}
                              onCheckedChange={field.onChange}
                              aria-label="Aceitar dinheiro no PDV assistido"
                            />
                          </FormControl>
                          <FormMessage role="alert" />
                        </FormItem>
                      )}
                    />
                    <div className="max-w-sm">
                      {input(
                        "inactivityTimeoutSeconds",
                        "Inatividade antes do aviso (segundos)",
                        {
                          type: "number",
                          min: 15,
                          max: 600,
                          step: "1",
                          help: "O totem avisa o cliente e aguarda mais 15 segundos antes de limpar a sessão.",
                        },
                      )}
                    </div>
                  </div>
                </section>
              </fieldset>
              <FormError error={error} />
              {saved && (
                <p
                  role="status"
                  className="text-success flex gap-2 items-center"
                >
                  <Check size={18} />
                  Configurações salvas.
                </p>
              )}
              {canEdit && (
                <Button type="submit" className="w-fit" disabled={busy}>
                  <Save />
                  {busy ? "Salvando configurações..." : "Salvar configurações"}
                </Button>
              )}
            </form>
          </Form>
        </>
      )}
    </>
  );
}
