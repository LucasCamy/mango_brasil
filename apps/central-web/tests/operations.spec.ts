import {
  test,
  expect,
  request,
  type Page,
  type Cookie,
} from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { randomBytes, randomInt } from "node:crypto";
import type {
  CatalogDTO,
  OrderDTO,
  ShiftReport,
  CashMovement,
} from "@totem-pdv/shared-types";

const localEnvPath = fileURLToPath(new URL("../../../.env", import.meta.url));
const localEnv = existsSync(localEnvPath)
  ? parseEnv(readFileSync(localEnvPath, "utf8"))
  : {};
const email = process.env.E2E_EMAIL ?? localEnv.BOOTSTRAP_EMAIL;
const password = process.env.E2E_PASSWORD ?? localEnv.BOOTSTRAP_PASSWORD;
let authenticatedCookies: Cookie[] | undefined;
async function login(page: Page) {
  if (!email || !password)
    throw new Error(
      "Defina E2E_EMAIL e E2E_PASSWORD para uma conta local de testes.",
    );
  if (!authenticatedCookies) {
    const auth = await request.newContext({
      baseURL: process.env.WEB_URL ?? "http://localhost:5173",
    });
    try {
      const response = await auth.post("/api/auth/login", {
        data: { email, password },
      });
      expect(response.status(), "Autenticação da conta local de testes").toBe(
        200,
      );
      authenticatedCookies = (await auth.storageState()).cookies;
    } finally {
      await auth.dispose();
    }
  }
  await page.context().addCookies(authenticatedCookies);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "PDV Assistido" }),
  ).toBeVisible();
}
async function approve(page: Page) {
  const approval = page.getByRole("alertdialog", {
    name: "Autorização de supervisor",
  });
  await approval.getByLabel("E-mail do supervisor").fill(email!);
  await approval
    .getByLabel("PIN do supervisor")
    .fill(localEnv.BOOTSTRAP_PIN ?? "");
  let granted = false;
  try {
    const [response] = await Promise.all([
      page.waitForResponse((value) =>
        value.url().endsWith("/api/auth/supervisor"),
      ),
      approval
        .getByRole("button", { name: "Autorizar operação", exact: true })
        .click(),
    ]);
    granted = response.status() === 200;
    expect(response.status()).toBe(200);
  } finally {
    // Successful UI submission clears the PIN itself. Refocusing a closing
    // Radix modal here would disturb focus restoration in the next dialog.
    if (!granted && (await approval.getByLabel("PIN do supervisor").count()))
      await approval
        .getByLabel("PIN do supervisor")
        .fill("")
        .catch(() => undefined);
  }
}

test("login mostra erro inline e mantém os campos acessíveis", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("E-mail").fill("invalid@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-incorreta");
  await page.getByRole("button", { name: "Entrar na Central" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("atalho F2 abre a busca, Esc restitui o foco e Tab alcança produtos", async ({
  page,
}) => {
  await login(page);
  const trigger = page.getByRole("button", { name: "Buscar produtos" });
  await trigger.focus();
  await page.keyboard.press("F2");
  await expect(
    page.getByRole("dialog", { name: "Buscar produtos" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("layout recompõe todas as telas em claro e escuro sem overflow", async ({
  page,
}) => {
  await login(page);
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  for (const width of [360, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.classList.toggle("dark", value === "dark");
        localStorage.setItem("central-theme", value);
      }, theme);
      for (const route of [
        "pdv",
        "caixa",
        "kds",
        "produtos",
        "pedidos",
        "totens",
        "usuarios",
        "auditoria",
        "configuracoes",
      ]) {
        await page.goto(`/#${route}`);
        const headings: Record<string, string> = {
          pdv: "PDV Assistido",
          caixa: "Caixa & Turnos",
          kds: "Cozinha KDS",
          produtos: "Produtos & Cardápio",
          pedidos: "Pedidos",
          totens: "Terminais & Totens",
          usuarios: "Usuários & Permissões",
          auditoria: "Auditoria da operação",
          configuracoes: "Configurações da empresa",
        };
        await expect(
          page.getByRole("heading", { level: 1, name: headings[route] }),
        ).toBeVisible();
        await expect(page.getByLabel("Carregando dados")).toHaveCount(0);
        await expect(page.getByLabel("Carregando produtos")).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          `${route} ${width} ${theme}`,
        ).toBe(true);
        if (["pdv", "caixa", "kds", "configuracoes"].includes(route))
          await page.screenshot({
            path: `test-results/${route}-${width}-${theme}.png`,
            fullPage: true,
            animations: "disabled",
          });
      }
      await page.screenshot({
        path: `test-results/central-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  }
  expect(consoleErrors).toEqual([]);
});

test("movimento exige motivo e fechamento mantém contagem cega", async ({
  page,
}) => {
  await login(page);
  await page.goto("/#caixa");
  await expect(page.getByText("Saldo esperado", { exact: false })).toHaveCount(
    0,
  );
  await expect(page.getByText("Total esperado", { exact: false })).toHaveCount(
    0,
  );
});

test("reduced motion desativa animações e mantém navegação utilizável", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.getByRole("button", { name: "Buscar produtos" }).click();
  await expect(
    page.getByRole("dialog", { name: "Buscar produtos" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Buscar produtos" }),
  ).toBeFocused();
});

test("venda em dinheiro, troco, KDS e cancelamento com supervisor", async ({
  page,
}) => {
  await login(page);
  const terminalId = `E2E-PDV-${Date.now()}`;
  const terminal = await page.request.post("/api/terminals", {
    data: { id: terminalId, name: "PDV de teste Playwright", type: "PDV" },
  });
  expect(terminal.status()).toBe(201);
  await page.evaluate(
    (id) => localStorage.setItem("central-terminal", id),
    terminalId,
  );
  await page.reload();
  await page.goto("/#caixa");
  await page
    .getByRole("button", { name: "Abrir turno neste terminal" })
    .click();
  await page.getByLabel("Fundo de troco inicial (R$)").fill("100.00");
  await page.getByRole("button", { name: "Confirmar abertura" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Turno aberto", { exact: true }).first(),
  ).toBeVisible();
  const catalog = (await (
    await page.request.get("/api/catalog")
  ).json()) as CatalogDTO;
  const product = catalog.products.find(
    (value) => value.active && value.availableInPdv,
  )!;
  await page.goto("/#pdv");
  const productButton = page.getByRole("button", {
    name: `Montar ${product.name}`,
    exact: true,
  });
  await productButton.click();
  const builder = page.getByRole("dialog", { name: product.name });
  if (product.sizes.length) await builder.getByRole("radio").first().check();
  if (product.additions.length)
    await builder
      .getByRole("button", {
        name: `Adicionar ${product.additions[0]!.name}`,
        exact: true,
      })
      .click();
  await builder.getByRole("button", { name: /^Adicionar por/ }).click();
  await expect(productButton).toBeFocused();
  await page.keyboard.press("F4");
  const checkout = page.getByRole("dialog", { name: "Concluir atendimento" });
  await expect(checkout).toBeVisible();
  await checkout.getByLabel("Valor recebido (R$)").fill("0.01");
  await expect(
    checkout.getByRole("button", { name: "Concluir em dinheiro" }),
  ).toBeDisabled();
  await checkout.getByLabel("Valor recebido (R$)").fill("100.00");
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/orders") &&
      response.request().method() === "POST",
  );
  await checkout.getByRole("button", { name: "Concluir em dinheiro" }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const order = (await response.json()) as OrderDTO;
  expect(order.payments[0]?.changeAmountCents).toBe(10000 - order.totalCents);
  await expect(
    page.getByRole("dialog", { name: "Pedido registrado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await page.goto("/#kds");
  const ticket = page
    .getByRole("article")
    .filter({ hasText: `#${order.publicTicketNumber}` });
  await expect(ticket).toBeVisible();
  await ticket.getByRole("button", { name: "Iniciar preparo" }).click();
  await expect(ticket.getByText("Em preparo", { exact: true })).toBeVisible();
  await page.goto("/#pedidos");
  await page
    .getByRole("button", {
      name: `Ver pedido ${order.publicTicketNumber}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Cancelar pedido", exact: true })
    .click();
  const cancellation = page.getByRole("alertdialog", {
    name: `Cancelar pedido #${order.publicTicketNumber}?`,
  });
  await cancellation
    .getByLabel("Motivo do cancelamento")
    .fill("Venda sintética de validação Playwright");
  await cancellation
    .getByRole("button", { name: "Autorizar cancelamento e estorno" })
    .click();
  await approve(page);
  await expect(
    page.getByText("Pedido cancelado e pagamento estornado com auditoria."),
  ).toBeVisible();
  const stored = (await (
    await page.request.get(`/api/orders/by-key/${order.idempotencyKey}`)
  ).json()) as OrderDTO;
  expect(stored.status).toBe("CANCELLED");
  expect(stored.payments[0]?.status).toBe("REVERSED");
  await page.goto("/#caixa");
  await expect(
    page.getByRole("button", { name: /Sangria \/ Suprimento/ }),
  ).toBeVisible();
  for (const [type, amount] of [
    ["Suprimento", "10.00"],
    ["Sangria", "5.00"],
  ]) {
    await page.keyboard.press("F8");
    const movement = page.getByRole("dialog", {
      name: "Movimentação de caixa",
    });
    await movement.getByRole("tab", { name: type, exact: true }).click();
    await movement.getByLabel("Valor da movimentação (R$)").fill(amount!);
    await movement
      .getByLabel("Motivo da movimentação")
      .fill("Conferência sintética Playwright");
    await movement
      .getByRole("button", { name: "Solicitar autorização e registrar" })
      .click();
    await approve(page);
    await expect(
      page.getByRole("dialog", {
        name: "Movimentação de caixa",
        includeHidden: true,
      }),
    ).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Fechamento cego", exact: true })
    .click();
  const close = page.getByRole("dialog", { name: "Fechamento cego do turno" });
  await close.getByLabel("Dinheiro contado (R$)").fill("105.00");
  for (const method of ["Crédito", "Débito", "Pix"])
    await close.getByLabel(`${method} contado (R$)`).fill("0.00");
  await close
    .getByLabel("Motivo do fechamento")
    .fill("Fechamento sintético Playwright");
  await close.getByRole("button", { name: "Conferir declaração" }).click();
  const closedResponse = page.waitForResponse(
    (value) =>
      value.url().includes("/shifts/") && value.url().endsWith("/close"),
  );
  await page
    .getByRole("dialog", { name: "Confirmar valores contados" })
    .getByRole("button", { name: "Autorizar e fechar turno" })
    .click();
  await approve(page);
  const report = (await (await closedResponse).json()) as ShiftReport;
  expect(report.status).toBe("CLOSED");
  expect(
    report.reconciliations.find((value) => value.method === "CASH")
      ?.systemCalculatedAmountCents,
  ).toBe(10500);
  expect(
    report.reconciliations.every((value) => value.differenceCents === 0),
  ).toBe(true);
  await expect(
    page.getByRole("dialog", { name: "Relatório do turno fechado" }),
  ).toBeVisible();
});

test("movimentação perdida recupera após reload e turno fechado sem duplicar", async ({
  page,
}) => {
  await login(page);
  const terminalId = `E2E-RECOVER-${Date.now()}`;
  expect(
    (
      await page.request.post("/api/terminals", {
        data: {
          id: terminalId,
          name: "PDV recuperação Playwright",
          type: "PDV",
        },
      })
    ).status(),
  ).toBe(201);
  const opened = await page.request.post("/api/shifts/open", {
    data: { terminalId, initialCashCents: 0 },
  });
  expect(opened.status()).toBe(201);
  const shift = await opened.json();
  await page.evaluate(
    (id) => localStorage.setItem("central-terminal", id),
    terminalId,
  );
  await page.reload();
  await page.goto("/#caixa");
  await page.getByRole("button", { name: /Sangria \/ Suprimento/ }).click();
  const movement = page.getByRole("dialog", { name: "Movimentação de caixa" });
  await movement.getByRole("tab", { name: "Suprimento", exact: true }).click();
  await movement.getByLabel("Valor da movimentação (R$)").fill("10.00");
  const reason = `Retorno perdido Playwright ${Date.now()}`;
  await movement.getByLabel("Motivo da movimentação").fill(reason);
  let committed: CashMovement | undefined;
  let interrupted = false;
  const routePattern = "**/api/shifts/*/movements";
  const handler: Parameters<Page["route"]>[1] = async (route) => {
    if (route.request().method() !== "POST" || interrupted) {
      await route.continue();
      return;
    }
    interrupted = true;
    // The real API commits. Only the response is dropped to reproduce a network loss.
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    committed = (await response.json()) as CashMovement;
    await route.abort("failed");
  };
  await page.route(routePattern, handler);
  try {
    await movement
      .getByRole("button", { name: "Solicitar autorização e registrar" })
      .click();
    await approve(page);
    await expect(
      movement.getByRole("button", { name: "Reenviar a mesma movimentação" }),
    ).toBeVisible();
    expect(committed?.amountCents).toBe(1000);
    await page.keyboard.press("Escape");
    const grantResponse = await page.request.post("/api/auth/supervisor", {
      data: {
        email,
        pin: localEnv.BOOTSTRAP_PIN,
        action: "SHIFT_CLOSED",
        resourceId: shift.id,
      },
    });
    expect(grantResponse.status()).toBe(200);
    const grant = await grantResponse.json();
    const closed = await page.request.post(`/api/shifts/${shift.id}/close`, {
      data: {
        declared: { CASH: 1000, CREDIT_CARD: 0, DEBIT_CARD: 0, PIX: 0 },
        reason: "Fechamento após resposta perdida sintética",
      },
      headers: { "x-supervisor-token": grant.token },
    });
    expect(closed.status()).toBe(200);
    await page.reload();
    await page
      .getByRole("button", {
        name: "Conferir movimentação anterior",
        exact: true,
      })
      .click();
    await expect(movement.getByLabel("Valor da movimentação (R$)")).toHaveValue(
      "10.00",
    );
    await expect(
      movement.getByLabel("Valor da movimentação (R$)"),
    ).toBeDisabled();
    await expect(movement.getByLabel("Motivo da movimentação")).toHaveValue(
      reason,
    );
    await expect(movement.getByLabel("Motivo da movimentação")).toBeDisabled();
    await movement
      .getByRole("button", { name: "Reenviar a mesma movimentação" })
      .click();
    await approve(page);
    await expect(
      page.getByRole("dialog", {
        name: "Movimentação de caixa",
        includeHidden: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Conferir movimentação anterior",
        exact: true,
      }),
    ).toHaveCount(0);
    const ledger = await (
      await page.request.get(
        `/api/shifts/${shift.id}/movements?page=1&pageSize=100`,
      )
    ).json();
    const supplies = ledger.items.filter(
      (entry: CashMovement) => entry.reason === reason,
    );
    expect(supplies).toHaveLength(1);
    expect(supplies[0].id).toBe(committed?.id);
  } finally {
    await page.unroute(routePattern, handler);
  }
});

test("cadastro fiscal com tamanho e adicional persiste pela interface", async ({
  page,
}) => {
  await login(page);
  await page.goto("/#produtos");
  await page.getByRole("button", { name: "Novo produto", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Novo produto" });
  const name = `E2E Produto ${Date.now()}`;
  await form.getByLabel("Nome do produto", { exact: true }).fill(name);
  await form
    .getByLabel("Categoria", { exact: true })
    .selectOption({ index: 1 });
  await form.getByLabel("Preço base (R$)").fill("12.50");
  await form.getByRole("tab", { name: "Tamanhos & Adicionais" }).click();
  await form.getByRole("button", { name: "Tamanho", exact: true }).click();
  await form.getByLabel("Nome do tamanho 1").fill("Regular");
  await form.getByLabel("Acréscimo ao preço (R$)").fill("2.00");
  await form.getByRole("button", { name: "Adicional", exact: true }).click();
  await form.getByLabel("Nome do adicional 1").fill("Extra teste");
  await form.getByLabel("Preço adicional (R$)").fill("1.50");
  await form.getByLabel("Quantidade máxima").fill("2");
  await form.getByRole("tab", { name: "Regras fiscais" }).click();
  await form.getByLabel("NCM", { exact: true }).fill("21069090");
  await form.getByLabel("CFOP", { exact: true }).fill("5102");
  await form.getByLabel("CST / CSOSN").fill("102");
  await form.getByLabel("IBS (%)").fill("0.1");
  await form.getByLabel("CBS (%)").fill("0.9");
  await form.getByLabel("IBPT (%)").fill("18.5");
  const creation = page.waitForResponse(
    (value) =>
      value.url().endsWith("/api/products") &&
      value.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Salvar produto" }).click();
  const response = await creation;
  expect(response.status()).toBe(201);
  const product = await response.json();
  expect(product.sizes[0].priceModifierCents).toBe(200);
  expect(product.additions[0].maxQuantity).toBe(2);
  expect(product.fiscal).toMatchObject({
    ibsRate: 0.1,
    cbsRate: 0.9,
    aliquotaIbpt: 18.5,
  });
  await expect(form).toHaveCount(0);
  await page
    .getByRole("switch", { name: `Desativar ${name}`, exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: `Ativar ${name}`, exact: true }),
  ).toBeVisible();
  const edit = page.getByRole("button", {
    name: `Editar ${name}`,
    exact: true,
  });
  await edit.click();
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
  await edit.click();
  const editing = page.getByRole("dialog", { name: "Editar produto" });
  await editing
    .getByLabel("Motivo da alteração", { exact: true })
    .fill("Ajuste de preço sintético Playwright");
  await editing.getByLabel("Preço base (R$)").fill("13.50");
  const updated = page.waitForResponse(
    (value) =>
      value.url().endsWith(`/api/products/${product.id}`) &&
      value.request().method() === "PATCH",
  );
  await editing.getByRole("button", { name: "Salvar produto" }).click();
  const result = await updated;
  expect(result.status()).toBe(200);
  const persisted = await result.json();
  expect(persisted.basePriceCents).toBe(1350);
  expect(persisted.version).toBeGreaterThan(product.version);
  await expect(editing).toHaveCount(0);
});

test("crédito, débito e Pix confirmam somente após ack de impressão sandbox", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  if (!localEnv.PRINT_AGENT_TOKEN)
    throw new Error(
      "PRINT_AGENT_TOKEN local é necessário para validar impressão sandbox.",
    );
  const terminalId = `E2E-PAY-${Date.now()}`;
  expect(
    (
      await page.request.post("/api/terminals", {
        data: {
          id: terminalId,
          name: "PDV pagamentos Playwright",
          type: "PDV",
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await page.request.post("/api/shifts/open", {
        data: { terminalId, initialCashCents: 0 },
      })
    ).status(),
  ).toBe(201);
  await page.evaluate(
    (id) => localStorage.setItem("central-terminal", id),
    terminalId,
  );
  await page.reload();
  const supervisorEmail = `e2e-${Date.now()}@example.test`;
  const supervisorPin = randomInt(100000, 1000000).toString();
  const supervisor = await page.request.post("/api/users", {
    data: {
      name: "Supervisor sintético Playwright",
      email: supervisorEmail,
      password: randomBytes(32).toString("hex"),
      supervisorPin,
      role: "MANAGER",
      active: true,
    },
  });
  expect(supervisor.status()).toBe(201);
  const supervisorId = (await supervisor.json()).id as string;
  const agent = await request.newContext({
    baseURL: process.env.WEB_URL ?? "http://localhost:5173",
    extraHTTPHeaders: { Authorization: `Bearer ${localEnv.PRINT_AGENT_TOKEN}` },
  });
  try {
    const catalog = (await (
      await page.request.get("/api/catalog")
    ).json()) as CatalogDTO;
    const product = catalog.products.find(
      (value) =>
        value.active && value.availableInPdv && value.basePriceCents > 0,
    )!;
    for (const [label, method] of [
      ["Crédito", "CREDIT_CARD"],
      ["Débito", "DEBIT_CARD"],
      ["Pix", "PIX"],
    ]) {
      await page.goto("/#pdv");
      await page
        .getByRole("button", { name: `Montar ${product.name}`, exact: true })
        .click();
      const builder = page.getByRole("dialog", { name: product.name });
      if (product.sizes.length)
        await builder.getByRole("radio").first().check();
      await builder.getByRole("button", { name: /^Adicionar por/ }).click();
      await page.getByRole("button", { name: /Ir para pagamento/ }).click();
      const checkout = page.getByRole("dialog", {
        name: "Concluir atendimento",
      });
      await checkout.getByRole("button", { name: label, exact: true }).click();
      const created = page.waitForResponse(
        (value) =>
          value.url().endsWith("/api/orders") &&
          value.request().method() === "POST",
      );
      await checkout
        .getByRole("button", {
          name: `Concluir em ${label!.toLowerCase()}`,
          exact: true,
        })
        .click();
      const orderResponse = await created;
      expect(orderResponse.status()).toBe(201);
      const order = (await orderResponse.json()) as OrderDTO;
      expect(order.payments[0]?.method).toBe(method);
      expect(order.payments[0]?.status).toBe("AUTHORIZED");
      await expect(
        page.getByText("Autorizado, aguarda impressão", { exact: true }),
      ).toBeVisible();
      const claim = await agent.post("/api/print-agent/claim", {
        data: { terminalId },
      });
      expect(claim.status()).toBe(200);
      const { job } = await claim.json();
      expect(job.orderId).toBe(order.id);
      // Explicit simulator acknowledgement; this never claims a physical PRINTED result.
      const acknowledged = await agent.post(
        `/api/print-agent/jobs/${job.id}/ack`,
        { data: { claimToken: job.claimToken, status: "SIMULATED" } },
      );
      expect(acknowledged.status()).toBe(200);
      await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Novo atendimento" }).click();
      const grantResponse = await page.request.post("/api/auth/supervisor", {
        data: {
          email: supervisorEmail,
          pin: supervisorPin,
          action: "ORDER_CANCELLED",
          resourceId: order.id,
        },
      });
      expect(grantResponse.status()).toBe(200);
      const grant = await grantResponse.json();
      const cancelled = await page.request.post(
        `/api/orders/${order.id}/cancel`,
        {
          data: { reason: "Encerramento de venda sintética Playwright" },
          headers: { "x-supervisor-token": grant.token },
        },
      );
      expect(cancelled.status()).toBe(200);
      expect((await cancelled.json()).payments[0].status).toBe("REVERSED");
    }
  } finally {
    await agent.dispose();
    await page.request.patch(`/api/users/${supervisorId}`, {
      data: { active: false },
    });
  }
});
