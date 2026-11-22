# Central Web

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Atendentes trabalham no balcão, gerentes supervisionam caixa e cozinha, donos administram catálogo, usuários e parâmetros da empresa. Os perfis são CASHIER, MANAGER e OWNER.

## Product Purpose

Registrar vendas, orientar a produção e encerrar turnos com rastreabilidade. O catálogo e os pedidos também atendem o aplicativo Flutter do totem.

## Operating Context

PDV operado por toque e teclado, KDS em tablet, gestão em desktop e consultas em telas a partir de 360 px. Valores monetários trafegam como centavos inteiros. Autenticação é necessária; cancelamentos e operações restritas exigem autorização de supervisor e motivo.

## Capabilities and Constraints

Os requisitos estão na missão fornecida pelo usuário e no AGENTS.md da raiz: fechamento cego sem saldo esperado antes do envio; pagamentos 2PC; SQLite offline no totem; PostgreSQL, Redis e RabbitMQ na Central; dados fiscais preservados com emissão fiscal sandbox/desativada e pinpad simulado. Integrações físicas comerciais e emissão SEFAZ não fazem parte desta etapa.

## Brand Commitments

Mango Brasil, idioma português brasileiro, metáfora funcional Mesa de Comando Operacional & Livro-Razão de Balcão. Não há logo fornecido; a marca usa texto.

## Evidence on Hand

MVP existente e missão anexada. Nenhum dado operacional real, depoimento ou homologação comercial foi apresentado. Dados de exemplo devem ser identificados como demonstração.

## Product Principles

- Priorizar a próxima ação operacional.
- Preservar a chave idempotente durante tentativas de uma mesma operação.
- Mostrar confirmação de pagamento somente quando o servidor informar CONFIRMED.
- Exigir motivos e autorização para ações restritas.

## Accessibility & Inclusion

Contraste WCAG AA, estado com ícone, texto e cor, controle por teclado, foco restituído ao fechar diálogos, alvos de toque de 48 px e movimento reduzido.

## Fonte

Registro derivado do briefing explícito e do código existente, pelo subagente sem ferramenta de entrevista. Nenhuma alegação de aprovação visual ou homologação externa.
