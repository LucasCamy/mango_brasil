# Diretrizes de Engenharia e Agentes - Totem PDV Central

Este arquivo orienta agentes autônomos (**Claude Code**, **Codex**, **Antigravity**) na arquitetura, convenções e implementação do sistema **Totem PDV Central**.

---

## 1. Arquitetura do Repositório (Monorepo)

O projeto é estruturado em monorepo com isolamento de responsabilidades:

```text
totem-pdv-central/
├── apps/
│   ├── central-api/        # Fastify, PostgreSQL, worker AMQP e agente ESC/POS
│   ├── central-web/        # React 19 / Vite / TypeScript strict / shadcn-ui
│   └── totem_app/          # Kiosk Flutter nativo com SQLite (Android/Linux/Windows)
├── packages/
│   ├── fiscal-engine/      # Motor NFC-e (Certificado A1, XML, SEFAZ, Contingência)
│   ├── tef-client/         # Camada de comunicação com Pinpad / TEF
│   └── shared-types/       # DTOs, schemas e contratos de API compartilhados
└── docs/
    └── MVP.md              # Requisitos de negócio e escopo detalhado
```

---

## 2. Divisão de Papéis dos Agentes (Multi-Agent Swarm)

Para trabalho concorrente via **Agent Workbench (Git Worktrees)**:

* **Agente Arquiteto / Backend (Claude Code - Branch `backend-central`):**
  - Responsável por: API Central, banco de dados (migrations, Prisma/TypeORM/Postgres), autenticação, regras de caixa, controle de turnos e fila de produção (KDS).
  - Regra de Ouro: APIs devem fornecer contratos OpenAPI/Swagger tipados em `packages/shared-types`.
* **Agente Fiscal & Integrações (Claude Code / Codex - Branch `fiscal-engine`):**
  - Responsável por: Motor fiscal NFC-e, assinatura digital de XML via certificado A1, cálculo de IBPT/IBS/CBS e contingência offline.
  - Regra de Ouro: Todo XML gerado deve ser estritamente validado contra o XSD da SEFAZ antes do envio.
* **Agente Front-end Totem (Codex / Antigravity - Branch `totem-flutter`):**
  - Responsável por: Interface Flutter (responsividade Kiosk touch 1080x1920 portrait), fluxo de montagem do pedido, carrinho, integração TEF e fila local SQLite para contingência offline.
  - Regra de Ouro: O totem NUNCA deve travar ou bloquear a tela em caso de falha de conexão. Qualquer requisição com timeout entra na fila local offline.

---

## 3. Padrões de Qualidade e Código

1. **Estado = Forma + Texto + Cor:** Nunca use apenas cor para indicar estado. Todo botão ou badge precisa de ícone/forma e texto descritivo.
2. **Contingência e Idempotência:** Toda transação de pagamento e pedido deve possuir um `idempotency_key` (UUID v7) único para evitar cobranças ou emissões duplicadas em instabilidades de rede.
3. **Privacidade e LGPD:** Logs de sistema NUNCA devem registrar dados sensíveis de cartões (PAN, CVV, senhas de pinpad).
4. **Commits e Branches:** Cada agente deve realizar commits atômicos acompanhados de descrição clara antes de solicitar handoff ou merge.

## 4. Comandos reais e validação

- `pnpm install --frozen-lockfile`: dependências; `pnpm dev:env`: gera apenas configuração local ausente.
- `docker compose up -d postgres redis rabbitmq`: infraestrutura local do projeto.
- `pnpm db:status`: confere migrations/checksums. Criar SQL em `apps/central-api/migrations`, revisar separadamente e então aplicar com `pnpm db:migrate`. Não editar migrations aplicadas.
- `pnpm db:seed`: bootstrap pelo ambiente; fixtures só com `ALLOW_DEMO_SEED=true`, fora de produção.
- `pnpm dev:api`, `pnpm dev:central`, `pnpm worker`, `pnpm print-agent`: processos separados.
- `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`: build, regras e concorrência em serviços reais.
- `pnpm --filter @totem-pdv/central-web test`, `pnpm --filter @totem-pdv/central-web contrast`, `pnpm test:e2e`: checkout, contraste e navegador.
- `pnpm api:openapi`: regenera `packages/shared-types/openapi.json`.
- No `apps/totem_app`: `flutter pub get`, `flutter analyze`, `flutter test`, `flutter build apk --debug`.

## 5. Invariantes de produção

- Dinheiro em centavos inteiros. Recalcular preços no servidor; snapshots offline só com credencial própria do totem no adaptador simulado.
- PostgreSQL é a autoridade da idempotência e do caixa. Redis mantém cache/TTL e reduz disputa sem substituir constraints SQL.
- Ordem de locks de liquidação: turno, pedido, job/linhas de pagamento, lock do pagamento. Revalidar após obter o lock. Reversão e auditoria são atômicas.
- Turno aberto nunca expõe totais calculados. Gravar quatro declarações antes da conferência; CASH não negativo, líquidos eletrônicos podem incluir estornos negativos.
- Fila não equivale a impressão. Confirmação 2PC exige comprovante aceito; impressão incerta preserva pendência para conferência explícita sem reenvio físico automático.
- Auditoria é imutável inclusive por permissão SQL. Senhas/PIN usam Argon2id; CSC é write-only e criptografado; tokens de terminal ficam por hash.
- Manter `FISCAL_MODE=disabled|sandbox`, `PAYMENT_MODE=simulated`. Sem XML/SEFAZ ou hardware TEF real neste recorte. Futuro adaptador fiscal deve validar XSD antes de transmitir.
- Erros usam `application/problem+json`: entrada 400, sessão 401, perfil/PIN 403, ausente 404, estado/idempotência 409, invariantes 422, dependências/timeout 503.
- Tokens visuais em `apps/central-web/src/styles/tokens.css`; sem cores soltas, emojis como ícones ou transições na seleção. O usuário autorizou código direto com validação Playwright.

## 6. Documentação e operação

Mantenha README para execução, OpenAPI para HTTP, `docs/RUNBOOK.md` para recuperação e `docs/adr/NNNN-titulo.md` para decisões duráveis. Consulte ADRs antes de alterar fronteiras, segurança, idempotência ou conciliação. Decisão aceita não significa serviço implantado ou hardware homologado. Resultados temporários pertencem a `docs/VALIDATION.md`.
