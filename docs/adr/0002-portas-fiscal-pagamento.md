# ADR-002: portas e adaptadores fiscal e pinpad

Data: 2026-11-21. Status: aceita pela missão; SEFAZ e SDK proprietário fora do recorte.

## Contexto

O MVP apresentava documentos sintéticos como autorizados e mantinha TEF em memória. É necessário preservar dados fiscais e ciclo financeiro sem exigir certificado A1 ou DLL específica.

## Decisão

`IFiscalGateway` recebe venda identificada. `SandboxFiscalAdapter` só aceita `disabled`/`sandbox`, retornando `NOT_EMITTED`/`SIMULATED`. Não cria XML, chave, protocolo, QR fiscal ou assinatura fictícios. A fila fica preparada para um adaptador que valide XML contra XSD antes do envio.

Empresa e produto persistem NCM, CEST, CFOP, origem, CST/CSOSN, ICMS, IBS/CBS, IBPT, CNPJ, IE, regime, CSC, série e numeração. CSC é write-only, criptografado por AES-256-GCM e ausente de respostas/auditoria.

`IPaymentTerminalGateway` separa driver e estados. O simulador usa store durável, unicidade e CAS por estado/versão. Crédito, débito e Pix percorrem `INITIALIZING`, `WAITING_CARD_OR_QR`, `PROCESSING`, `AUTHORIZED` e `CONFIRMED` ou `REVERSED`. PAN, CVV e PIN de cartão não entram na fronteira.

Confirmação exige pedido e comprovante aceitos. Falha conhecida antes do envio desfaz autorização; impressão incerta preserva pendência. Recovery consulta pedido e impressão antes de decidir, sem reverter venda por simples restart. Cancelamento comercial exige motivo e supervisor vinculado e estorna com auditoria. A rota técnica do totem só afeta a própria intenção ainda não confirmada.

## Alternativas consideradas

Acoplar SOAP/SEFAZ ou SDK ao checkout impediria testar o recorte sem hardware/credenciais. Mock aprovado sem persistência não cobre queda de energia. As portas tornam essas dependências explícitas sem uma hierarquia ornamental.

## Consequências

Não há cobrança real nem emissão NFC-e. Trocar adaptadores exige homologação do provedor, recovery real e ensaios de falha no equipamento. Banco, telas fiscais, 2PC e filas permanecem aproveitáveis. O comprovante atual é não fiscal.
