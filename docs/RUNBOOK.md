# Runbook operacional

Este procedimento corresponde ao código atual. Serviços de dados locais usam volumes nomeados do projeto `mango-pdv`. Fiscal e TEF permanecem nos adaptadores autorizados: `disabled/sandbox` e `simulated`.

## Inicialização e diagnóstico

1. Preserve `.env`, volumes PostgreSQL/RabbitMQ/Redis, SQLite dos totens e journals de impressão. Não gere novas credenciais para tentar reparar uma instalação existente.
2. Confira configuração obrigatória em `.env.example`. `.env` não entra no Git nem na imagem. Não copie seu conteúdo para logs/tickets. Compose fornece credenciais de migration/bootstrap somente aos serviços de setup e não passa senha do dono do banco para API/worker; o agente de impressão recebe somente credencial de agente e configuração da impressora.
3. Suba os serviços de dados e confira `docker compose ps`.
4. Execute `pnpm db:status`; revise cada SQL pendente. `pnpm db:migrate` é a etapa de aplicação, separada da criação/revisão. Em produção/ambiente compartilhado, siga a autorização de mudança da instalação.
5. Inicie API, worker, Central e agente de impressão configurado, conforme README. Em Docker: `docker compose --profile app up -d` depois da revisão das migrations.

Verificações sem efeitos financeiros:

```sh
docker compose ps
docker compose logs --tail 100 central-api worker
pnpm db:status
```

`GET /health/live` verifica processo. `GET /health/ready` verifica PostgreSQL, Redis e informa quantidade de eventos ainda na outbox. A disponibilidade do broker não elimina a possibilidade de persistir uma venda: a outbox conserva o trabalho até a recuperação. O worker tem heartbeat TTL por instância e healthcheck próprio no Compose. A Central apresenta erros inline e permite tentar novamente sem trocar chaves.

RabbitMQ management local está em `http://localhost:15679`, com usuário/senha do ambiente. Banco, Redis e broker são expostos apenas no loopback; não exponha as portas administrativas diretamente à rede da loja.

## Abertura, venda e fechamento

O PDV seleciona um terminal `PDV` e abre turno com fundo de troco. O índice único parcial é a proteção contra aberturas concorrentes. Atendente usa apenas o próprio turno; gerente/dono têm acesso operacional ampliado.

Dinheiro recebido precisa cobrir o valor calculado no servidor. O pedido guarda valor entregue, valor da venda e troco. Alteração de preço após a montagem gera conflito para rever pedido/troco, em vez de cobrar silenciosamente outro total. Reenvie a mesma intenção em falhas de rede.

Eletrônicos permanecem `AUTHORIZED` até o comprovante aceito; apenas pagamentos `CONFIRMED` aparecem no KDS. O simulador não cobra valores reais. Nunca entregue uma autorização como cobrança comercial homologada.

Sangria, suprimento, cancelamento e fechamento exigem motivo e token de supervisor de uso único. O token dura dois minutos, está vinculado ao operador, ação e recurso e é consumido dentro da transação. Se a validação de negócio falhar, a transação também desfaz o consumo.

O navegador persiste a intenção de movimentação antes do PIN/POST. Se a resposta se perder, conserva chave e valores, bloqueia uma nova movimentação e permite recuperar a anterior, inclusive depois de reload ou fechamento do turno. Uma resposta positiva ou rejeição definitiva libera a intenção. Nenhum PIN/token é gravado nesse armazenamento. Desistir de checkout usa consulta somente leitura da autorização antes de desfazer; nunca inicia um pagamento apenas para verificar se ele existia.

Fechamento cego não oferece saldo esperado em turno aberto. Declare CASH, crédito, débito e Pix. CASH não pode ser negativo; eletrônicos representam líquido de vendas/estornos e podem ser negativos. Depois do commit, a resposta e relatório mostram esperado, declarado e diferença. Pendências de pagamento/impressão e sincronizações já conhecidas bloqueiam o fechamento até resolução.

Relatórios fechados não são reescritos. Estorno posterior de pagamento confirmado gera `payment_reversals`, atribuído ao turno atual do terminal quando existir. Void de uma autorização não capturada não gera redução financeira. Se não houver turno atual, a reversão fica com vínculo nulo para conferência; ela aparece na auditoria. Para dinheiro é obrigatório um turno aberto com saldo suficiente para devolver.

## Venda sem conexão

O totem precisa de uma primeira sincronização e guarda catálogo, opções, impostos e fotos em SQLite. Não cria um catálogo fictício se o primeiro acesso falhar. A última manutenção remota conhecida é persistida e prevalece após reiniciar sem rede.

A intenção e autorização local são persistidas antes da tentativa HTTP. O prazo é de três segundos. Em timeout, o totem conserva pedido/outbox, usa senha de contingência e imprime localmente. Uma resposta perdida pode esconder um commit da Central: o lookup por chave é a fonte de reconciliação, e o replay nunca gera outro pagamento.

`POST /api/offline-sync` retorna `202` somente após gravar a requisição e outbox central. O broker processa em segundo plano. O aplicativo só remove a venda local depois de consultar o mesmo pedido/pagamento `CONFIRMED`. Erros permanentes ficam em revisão, sem apagar dados. O snapshot de preços/fiscal preserva a venda mesmo depois de alteração ou desativação do cardápio.

A venda é vinculada ao turno ativo do terminal quando aceita na Central. Sem turno, `shiftId` fica nulo e a data local permanece no pedido. Confira pedidos offline sem turno e reversões sem turno antes da conciliação gerencial; não atribua retroativamente valores a relatório já fechado.

Nunca apague o arquivo SQLite para “resolver sincronização”. Faça cópia com o aplicativo encerrado ou backup SQLite consistente, incluindo WAL quando necessário. Troca/reinstalação do dispositivo exige preservar vendas pendentes, credencial individual e histórico de impressão.

## Impressão ESC/POS

O transporte Node TCP consulta status Epson `DLE EOT 1..4` antes dos bytes. A implementação do Flutter consulta papel `DLE EOT 4`. Ambos têm prazo de conexão e não recebem dados de cartão. Conteúdo livre é sanitizado para não injetar comandos ESC/POS. A aceitação TCP não comprova a saída física do papel; valide protocolo, sensores, largura, corte e encerramento da conexão no modelo escolhido.

`spool` existe somente no desenvolvimento e grava bytes em arquivo, com rótulo e status `SIMULATED`. Produção rejeita esse resultado e exige TCP configurado. O agente TCP falha no boot se o host não estiver definido, sem consumir vendas.

O agente reserva um job por token/lease. ACK só é aceito com o mesmo token. Jobs com lease expirado não são reenviados automaticamente, pois o papel pode ter saído. Há três resultados:

| Resultado | Tratamento |
|---|---|
| Comprovante aceito | ACK e confirmação 2PC idempotentes |
| Falha conhecida antes de enviar bytes | Autorização não capturada é desfeita; pedido é cancelado tecnicamente |
| Bytes podem ter sido enviados | Mantém pendência para conferência; nunca imprime de novo automaticamente |

Journals são publicados por gravação temporária, fsync e rename. Após crash, o agente repete somente o ACK. Arquivo inválido é isolado como `.corrupt` e recebe `.needs-review`, sem paralisar outros jobs. Recusa permanente do ACK também recebe `.needs-review`, sem loop infinito.

Na ocorrência de `.needs-review`, confira na Central pedido, pagamento, token da reserva e a via física. Preserve journal e marcador como evidência. Uma reimpressão explícita usa a mesma senha/pagamento e identifica segunda via; cancelamento comercial usa supervisor e motivo. Não apague o marcador para forçar reenvio de bytes. No totem, a tela de conferência preserva senha e permite próximo atendimento; novas vendas continuam sujeitas ao estado real da impressora.

## Broker indisponível, retries e DLQ

O pedido e os eventos já persistidos permanecem em PostgreSQL. Restabeleça RabbitMQ e worker; publisher confirms e inbox permitem repetição. Não marque `published_at` manualmente para esconder backlog.

Cada fila tem retries exponenciais de 1, 5 e 25 segundos, depois DLQ:

```text
kds.orders.queue.dlq
print.jobs.queue.dlq
totem.offline_sync.queue.dlq
fiscal.nfce.queue.dlq
```

Inspecione `messageId`, routing key, `x-attempt` e causa antes de redrive. Corrija dependência/código e use o recurso de movimentação do broker preservando o identificador e payload original. Não publique outra intenção ou chave de pagamento para “destravar”. Mensagens inválidas ou vendas rejeitadas precisam de análise do conteúdo autenticado; não entram em retry infinito. O consumidor fiscal atual apenas registra resultado sandbox, sem transmitir XML.

Consulta somente leitura útil para suporte, no banco correto:

```sql
SELECT routing_key, count(*) FROM outbox_events
 WHERE published_at IS NULL GROUP BY routing_key;
SELECT id, terminal_id, status, error_detail FROM offline_sync_requests
 WHERE status <> 'PROCESSED' ORDER BY created_at;
SELECT id, terminal_id, status, last_error FROM print_jobs
 WHERE status IN ('CLAIMED','FAILED') ORDER BY created_at;
SELECT id, terminal_id, status, updated_at FROM payment_transactions
 WHERE status NOT IN ('CONFIRMED','REVERSED','FAILED') ORDER BY created_at;
SELECT id, terminal_id, offline_created_at FROM orders
 WHERE shift_id IS NULL ORDER BY created_at;
SELECT id, order_payment_id, amount_cents, reversed_at FROM payment_reversals
 WHERE settlement_shift_id IS NULL ORDER BY reversed_at;
```

## Backup e recuperação

Preserve banco, `.env`/chaves em armazenamento restrito, SQLite dos totens e journals do agente. A chave AES é necessária para ler CSC criptografado; a senha antiga do banco continua necessária para volumes existentes. `dev:env` não é um rotacionador de credenciais.

Exemplo de backup local PostgreSQL sem passar senha na linha de comando:

```sh
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/mango.backup'
docker compose cp postgres:/tmp/mango.backup .local/mango.backup
```

Restaure primeiro em banco/volume separado, confira migrations/checksums, contagens e saldos antes de trocar a conexão da instalação. Não use `docker compose down -v`, `TRUNCATE` ou remoção do SQLite como rotina de reparo. Auditoria não permite UPDATE/DELETE pelo usuário da aplicação.

Migrations já aplicadas não são editadas. O runner tem lock de migração, checksum com finais de linha normalizados e transação por arquivo. Em falha, a migration corrente sofre rollback. Mudanças de dados devem ter backup e plano de recuperação; para alterações compatíveis, prefira correção por migration nova e rollback da aplicação só quando o schema continuar compatível.

## Instalação comercial

Configure empresa e metadados fiscais reais no formulário, credenciais únicas por dispositivo, TLS/Origin do domínio, impressora TCP e assinatura Android própria. O campo CNPJ preserva o formato numérico e o alfanumérico de 14 posições, com os dois caracteres finais numéricos; o contrato normaliza letras para maiúsculas. A aceitação de formato não consulta situação cadastral nem valida classificação tributária. A referência é a [Receita Federal](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico/cnpj-alfa).

O release Android não usa chave debug como fallback. Cadastre a política kiosk no sistema operacional do terminal. O APK entregue para teste é debug.

O adaptador fiscal real deverá validar XSD, assinar e tratar SEFAZ/contingência. O adaptador TEF real deverá confirmar/desfazer com o provedor e reconciliar suas pendências. Essas integrações estão explicitamente fora do recorte atual, e a interface identifica a simulação. Os comandos e testes executados estão em [VALIDATION.md](VALIDATION.md).
