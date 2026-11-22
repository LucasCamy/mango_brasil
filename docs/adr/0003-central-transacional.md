# ADR-003: Central transacional, autorização e conciliação

Data: 2026-11-21. Status: aceita no escopo de reconstrução autorizado.

## Contexto e decisão

A Central permanece Node/TypeScript, compatível com os packages, e usa Fastify com DTOs Zod explícitos. Os princípios da skill backend-dotnet são aplicados sem introduzir outra stack .NET. Persistência usa `pg`, SQL versionado, transações, índices e consultas paginadas, sem Repository/CQRS ornamental.

Dinheiro usa centavos inteiros. O backend recalcula itens e valida autorização/troco. `expectedTotalCents` é precondição contra preço alterado, nunca fonte do preço. Edição de produto verifica versão e registra motivo de alteração de preço. O índice parcial impede dois turnos abertos por terminal. A ordem de locks é turno, pedido, job/linhas de pagamento e lock financeiro; recovery consulta novamente após bloqueá-lo.

JWT HttpOnly/SameSite tem sessão revogável. Requisições conferem usuário ativo e versão do token. Dono gerencia usuários/configurações; gerente gerencia cardápio/terminais e consulta auditoria; atendente opera seu turno. PIN gera autorização curta, de uso único, vinculada à ação, recurso e operador; consumo e negócio são atômicos. Totens e agente têm credenciais próprias.

Fechamento aberto omite total calculado e conferência. As quatro declarações são persistidas antes das diferenças. CASH é não negativo; eletrônicos permitem líquido negativo. Estorno de venda confirmada em turno fechado preserva relatório histórico e gera lançamento no turno atual. Void de autorização não capturada não reduz conciliação. Sem turno atual, o estorno fica no ledger e na auditoria para conferência.

Venda offline entra no turno ativo no momento da aceitação central, se houver. Data local e senha de contingência ficam no pedido. Sem turno, vínculo é nulo e exige conferência das vendas offline, sem reescrever fechamento anterior. Fechamento aguarda sincronizações conhecidas já enfileiradas para o terminal.

Catálogo usa snapshot REPEATABLE READ e geração durável atualizada por triggers. Cache Redis inclui a geração, impedindo repovoar uma versão nova com conteúdo antigo. Heartbeat tem TTL de 40 segundos e preserva manutenção. SSE distribui invalidações; HTTP periódico permite recuperar notificações perdidas. KDS recebe projeção própria sem dados financeiros/fiscais.

## Alternativas e consequências

Memória não atende durabilidade. Outra linguagem aumentaria integração sem necessidade. Locks Redis sozinhos não protegem restart do cache. Saldo esperado antes da declaração elimina fechamento cego. Alterar relatório fechado apaga a trilha histórica.

SQL explícito torna regras visíveis, mas exige revisão de migrations e testes de concorrência. Vendas offline e estornos sem turno precisam de monitoramento. Auditoria, dados locais e segredos de runtime devem ser preservados em backup.
