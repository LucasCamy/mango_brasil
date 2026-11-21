# Totem Mango Brasil

Aplicativo nativo para Android, Windows e Linux, com interface touch otimizada para 1080 × 1920 e recomposição por largura. Flutter 3.50.1 / Dart 3.14.0 ou versões compatíveis.

## Executar

Cadastre um terminal do tipo `TOTEM` na Central e guarde o token retornado. O seed controlado também aceita `TERMINAL_ID` e `TERMINAL_TOKEN` do ambiente. O token é específico do terminal e não deve entrar no Git.

```sh
flutter pub get
flutter run -d windows --dart-define=API_BASE_URL=http://127.0.0.1:4000 --dart-define=TERMINAL_ID=TOTEM-01 --dart-define=TERMINAL_TOKEN=<token-do-terminal> --dart-define=PRINTER_MODE=spool
```

No Android, use `-d <id-do-dispositivo>` e o endereço da Central acessível pelo dispositivo. O modo debug permite HTTP para desenvolvimento; builds de distribuição usam HTTPS. Em uma instalação comercial, `PRINTER_MODE=tcp` e `PRINTER_HOST=<ip-da-impressora>` são obrigatórios. `PRINTER_PORT` vale `9100` por padrão. `IDLE_SECONDS` configura a inatividade entre 15 e 600 segundos; o padrão é 45 segundos, seguido de um aviso de 15 segundos antes de limpar o carrinho.

O modo `spool` é explicitamente simulado: grava bytes ESC/POS em `simulated-receipts/`, dentro da pasta de suporte da aplicação. A tela e o comprovante identificam que não houve impressão física. O modo padrão é `tcp`; uma impressora não configurada impede a ativação, sem simular sucesso.

Pagamentos estão em sandbox: Crédito, Débito e Pix não cobram valores reais. O aplicativo não solicita, armazena ou registra PAN, CVV ou PIN. O comprovante é não fiscal; emissão SEFAZ fica desacoplada.

## Estrutura e garantias

- `lib/domain/`: modelos imutáveis, preços inteiros em centavos, invariantes de tamanhos/adicionais e portas de pagamento/impressão.
- `lib/data/`: HTTP com prazo de 3 segundos e fechamento do cliente no timeout; SQLite, repositórios de catálogo/checkout/outbox, simulador 2PC durável e impressão ESC/POS.
- `lib/ui/`: widgets e ViewModel `ChangeNotifier`; estados sempre combinam ícone, texto e cor.

O SQLite usa WAL, `synchronous=FULL`, chaves únicas e transações. Catálogo, tamanhos, adicionais, metadados fiscais e imagens ficam disponíveis localmente. O aplicativo precisa de uma primeira sincronização válida do cardápio antes de vender; não cria dados fictícios quando a Central estiver indisponível. O último comando de manutenção permanece bloqueante após reiniciar offline.

Cada venda gera UUIDv7 distintos para pedido e pagamento. A autorização é persistida antes de avançar. Pedido, snapshot histórico de preços/fiscais, job de impressão e outbox são gravados antes de enviar à Central. Se a resposta chegar em até 3 segundos, usa a senha central. Em timeout ou indisponibilidade, imprime uma senha de contingência composta por terminal, dia e sequência atômica local.

A fase 2 confirma o pagamento somente após persistência e aceitação do comprovante. Uma falha conhecida antes de enviar bytes do comprovante desfaz a autorização e envia cancelamento técnico idempotente, inclusive com tombstone na Central para impedir uma venda tardia após timeout. No boot, autorizações sem venda são desfeitas; vendas persistidas recuperam a mesma senha e o mesmo pagamento.

Antes de enviar à impressora, o aplicativo grava o checkpoint `PRINTING` no SQLite. Se houver falha depois do início do envio ou interrupção sem confirmação, o job fica `UNCERTAIN`: mantém a autorização, não cancela o pedido e não reimprime automaticamente no boot. O atendimento mostra a referência e permite iniciar o próximo atendimento; a pendência permanece no banner de conferência. Um atendente precisa observar o papel e confirmar a via já impressa ou pedir explicitamente uma reimpressão da mesma senha. Nenhuma dessas ações cria outra cobrança.

A outbox sincroniza em segundo plano com backoff até 5 minutos. Uma resposta `202 QUEUED` não remove a venda local: ela permanece até a Central retornar o mesmo pagamento `CONFIRMED`. Erros permanentes ficam em revisão e são identificados no banner do terminal. Preserve o arquivo `mango-kiosk.sqlite` ao trocar de máquina ou recuperar um terminal; reinstalar apagando dados pode perder vendas ainda não sincronizadas.

A impressora TCP consulta o sensor de papel (`DLE EOT 4`) antes de enviar e aguarda o recebimento no socket. Confirme no hardware escolhido o suporte a esse comando, a largura do papel, o corte e os sinais de erro. A aceitação TCP não é uma prova do papel fisicamente entregue; supervisão de spool/sensores e teste na impressora da loja fazem parte da instalação.

## Validar e distribuir

```sh
flutter analyze
flutter test
flutter build apk --debug
```

O teste REST integrado usa a API Docker real, PostgreSQL, RabbitMQ e um endpoint TCP local que recebe bytes ESC/POS. Fica em `tool/central_rest_test.dart`, fora da descoberta da suíte padrão, e exige ativação explícita:

```powershell
$env:E2E_REAL_API = '1'
flutter test tool/central_rest_test.dart
```

Execute a partir desta pasta com a infraestrutura local saudável. O teste lê as credenciais de bootstrap e do terminal diretamente de `../../.env`, sem exibi-las, e aceita apenas URL de API em loopback. Exercita uma venda online e outra em contingência, reabre o SQLite, confirma importação pela fila e mantém as mesmas chaves, preços e dados fiscais. As vendas fictícias são canceladas pelo fluxo auditado de supervisor ao final; catálogo, empresa, terminal e volumes não são alterados. A evidência sem credenciais fica em `build/evidence/central-rest.json`. O transporte TCP virtual não representa homologação de impressora física.

Os testes usam SQLite real em arquivos temporários e cobrem reabertura do banco, metadados fiscais, imagens, UUIDv7, timeout/cancelamento HTTP, autorização idempotente, órfãos no boot, impressão conhecida/incerta, checkpoints interrompidos, conferência explícita, reversão, ACKs fora de ordem, outbox `202`, manutenção, inatividade dentro de modais e interação em 360, 768 e 1080 pixels. O transporte ESC/POS é exercitado contra um servidor TCP local, incluindo sensor sem papel e timeout; isso não substitui o ensaio no hardware da loja.

A configuração Android de release nunca usa a chave debug. Para assinar a distribuição, crie `android/key.properties` local com `storeFile`, `storePassword`, `keyAlias` e `keyPassword`; esse arquivo e os keystores estão no `.gitignore`. Sem essa configuração, o build de release fica sem assinatura. Instale o sistema em modo kiosk do sistema operacional e provisione a credencial individual do terminal fora do controle de versão. O alvo web do scaffold não oferece a garantia SQLite nativa e não é suportado nesta entrega.
