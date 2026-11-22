# Verificação da entrega

Data: 2026-11-21, America/Cuiaba. Branch: `codex/producao-totem`.

Os resultados abaixo foram executados na máquina local; não representam ensaio com hardware da loja ou publicação em servidor externo.

## Ambiente e comandos

Node host 26.13.1, pnpm 11.25, imagens Node 22-alpine/Nginx, PostgreSQL 16-alpine, Redis 7-alpine e RabbitMQ 3.13-management-alpine. Flutter 3.50.1 / Dart 3.14.0. Os quatro SQLs foram criados, revisados e aplicados separadamente apenas no Docker local; `db:status` confirmou checksums e aplicação.

| Verificação executada | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` / build das imagens | Dependências instaladas; scripts nativos autorizados somente para Argon2/esbuild |
| `pnpm build` e `pnpm typecheck` | Packages, API e React strict passaram |
| `pnpm test` | 60 testes passaram, incluindo contratos, 2PC, impressão, dinheiro, criptografia e OpenAPI |
| `pnpm test:integration` | 27 testes passaram com PostgreSQL, Redis, RabbitMQ e HTTP real |
| `pnpm --filter @totem-pdv/central-web test` | 15 testes passaram, incluindo intenção durável de venda/movimentação e desistência sem nova autorização |
| `pnpm --filter @totem-pdv/central-web contrast` | 60 pares aprovados: texto pelo menos 4,5:1, controles pelo menos 3:1 |
| Playwright completo em desenvolvimento | 8 cenários passaram, com todos os nove módulos em 360/768/1280/1920 px, claro/escuro |
| Playwright smoke Docker `WEB_URL=http://localhost:8080` | 4 cenários passaram: login/erro, teclado/foco, matriz de layouts e movimento reduzido |
| Playwright regressão da movimentação durável no Docker | 2 cenários passaram: caixa completo e resposta perdida após commit, reload e turno já fechado |
| `flutter analyze` | Zero problemas |
| `flutter test` | 24 testes passaram |
| Flutter REST opt-in contra Docker | 2 testes passaram: online e contingência com SQLite/RabbitMQ |
| `flutter build apk --debug` | APK gerado e recompilado após a última alteração de implementação |
| `pnpm api:openapi` | JSON reproduzível; 9 testes verificam rotas reais, schemas, referências, permissões e artefato |
| `docker compose --profile app build` / `up -d` | API, worker, Nginx, PostgreSQL, Redis e RabbitMQ saudáveis |
| Bootstrap Docker sem fixtures | Serviço de setup executado; preservou credenciais e dados existentes |
| OpenAPI servido vs arquivo gerado | Conteúdo JSON igual, 42 paths |
| Credenciais no runtime | API UID 1000; sem senha do dono do banco e sem credenciais de bootstrap no ambiente da aplicação |
| Headers da SPA no Nginx | CSP e `nosniff` presentes no HTML; `no-cache` para documento e cache longo para assets |

## Comportamentos exercitados

As integrações usam banco e vhost temporários próprios, removidos ao fim; não fazem limpeza nas tabelas da instalação. Os cenários verificam:

- Dez reenvios simultâneos da mesma venda produzem um pedido, pagamento, movimento e comprovante; payload diferente na mesma chave é rejeitado.
- O índice parcial permite apenas uma abertura entre oito concorrentes para o mesmo terminal.
- Preço, tamanho, adicionais, total esperado, dinheiro insuficiente e troco são conferidos no servidor. Edição de produto verifica versão e motivo, evitando perda de alteração concorrente.
- Fechamento aberto omite esperado/conferência. As quatro declarações são gravadas antes do relatório. Sangria exige supervisor, motivo e saldo; retry da mesma movimentação não repete efeito.
- Estorno preserva relatório anterior e compõe o líquido eletrônico do turno atual, inclusive negativo. Somas válidas maiores que um inteiro SQL de 32 bits são conciliadas por BIGINT sem perder centavos.
- Autorização fica fora do KDS até confirmação da impressão. Token de reserva errado é rejeitado. Falha pré-envio desfaz autorização; resultado incerto conserva pendência.
- Desistir do checkout consulta a autorização existente por chave em endpoint somente leitura; não inicia pagamento para descobrir se uma tentativa anterior existiu.
- ACK/cancelamento e recovery/criação concorrentes mantêm estados financeiros consistentes e ordem de locks comum.
- Receipt antecipado e tombstone impedem autorização órfã por reordenação/timeout. Snapshots offline mantêm preço e dados fiscais históricos com produto desativado ou preço alterado.
- RabbitMQ conserva a outbox enquanto o worker está parado, processa uma única venda no retorno e encaminha mensagem inválida à DLQ após retries reais de 1/5/25 segundos.
- RBAC, propriedade do turno/pagamento, isolamento entre tokens de totens, autorização de uso único, revogação, CSRF/Origin e manutenção persistida são verificados.
- Auditoria não pode ser alterada pelo usuário SQL da aplicação. CSC é criptografado, nunca retornado e nunca incluído em payload de auditoria. CNPJ numérico e alfanumérico são preservados.
- KDS recebe DTO exclusivo sem pagamentos, NSU, preços ou dados fiscais, inclusive ao avançar estágio.

Uma regressão específica usa conexões HTTP reais, pois o transporte `inject` não reproduz `IncomingMessage.close` após um POST completo. Ela protege contra cancelamento indevido do commit, confirma desconexão verdadeira com rollback enquanto há lock SQL e valida o reenvio da mesma intenção. O deadline de 15 segundos e a desconexão são controlados pela aplicação, sem usar o sinal problemático desse evento na versão instalada do framework. SSE permanece fora desse deadline e libera a conexão ao encerrar.

## Web e aplicativo nativo

O Playwright exerceu venda em dinheiro, troco, KDS, cancelamento com PIN, sangria/suprimento e fechamento cego. Também criou/editou produto com tamanho, adicional e todos os campos fiscais e verificou motivo/versão. Crédito, débito e Pix foram autorizados pela API e só mudaram para confirmados após ACK explicitamente `SIMULATED` no desenvolvimento, sem alegar impressão física. No Docker com configuração de produção, uma nova regressão interrompeu a resposta de uma movimentação depois do commit, fechou o turno, recarregou a página e recuperou a intenção original: mesmo identificador e uma única linha de caixa.

A matriz visual cobre nove módulos em quatro larguras e dois temas, com conteúdo estabilizado e sem overflow horizontal. Atalhos F2/F4/F8, Tab, Esc, restituição de foco e `prefers-reduced-motion` foram exercitados. Capturas persistentes ficam em `.validation/frontend/` (ignoradas no Git); os relatórios temporários de Playwright podem ser renovados pela próxima execução.

O Flutter usa SQLite real nos testes: persistência após reabertura, catálogo/fiscal/imagens, UUIDv7, timeout HTTP, 2PC, recuperação de órfãos, impressão conhecida/incerta, outbox `202`, manutenção, inatividade inclusive em modais e widgets em 360/768/1080 px. Impressão incerta não reverte ou reimprime automaticamente; senha e próximo atendimento continuam acessíveis quando a impressora muda para erro.

O teste REST nativo foi executado contra a Central Docker, com catálogo e API HTTP reais, SQLite temporário e impressora TCP virtual. O fluxo online confirmou uma venda de R$ 33,80; a contingência reabriu SQLite, recebeu `202`, sincronizou via RabbitMQ e confirmou R$ 50,70. Os dois casos emitiram exatamente um comprovante TCP, preservaram o mesmo pedido/pagamento no replay e esvaziaram a outbox. Ao fim, ambos foram cancelados pelo fluxo real de PIN e tiveram ator/autorizador/motivo conferidos na auditoria. Evidência: `apps/totem_app/build/evidence/central-rest.json`, com `physicalPrinterVerified=false`.

APK de teste: `apps/totem_app/build/app/outputs/flutter-apk/app-debug.apk`.

SHA-256: `674A4174E87DC0F679B23BA661A1A870D9F3854762D6CEB63E87BDB494D820E9`.

## Limites verificados e instalação

Não houve cobrança real, emissão SEFAZ, assinatura A1, SDK proprietário de TEF ou publicação externa. São exclusões explícitas da missão. Fiscal permanece `NOT_EMITTED`/`SIMULATED`; pinpad é simulado e durável. O código da impressão TCP foi ensaiado com servidores locais, não com o equipamento físico. Provisionamento do terminal, TLS/domínio, política kiosk do sistema operacional, assinatura Android release e homologação da impressora são etapas de instalação descritas no [runbook](RUNBOOK.md).

Foi criado um arquivo Figma, mas o acesso ao canvas atingiu o limite MCP Starter antes de criar frames. O usuário autorizou implementação direta no código e validação Playwright. Não houve comparação com frames inexistentes. [DESIGN.md](../DESIGN.md) contém a direção visual e os contrastes calculados.

O kit de referência e as skills obrigatórias foram lidos antes da implementação nas respectivas frentes. As credenciais aleatórias do ambiente não aparecem nos arquivos de código/documentação nem nos artefatos textuais de validação inspecionados. Nenhuma credencial foi publicada ou incluída em commit.
