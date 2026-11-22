# ADR-001: idempotência e outboxes SQLite/PostgreSQL/RabbitMQ

Data: 2026-11-21. Status: aceita pela missão de evolução do produto.

## Contexto

Reenvios após timeout e reinicializações não podem gerar outra venda, cobrança ou movimento de caixa. O terminal deve atender quando a Central estiver indisponível. Aceite do broker não comprova persistência da venda.

## Decisão

Pedido e pagamento recebem UUID v7 distintos, persistidos antes dos efeitos. PostgreSQL mantém índices únicos e advisory lock por intenção. Hash canônico rejeita reuso com outro conteúdo; a autorização também é conferida no replay. Redis mantém lock temporário e sequência diária rápida; unicidade e contador SQL continuam sendo a autoridade.

Pedido, snapshots, dinheiro e outbox central são gravados em uma transação. O worker usa publisher confirms antes de marcar entrega. Consumidores têm inbox por identificador e operações idempotentes. As filas duráveis são `kds.orders.queue`, `print.jobs.queue`, `totem.offline_sync.queue` e `fiscal.nfce.queue`, com retries de 1, 5 e 25 segundos e DLQ individual.

Flutter usa SQLite WAL com `synchronous=FULL`. Intenção, autorização, snapshots de preço/fiscal, impressão e outbox sobrevivem ao processo. O HTTP tem limite de três segundos. A senha é central ou de contingência terminal/dia/sequência. `202` mantém a venda local até lookup confirmar o mesmo pagamento. Resolução de impressão que chega antes da venda é persistida; falha técnica gera tombstone contra criação tardia.

## Alternativas consideradas

O Map do MVP perde dados e não coordena réplicas. Publicar depois do commit sem outbox cria janela de perda. Remover a venda ao receber `202` oculta falha posterior. Gerar outra chave no retry permite duplicatas. Essas alternativas não atendem à missão.

## Consequências

Entrega é pelo menos uma vez, com deduplicação. A sequência pode conter lacunas após rollback. SQLite e volumes precisam de backup. O primeiro catálogo exige sincronização válida. Alterar preço não reescreve venda offline já impressa. A credencial individual delimita a confiança do snapshot em sandbox.

Impressão física não tem commit distribuído com o banco. Journals e estado incerto impedem reenvio automático; conferência explícita pode autorizar a mesma via sem novo pedido/pagamento. Consulte o [runbook](../RUNBOOK.md).
