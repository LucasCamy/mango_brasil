# Mango Brasil | Totem e PDV Central

Central operacional com PDV assistido, caixa e fechamento cego, cardápio fiscal, produção KDS, usuários, auditoria e monitoramento de terminais. O totem Flutter mantém catálogo e vendas em SQLite e sincroniza por uma outbox durável.

O armazenamento em memória foi substituído por PostgreSQL, Redis e RabbitMQ. O pinpad está **simulado**, com autorização, confirmação e reversão persistidas. NFC-e está **desabilitada ou em sandbox**: esta versão não cobra cartões/Pix reais nem emite documento fiscal. Os comprovantes identificam esse estado.

## Organização

| Caminho | Responsabilidade |
|---|---|
| `apps/central-api` | Fastify/Node, autenticação, transações SQL, worker AMQP e agente ESC/POS |
| `apps/central-web` | React 19, Vite, TypeScript strict, Tailwind, shadcn/ui e Radix |
| `apps/totem_app` | Flutter nativo em camadas `ui`, `domain` e `data`; SQLite offline |
| `packages/shared-types` | DTOs, schemas Zod, UUID v7 e OpenAPI gerado |
| `packages/tef-client` | Porta de pagamento e simulador 2PC com armazenamento durável injetado |
| `packages/fiscal-engine` | Porta fiscal e adaptador `disabled/sandbox` |
| `apps/cockpit` | Ferramenta histórica do MVP, fora do fluxo comercial e do Compose |

Valores monetários são inteiros em centavos de BRL. A API recalcula os itens, compara a intenção e valida a autorização. Vendas offline carregam snapshots históricos autenticados pelo terminal. PAN, CVV e PIN de cartão não entram nos contratos ou logs.

## Iniciar localmente

Requisitos: Node.js 22.12 ou superior, pnpm 11.25 e Docker com Compose. O aplicativo nativo usa Flutter 3.50.1 / Dart 3.14 ou compatíveis.

```sh
pnpm install --frozen-lockfile
pnpm dev:env
docker compose up -d postgres redis rabbitmq
pnpm db:status
```

Revise os SQLs em `apps/central-api/migrations/` e então aplique no banco local:

```sh
pnpm db:migrate
pnpm db:seed
```

`dev:env` gera `.env` com credenciais aleatórias e não sobrescreve um arquivo existente. O login e PIN do dono estão em `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD` e `BOOTSTRAP_PIN`. O seed preserva credenciais existentes. O catálogo fictício só entra em banco vazio com `ALLOW_DEMO_SEED=true`, fora de produção; seus dados fiscais são fixtures, não a classificação fiscal da empresa.

Execute em terminais separados:

```sh
pnpm dev:api
pnpm worker
pnpm print-agent
pnpm dev:central
```

Abra [Central Web](http://localhost:5173), escolha `CAIXA-01` e abra um turno antes de vender. `F2` busca produtos, `F4` abre pagamento e `F8` abre movimentações. O operador declara as quatro formas antes de receber a conferência do fechamento. Os líquidos de cartão/Pix podem ser negativos quando há estorno de venda de turno anterior.

O agente local usa `PRINT_TRANSPORT=spool` somente no desenvolvimento: grava ESC/POS e marca **impressão simulada**. Para impressão real configure `PRINT_TRANSPORT=tcp`, `PRINTER_HOST` e `PRINTER_PORT`. Venda eletrônica só entra no KDS após aceitação do comprovante. Falhas conhecidas antes do envio desfazem a autorização; impressão incerta fica pendente para conferência, sem reenvio físico automático.

## Executar com Docker

Depois de revisar as migrations e configurar `.env`:

```sh
docker compose --profile app build
docker compose --profile app run --rm migrate
docker compose --profile app up -d
```

A Central fica em [localhost:8080](http://localhost:8080). Não mantenha outra API local na porta 4000. Para bootstrap de banco novo sem inserir fixtures:

```sh
docker compose --profile app --profile setup run --build --rm bootstrap
```

O profile `printer` adiciona o agente TCP e seu volume de journals:

```sh
docker compose --profile app --profile printer up -d --build
```

Configure a impressora antes de ativá-lo. As portas ficam vinculadas ao loopback. Para acesso por domínio, configure um proxy HTTPS e `PUBLIC_WEB_ORIGIN`; mantenha os serviços de dados privados. API, worker e Nginx executam sem root. Segredos são injetados no runtime e não entram na imagem. Credenciais de migration/bootstrap ficam nos serviços de setup; o agente de impressão recebe somente sua credencial e parâmetros de impressora.

## Totem nativo

Siga [a instalação Flutter](apps/totem_app/README.md). Use uma credencial individual de terminal. Android debug permite HTTP local; distribuição exige HTTPS e assinatura própria.

O primeiro catálogo precisa ser sincronizado antes de operar offline. Depois disso, uma falha de rede não bloqueia o atendimento: o aplicativo persiste a intenção, tenta a Central por até três segundos, imprime a senha central ou de contingência e sincroniza em segundo plano com as mesmas chaves. `202` significa recebido na fila; a venda só sai da outbox após confirmação consultada na Central.

## Verificar

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm test:integration
pnpm --filter @totem-pdv/central-web test
pnpm --filter @totem-pdv/central-web contrast
pnpm test:e2e
pnpm api:openapi
```

Os testes integrados criam e removem apenas um banco e um vhost temporários próprios nos serviços Docker locais, sem limpar tabelas da loja. Precisam do `.env` de desenvolvimento e de PostgreSQL, Redis e RabbitMQ management na porta 15679. Playwright precisa da API, worker, Web e Chromium (`pnpm --filter @totem-pdv/central-web exec playwright install chromium`).

```sh
cd apps/totem_app
flutter analyze
flutter test
flutter build apk --debug
```

Resultados executados e limites de homologação estão em [VALIDATION.md](docs/VALIDATION.md). Um build não substitui o ensaio com impressora e terminal da loja.

## Documentação

- [OpenAPI](packages/shared-types/openapi.json), também na [API local](http://localhost:4000/api/openapi.json).
- [Runbook de operação e recuperação](docs/RUNBOOK.md).
- [ADR-001: idempotência e outboxes](docs/adr/0001-idempotencia-outbox-offline.md).
- [ADR-002: fiscal e pinpad por portas](docs/adr/0002-portas-fiscal-pagamento.md).
- [ADR-003: Central transacional](docs/adr/0003-central-transacional.md).
- [Sistema visual e contraste](DESIGN.md).
- [Regras de engenharia](AGENTS.md).

O [agent-project-kit](https://github.com/LucasCamy/agent-project-kit) orientou a implementação. `docs/MVP.md` é histórico. Emissão fiscal real, SDK proprietário de pinpad e assinatura de release Android dependem dos respectivos adaptadores e credenciais.

Licença proprietária do projeto Mango Brasil.
