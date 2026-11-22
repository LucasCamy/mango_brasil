import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  apiSchemas, cashMovementTypes, electronicPaymentMethods, fiscalModes, nfceStatuses,
  orderOrigins, orderStatuses, paymentMethods, paymentStates, reasonSchema, roles,
  taxRegimes, userUpdateInputSchema,
} from '@totem-pdv/shared-types';

type Schema = Record<string, unknown>;
type Method = 'get' | 'post' | 'patch';
type Authentication = 'public' | 'user' | 'sales' | 'terminal' | 'agent' | 'settings';
interface Operation {
  method: Method; path: string; tag: string; summary: string; response: string;
  success?: 200 | 201 | 202; body?: string; auth?: Authentication; roles?: string[];
  description?: string; errors?: number[]; pagination?: boolean; supervisor?: boolean;
  query?: { name: string; required?: boolean; schema: Schema; description?: string }[];
}

const text: Schema = { type: 'string' };
const uuid: Schema = { type: 'string', format: 'uuid' };
const uuidV7: Schema = { ...uuid, pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' };
const dateTime: Schema = { type: 'string', format: 'date-time' };
const integer: Schema = { type: 'integer' };
const cents: Schema = { ...integer, minimum: 0, maximum: 999999999, description: 'Centavos inteiros de BRL.' };
const signedCents: Schema = { ...integer, minimum: -999999999, maximum: 999999999, description: 'Modificador inteiro do preço em centavos de BRL.' };
const terminalId: Schema = { type: 'string', minLength: 2, maxLength: 64 };
const enumeration = (values: readonly string[]): Schema => ({ type: 'string', enum: values });
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const array = (items: Schema): Schema => ({ type: 'array', items });
function object(properties: Record<string, Schema>, optional: string[] = [], description?: string): Schema {
  const required = Object.keys(properties).filter((key) => !optional.includes(key));
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false, ...(description ? { description } : {}) };
}
function jsonSchema(schema: z.ZodTypeAny): Schema {
  return zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Schema;
}
function page(item: string): Schema {
  return object({ items: array(ref(item)), total: { ...integer, minimum: 0 }, page: { ...integer, minimum: 1 }, pageSize: { ...integer, minimum: 1, maximum: 100 } });
}

/** The operation list is checked against actual route registrations by a unit test. */
export const apiOperations: readonly Operation[] = [
  { method: 'post', path: '/api/auth/login', tag: 'Autenticação', summary: 'Iniciar sessão de oito horas', body: 'LoginInput', response: 'User', auth: 'public', errors: [400, 401, 503], description: 'Emite o cookie HttpOnly totem_session, SameSite=Strict e Secure em produção. O JSON contém o usuário; a sessão é revogável no banco.' },
  { method: 'get', path: '/api/auth/me', tag: 'Autenticação', summary: 'Consultar usuário autenticado', response: 'User' },
  { method: 'post', path: '/api/auth/logout', tag: 'Autenticação', summary: 'Revogar sessão e remover cookie', response: 'Success' },
  { method: 'post', path: '/api/auth/supervisor', tag: 'Autenticação', summary: 'Autorizar uma ação com PIN do supervisor', body: 'SupervisorInput', response: 'SupervisorAuthorization', errors: [400, 503], description: 'Um gerente ou dono fornece seu PIN. O token de uso único expira em 120 segundos e fica vinculado à ação, ao recurso e ao operador solicitante.' },
  { method: 'get', path: '/api/catalog', tag: 'Catálogo', summary: 'Consultar catálogo e sua geração consistente', response: 'Catalog', auth: 'sales', description: 'O totem recebe apenas produtos disponíveis no canal kiosk. O preço autoritativo continua sendo calculado pelo servidor ao criar o pedido.' },
  { method: 'get', path: '/api/categories', tag: 'Catálogo', summary: 'Listar categorias ativas e inativas', response: 'CategoryList' },
  { method: 'post', path: '/api/categories', tag: 'Catálogo', summary: 'Criar categoria', body: 'CategoryInput', response: 'ProductCategory', success: 201, roles: ['OWNER', 'MANAGER'], errors: [400, 409, 422] },
  { method: 'get', path: '/api/products', tag: 'Catálogo', summary: 'Pesquisar produtos paginados', response: 'ProductPage', pagination: true, errors: [400], query: [{ name: 'search', schema: { type: 'string', maxLength: 160 }, description: 'Busca parcial por nome, sem distinguir maiúsculas e minúsculas.' }] },
  { method: 'post', path: '/api/products', tag: 'Catálogo', summary: 'Criar produto com tamanhos, adicionais e dados fiscais', body: 'ProductInput', response: 'Product', success: 201, roles: ['OWNER', 'MANAGER'], errors: [400, 409, 422] },
  { method: 'patch', path: '/api/products/{id}', tag: 'Catálogo', summary: 'Atualizar cadastro completo com controle de versão', body: 'ProductUpdateInput', response: 'Product', roles: ['OWNER', 'MANAGER'], errors: [400, 404, 409, 422], description: 'expectedVersion deve coincidir com a versão atual. Alterar qualquer preço base, de tamanho ou adicional exige changeReason. Uma versão vencida retorna 409; não sobrescreva o cadastro sem recarregar.' },
  { method: 'patch', path: '/api/products/{id}/availability', tag: 'Catálogo', summary: 'Ativar ou desativar produto e avançar geração do catálogo', body: 'AvailabilityInput', response: 'Product', roles: ['OWNER', 'MANAGER'], errors: [400, 404, 422] },
  { method: 'post', path: '/api/payments/authorize', tag: 'Pagamentos', summary: 'Autorizar pagamento eletrônico no terminal simulado', body: 'PaymentAuthorizeInput', response: 'PaymentTransaction', auth: 'sales', errors: [400, 404, 409, 422], description: 'Primeira fase do 2PC. Um replay conserva a chave e retorna o estado persistido, inclusive um estado intermediário se outra requisição ainda estiver processando. O pedido e a impressão resolvem a segunda fase.' },
  { method: 'get', path: '/api/payments/by-key/{key}', tag: 'Pagamentos', summary: 'Consultar autorização existente pela chave da intenção', response: 'PaymentTransaction', auth: 'sales', errors: [400, 404], description: 'Consulta somente leitura para recuperação ou abandono de uma tentativa. Retorna 404 quando a intenção não possui autorização persistida; nunca inicia uma transação nem aciona o terminal. Verifica o proprietário ou a credencial do próprio terminal.' },
  { method: 'get', path: '/api/payments/{id}', tag: 'Pagamentos', summary: 'Consultar autorização persistida e seu estado', response: 'PaymentTransaction', auth: 'sales', errors: [400, 404] },
  { method: 'post', path: '/api/payments/{id}/reverse', tag: 'Pagamentos', summary: 'Desfazer autorização que ainda não pertence a pedido', body: 'ReasonInput', response: 'PaymentTransaction', auth: 'sales', errors: [400, 404, 409], description: 'Verifica operador ou credencial do próprio terminal. Pagamentos vinculados a pedido exigem o cancelamento auditado do pedido.' },
  { method: 'post', path: '/api/orders', tag: 'Pedidos', summary: 'Persistir uma intenção de venda idempotente', body: 'OrderInput', response: 'Order', success: 201, auth: 'sales', errors: [400, 404, 409, 422], description: 'A chave UUID v7 e o conteúdo original devem ser preservados nos reenvios. Replays também retornam 201. expectedTotalCents é uma precondição de preço; o servidor recalcula os itens e responde 409 se o catálogo mudou. Dinheiro é exclusivo do PDV com turno aberto.' },
  { method: 'get', path: '/api/orders', tag: 'Pedidos', summary: 'Consultar pedidos paginados permitidos ao operador', response: 'OrderPage', pagination: true, errors: [400] },
  { method: 'get', path: '/api/orders/kds', tag: 'Pedidos', summary: 'Consultar produção paga em ordem de antiguidade', response: 'ProductionOrderList', description: 'Até 200 pedidos RECEIVED, PREPARING ou READY com pagamento confirmado. DTO exclusivo de produção, sem valores, pagamentos, NSU ou dados fiscais, inclusive nos itens e adicionais.' },
  { method: 'get', path: '/api/orders/by-key/{key}', tag: 'Pedidos', summary: 'Recuperar pedido pela chave da intenção original', response: 'Order', auth: 'sales', errors: [400, 404] },
  { method: 'post', path: '/api/orders/by-key/{key}/receipt', tag: 'Pedidos', summary: 'Resolver impressão local do próprio totem', body: 'ReceiptInput', response: 'ReceiptResolutionResponse', auth: 'terminal', errors: [400, 404, 409], description: 'Uma impressão comprovada confirma a segunda fase; uma falha definitiva antes da entrega cancela a intenção. Se o pedido ainda não chegou, registra uma resolução antecipada e devolve AWAITING_ORDER ou CANCELLED. Resultado incerto exige conferência local, sem declarar printed=false automaticamente.' },
  { method: 'patch', path: '/api/orders/{id}/status', tag: 'Pedidos', summary: 'Avançar uma etapa da produção', body: 'OrderStatusInput', response: 'ProductionOrder', errors: [400, 404, 409], description: 'Avança RECEIVED -> PREPARING -> READY -> DELIVERED; repetir o estado atual é idempotente. Retorna somente a projeção de produção. Transições diferentes ou pagamento não confirmado retornam 409. Cancelamento usa a rota com supervisor.' },
  { method: 'post', path: '/api/orders/{id}/cancel', tag: 'Pedidos', summary: 'Cancelar pedido e estornar pagamento com auditoria', body: 'ReasonInput', response: 'Order', supervisor: true, errors: [400, 404, 409, 422] },
  { method: 'post', path: '/api/orders/{id}/print', tag: 'Pedidos', summary: 'Enfileirar segunda via identificada do comprovante', response: 'PrintJobReference', errors: [400, 404, 409] },
  { method: 'post', path: '/api/offline-sync', tag: 'Pedidos', summary: 'Aceitar venda de contingência para sincronização assíncrona', body: 'OfflineSyncInput', response: 'OfflineSyncAcceptance', success: 202, auth: 'terminal', errors: [400, 409, 422], description: 'Exige origem TOTEM e offline.printedAt. A aceitação não significa processamento concluído. Reenvie a mesma intenção para consultar QUEUED, PROCESSED ou REJECTED; confirme o pagamento no pedido recuperado antes de remover a outbox local.' },
  { method: 'get', path: '/api/shifts/current', tag: 'Turnos', summary: 'Consultar turno aberto sem saldo esperado', response: 'CurrentShift', errors: [400], query: [{ name: 'terminalId', required: true, schema: terminalId }] },
  { method: 'get', path: '/api/shifts', tag: 'Turnos', summary: 'Consultar histórico paginado de turnos', response: 'ShiftPage', pagination: true, errors: [400] },
  { method: 'post', path: '/api/shifts/open', tag: 'Turnos', summary: 'Abrir um único turno por terminal', body: 'ShiftOpenInput', response: 'ShiftSummary', success: 201, errors: [400, 404, 409, 422], description: 'Um índice único parcial impede duas aberturas concorrentes. Atendentes abrem PDV; apenas gerente ou dono pode abrir o turno de um totem.' },
  { method: 'get', path: '/api/shifts/{id}/movements', tag: 'Turnos', summary: 'Consultar movimentações paginadas do turno', response: 'CashMovementPage', pagination: true, errors: [400, 404] },
  { method: 'post', path: '/api/shifts/{id}/movements', tag: 'Turnos', summary: 'Registrar sangria ou suprimento idempotente', body: 'CashMovementInput', response: 'CashMovement', supervisor: true, errors: [400, 404, 409, 422] },
  { method: 'post', path: '/api/shifts/{id}/close', tag: 'Turnos', summary: 'Persistir contagem cega e revelar a conciliação', body: 'ShiftCloseInput', response: 'ShiftReport', supervisor: true, errors: [400, 404, 409, 422], description: 'Antes da primeira declaração, a API não devolve saldos esperados. Meios eletrônicos aceitam líquido negativo devido a estornos entre turnos; dinheiro permanece não negativo. Pendências conhecidas impedem o fechamento.' },
  { method: 'get', path: '/api/shifts/{id}/report', tag: 'Turnos', summary: 'Consultar conferência de turno já fechado', response: 'ShiftReport', errors: [400, 404, 409] },
  { method: 'post', path: '/api/shifts/{id}/print', tag: 'Turnos', summary: 'Enfileirar relatório do turno fechado', response: 'PrintJobReference', errors: [400, 404, 409] },
  { method: 'get', path: '/api/settings', tag: 'Empresa', summary: 'Consultar configurações permitidas ao perfil', response: 'SettingsResponse', auth: 'settings', description: 'Dono e gerente recebem CompanySettings sem CSC. O totem recebe somente tradeName, inactivityTimeoutSeconds e fiscalMode. Antes do primeiro cadastro, dados empresariais podem estar vazios e address pode ser {}.' },
  { method: 'patch', path: '/api/settings', tag: 'Empresa', summary: 'Persistir configurações empresariais e fiscais', body: 'CompanySettingsInput', response: 'CompanySettings', roles: ['OWNER'], errors: [400, 422], description: 'CSC é somente de escrita e permanece criptografado no banco. Omitir cscToken mantém o segredo anterior. A resposta e a auditoria expõem apenas cscTokenConfigured.' },
  { method: 'get', path: '/api/terminals', tag: 'Terminais', summary: 'Consultar terminais e presença por heartbeat com TTL', response: 'TerminalList' },
  { method: 'post', path: '/api/terminals', tag: 'Terminais', summary: 'Cadastrar terminal e entregar credencial inicial', body: 'TerminalInput', response: 'TerminalCreated', success: 201, roles: ['OWNER', 'MANAGER'], errors: [400, 409, 422], description: 'A credencial opaca é retornada uma única vez para terminais TOTEM; guarde-a no dispositivo. O banco armazena somente seu hash.' },
  { method: 'post', path: '/api/terminals/{id}/heartbeat', tag: 'Terminais', summary: 'Atualizar presença e estado do próprio totem', body: 'HeartbeatInput', response: 'HeartbeatResponse', auth: 'terminal', errors: [400, 404] },
  { method: 'patch', path: '/api/terminals/{id}/maintenance', tag: 'Terminais', summary: 'Alternar manutenção remota com motivo auditado', body: 'MaintenanceInput', response: 'KioskTerminal', roles: ['OWNER', 'MANAGER'], errors: [400, 404] },
  { method: 'get', path: '/api/users', tag: 'Usuários', summary: 'Consultar usuários sem hashes ou PIN', response: 'UserPage', roles: ['OWNER', 'MANAGER'], pagination: true, errors: [400] },
  { method: 'post', path: '/api/users', tag: 'Usuários', summary: 'Criar usuário', body: 'UserInput', response: 'User', success: 201, roles: ['OWNER'], errors: [400, 409, 422] },
  { method: 'patch', path: '/api/users/{id}', tag: 'Usuários', summary: 'Alterar campos informados do usuário e revogar sessões anteriores', body: 'UserUpdateInput', response: 'User', roles: ['OWNER'], errors: [400, 404, 409, 422], description: 'Todos os campos do PATCH são opcionais. A operação protege o último dono ativo e avança a versão dos tokens existentes.' },
  { method: 'get', path: '/api/audit-logs', tag: 'Auditoria', summary: 'Consultar registros imutáveis paginados', response: 'AuditLogPage', roles: ['OWNER', 'MANAGER'], pagination: true, errors: [400] },
  { method: 'get', path: '/api/print-jobs', tag: 'Impressão', summary: 'Consultar jobs de impressão paginados', response: 'PrintJobPage', pagination: true, errors: [400], query: [{ name: 'terminalId', schema: { type: 'string', maxLength: 64 } }] },
  { method: 'post', path: '/api/print-agent/claim', tag: 'Impressão', summary: 'Reservar próximo job do terminal com token exclusivo', body: 'PrintClaimInput', response: 'PrintClaimResponse', auth: 'agent', errors: [400, 409], description: 'Reservas expiradas viram falha para conferência manual. Um resultado físico incerto nunca é reenviado automaticamente.' },
  { method: 'post', path: '/api/print-agent/jobs/{id}/ack', tag: 'Impressão', summary: 'Registrar resultado da impressão para a reserva atual', body: 'PrintAckInput', response: 'PrintJob', auth: 'agent', errors: [400, 404, 409], description: 'SIMULATED é aceito apenas fora de produção e representa spool, não saída física. Falha com uncertain=true conserva a pendência para conferência; claimToken deve corresponder à reserva.' },
  { method: 'get', path: '/api/events', tag: 'Tempo real', summary: 'Receber eventos operacionais por SSE', response: 'EventStream', description: 'Fluxo text/event-stream com evento update contendo RealtimeEvent e comentários de heartbeat a cada 15 segundos. A sessão é revalidada periodicamente; alterações de dados devem ser consultadas novamente pelos endpoints REST.' },
  { method: 'get', path: '/health/live', tag: 'Operação', summary: 'Consultar vivacidade do processo', response: 'Liveness', auth: 'public' },
  { method: 'get', path: '/health/ready', tag: 'Operação', summary: 'Consultar dependências e pendências da outbox', response: 'Readiness', auth: 'public', errors: [503] },
  { method: 'get', path: '/api/openapi.json', tag: 'Operação', summary: 'Obter este contrato OpenAPI', response: 'OpenApiDocument', auth: 'public' },
];

function buildSchemas(): Record<string, Schema> {
  const schemas: Record<string, Schema> = Object.fromEntries(Object.entries(apiSchemas).map(([name, schema]) => [name, jsonSchema(schema)]));
  schemas.UserUpdateInput = jsonSchema(userUpdateInputSchema.partial().strict());
  for (const property of Object.values(schemas.UserUpdateInput.properties as Record<string, Schema>)) delete property.default;
  for (const [name, field] of [['LoginInput', 'password'], ['SupervisorInput', 'pin'], ['UserInput', 'password'], ['UserInput', 'supervisorPin'], ['UserUpdateInput', 'password'], ['UserUpdateInput', 'supervisorPin'], ['CompanySettingsInput', 'cscToken']] as const) {
    const property = (schemas[name]!.properties as Record<string, Schema>)[field];
    if (property) property.writeOnly = true;
  }
  schemas.AvailabilityInput = jsonSchema(z.object({ active: z.boolean() }).strict());
  schemas.ReasonInput = jsonSchema(z.object({ reason: reasonSchema }).strict());
  schemas.OrderStatusInput = jsonSchema(z.object({ status: z.enum(orderStatuses) }).strict());
  schemas.ReceiptInput = jsonSchema(z.object({ printed: z.boolean(), printedAt: z.string().datetime().optional(), contingencyTicket: z.string().max(80).optional(), failureReason: reasonSchema.optional() }).strict());
  const receiptProperties = schemas.ReceiptInput.properties as Record<string, Schema>;
  receiptProperties.printedAt = { ...receiptProperties.printedAt, description: 'Instante UTC com sufixo Z. Se omitido em printed=true, a Central usa seu horário atual.', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$' };
  schemas.PrintClaimInput = jsonSchema(z.object({ terminalId: z.string().min(2).max(64) }).strict());
  schemas.PrintAckInput = jsonSchema(z.object({ claimToken: z.string().uuid(), status: z.enum(['PRINTED', 'FAILED', 'SIMULATED']), error: z.string().max(500).optional(), uncertain: z.boolean().default(false) }).strict());
  const productInput = schemas.ProductInput!;
  schemas.ProductUpdateInput = { ...productInput, required: [...new Set([...(productInput.required as string[]), 'expectedVersion'])], description: 'Cadastro completo, versão esperada obrigatória e motivo obrigatório se houver alteração de preço.' };
  const orderInput = schemas.OrderInput!;
  const orderProperties = orderInput.properties as Record<string, Schema>;
  const offline = orderProperties.offline!;
  schemas.OfflineSyncInput = { ...orderInput, properties: { ...orderProperties, origin: enumeration(['TOTEM']), offline: { ...offline, required: [...new Set([...(offline.required as string[]), 'printedAt'])] } }, required: [...new Set([...(orderInput.required as string[]), 'offline'])] };

  schemas.ProblemDetails = {
    type: 'object', required: ['type', 'title', 'status', 'detail'], additionalProperties: true,
    description: 'RFC 9457, application/problem+json. errors e requestId são extensões; nenhuma credencial ou dado de cartão é incluído.',
    properties: { type: { type: 'string', format: 'uri-reference' }, title: text, status: { ...integer, minimum: 400, maximum: 599 }, detail: text, instance: text, requestId: text, errors: { type: 'object', additionalProperties: array(text) } },
  };
  schemas.User = object({ id: uuid, name: text, email: { type: 'string', format: 'email' }, role: enumeration(roles), active: { type: 'boolean' }, createdAt: dateTime });
  schemas.Success = object({ success: { type: 'boolean', enum: [true] } });
  schemas.SupervisorAuthorization = object({ token: { type: 'string', description: 'JWT de elevação de uso único; enviar somente em x-supervisor-token na ação autorizada.' }, expiresIn: { type: 'integer', enum: [120], description: 'Segundos até expirar.' } });
  schemas.ProductCategory = object({ id: uuid, name: text, slug: text, order: { ...integer, minimum: 0 }, active: { type: 'boolean' } });
  schemas.FiscalTaxData = object({ ncm: { type: 'string', pattern: '^\\d{8}$' }, cest: { type: 'string', pattern: '^(?:\\d{7})?$' }, cfop: { type: 'string', pattern: '^\\d{4}$' }, origem: { ...integer, minimum: 0, maximum: 8 }, cstCsosn: { type: 'string', pattern: '^\\d{2,3}$' }, aliquotaIcms: { type: 'number', minimum: 0, maximum: 100 }, ibsRate: { type: 'number', minimum: 0, maximum: 100 }, cbsRate: { type: 'number', minimum: 0, maximum: 100 }, aliquotaIbpt: { type: 'number', minimum: 0, maximum: 100 } });
  schemas.ProductSize = object({ id: uuid, name: text, priceModifierCents: signedCents, priceCents: { ...cents, nullable: true, description: 'Preço específico; null usa preço base mais modificador.' } });
  schemas.ProductAddition = object({ id: uuid, name: text, priceCents: cents, maxQuantity: { ...integer, minimum: 1, maximum: 50 } });
  schemas.Product = object({ id: uuid, categoryId: uuid, name: text, description: text, imageUrl: { type: 'string', description: 'URL da imagem, inclusive AVIF/WebP, ou string vazia quando não cadastrada.' }, basePriceCents: cents, active: { type: 'boolean' }, availableInKiosk: { type: 'boolean' }, availableInPdv: { type: 'boolean' }, sizes: array(ref('ProductSize')), additions: array(ref('ProductAddition')), fiscal: ref('FiscalTaxData'), version: { ...integer, minimum: 1 }, createdAt: dateTime, updatedAt: dateTime });
  schemas.Catalog = object({ categories: array(ref('ProductCategory')), products: array(ref('Product')), version: { type: 'string', description: 'Geração monotônica do catálogo, codificada como string.' } });
  schemas.PaymentTransaction = object({ id: uuid, idempotencyKey: uuidV7, terminalId, method: enumeration(electronicPaymentMethods), amountCents: { ...cents, minimum: 1 }, status: enumeration(paymentStates), version: { ...integer, minimum: 0 }, nsu: text, authorizationCode: text, failureCode: text, createdAt: dateTime, updatedAt: dateTime }, ['nsu', 'authorizationCode', 'failureCode']);
  schemas.SelectedAddition = object({ additionId: uuid, name: text, priceCents: cents, quantity: { ...integer, minimum: 1, maximum: 50 } });
  schemas.OrderItem = object({ id: uuid, productId: uuid, productName: text, sizeId: uuid, sizeName: text, unitPriceCents: cents, quantity: { ...integer, minimum: 1, maximum: 99 }, additions: array(ref('SelectedAddition')), notes: text, totalCents: cents, fiscal: ref('FiscalTaxData') }, ['sizeId', 'sizeName', 'notes']);
  schemas.OrderPayment = object({ id: uuid, idempotencyKey: uuidV7, method: enumeration(paymentMethods), amountCents: { ...cents, minimum: 1 }, amountTenderedCents: cents, changeAmountCents: cents, terminalTransactionId: uuid, authorizationCode: text, nsu: text, status: enumeration(['AUTHORIZED', 'CONFIRMED', 'REVERSED']), paidAt: dateTime }, ['amountTenderedCents', 'changeAmountCents', 'terminalTransactionId', 'authorizationCode', 'nsu', 'paidAt']);
  schemas.Order = object({ id: uuid, idempotencyKey: uuidV7, publicTicketNumber: text, terminalId, origin: enumeration(orderOrigins), shiftId: { ...uuid, nullable: true }, status: enumeration(orderStatuses), items: array(ref('OrderItem')), subtotalCents: { ...cents, minimum: 1 }, totalCents: { ...cents, minimum: 1 }, payments: array(ref('OrderPayment')), nfceStatus: enumeration(nfceStatuses), offline: { type: 'boolean' }, createdAt: dateTime, updatedAt: dateTime });
  schemas.ProductionAddition = object({ additionId: uuid, name: text, quantity: { ...integer, minimum: 1, maximum: 50 } });
  schemas.ProductionOrderItem = object({ id: uuid, productId: uuid, productName: text, sizeId: uuid, sizeName: text, quantity: { ...integer, minimum: 1, maximum: 99 }, notes: text, additions: array(ref('ProductionAddition')) }, ['sizeId', 'sizeName', 'notes']);
  schemas.ProductionOrder = object({ id: uuid, publicTicketNumber: text, origin: enumeration(orderOrigins), status: enumeration(orderStatuses), items: array(ref('ProductionOrderItem')), createdAt: dateTime, updatedAt: dateTime });
  schemas.ReceiptAcknowledgement = object({ acknowledged: { type: 'boolean', enum: [true] }, idempotencyKey: uuidV7, status: enumeration(['AWAITING_ORDER', 'CANCELLED']) });
  schemas.ReceiptResolutionResponse = { oneOf: [ref('Order'), ref('ReceiptAcknowledgement')] };
  schemas.OfflineSyncAcceptance = object({ id: uuid, accepted: { type: 'boolean', enum: [true] }, status: enumeration(['QUEUED', 'PROCESSED', 'REJECTED']), orderId: uuid, errorDetail: text }, ['orderId', 'errorDetail']);
  schemas.CashMovement = object({ id: uuid, shiftId: uuid, type: enumeration(cashMovementTypes), amountCents: cents, reason: text, operatorId: uuid, operatorName: text, authorizedByUserId: uuid, orderId: uuid, createdAt: dateTime }, ['operatorName', 'authorizedByUserId', 'orderId']);
  schemas.ShiftSummary = object({ id: uuid, terminalId, terminalName: text, operatorId: uuid, operatorName: text, status: enumeration(['OPEN', 'CLOSED']), initialCashCents: cents, openedAt: dateTime, closedAt: dateTime, movements: array(ref('CashMovement')) }, ['closedAt'], 'Resumo sem saldo esperado nem conciliações. A coleção movements permanece vazia neste resumo; use o endpoint paginado de movimentações.');
  const declaredSchema = (schemas.ShiftCloseInput!.properties as Record<string, Schema>).declared!;
  const reconciliationLimit = Number(((declaredSchema.properties as Record<string, Schema>).CASH!).maximum);
  const reconciliationCents: Schema = { ...integer, minimum: -reconciliationLimit, maximum: reconciliationLimit, description: 'Valor de conciliação em centavos inteiros de BRL.' };
  schemas.Reconciliation = object({ method: enumeration(paymentMethods), systemCalculatedAmountCents: reconciliationCents, operatorDeclaredAmountCents: reconciliationCents, differenceCents: { ...integer, minimum: -2 * reconciliationLimit, maximum: 2 * reconciliationLimit } }, [], 'Valores inteiros em centavos. Meios eletrônicos podem ter líquido negativo; differenceCents = operatorDeclaredAmountCents - systemCalculatedAmountCents.');
  schemas.ShiftReport = { ...schemas.ShiftSummary, properties: { ...(schemas.ShiftSummary.properties as Record<string, Schema>), status: enumeration(['CLOSED']), reconciliations: { ...array(ref('Reconciliation')), minItems: 4, maxItems: 4 } }, required: [...(schemas.ShiftSummary.required as string[]), 'closedAt', 'reconciliations'], description: 'Conferência disponível somente após a contagem cega ter sido persistida. O fechamento é imutável; estornos posteriores são lançados separadamente.' };
  schemas.CurrentShift = { oneOf: [object({ open: { type: 'boolean', enum: [false] }, shift: { type: 'object', nullable: true, enum: [null] } }), object({ open: { type: 'boolean', enum: [true] }, shift: ref('ShiftSummary') })] };
  schemas.CompanyAddress = object({ street: text, number: text, complement: text, neighborhood: text, city: text, state: text, postalCode: text, ibgeCityCode: text }, ['street', 'number', 'complement', 'neighborhood', 'city', 'state', 'postalCode', 'ibgeCityCode'], 'Pode ser {} antes do primeiro cadastro. Depois de configurado, contém os campos validados no CompanySettingsInput.');
  schemas.CompanySettings = object({ legalName: text, tradeName: text, cnpj: text, stateRegistration: text, address: ref('CompanyAddress'), taxRegime: enumeration(taxRegimes), cscId: text, cscTokenConfigured: { type: 'boolean' }, nfceSeries: { ...integer, minimum: 1, maximum: 999 }, nextNfceNumber: { ...integer, minimum: 1 }, acceptsCashOnPdv: { type: 'boolean' }, inactivityTimeoutSeconds: { ...integer, minimum: 15, maximum: 600 }, fiscalMode: enumeration(fiscalModes), updatedAt: dateTime }, [], 'Dados podem estar vazios antes da configuração inicial. cscToken nunca aparece em respostas.');
  schemas.TerminalSettings = object({ tradeName: text, inactivityTimeoutSeconds: { ...integer, minimum: 15, maximum: 600 }, fiscalMode: enumeration(fiscalModes) });
  schemas.SettingsResponse = { oneOf: [ref('CompanySettings'), ref('TerminalSettings')] };
  schemas.KioskTerminal = object({ id: terminalId, name: text, type: enumeration(['PDV', 'TOTEM']), ipAddress: text, appVersion: text, status: enumeration(['ONLINE', 'OFFLINE', 'MAINTENANCE']), printerStatus: enumeration(['READY', 'OUT_OF_PAPER', 'ERROR']), pinpadStatus: enumeration(['CONNECTED', 'DISCONNECTED']), maintenanceMessage: text, lastHeartbeatAt: dateTime, currentShiftId: uuid }, ['ipAddress', 'lastHeartbeatAt', 'currentShiftId']);
  const terminalProperties = schemas.KioskTerminal.properties as Record<string, Schema>;
  const terminalOptional = ['ipAddress', 'lastHeartbeatAt', 'currentShiftId'];
  schemas.TerminalCreated = { oneOf: [object({ ...terminalProperties, type: enumeration(['PDV']) }, terminalOptional), object({ ...terminalProperties, type: enumeration(['TOTEM']), token: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Exibida somente uma vez; não registrar em logs.' } }, terminalOptional)] };
  schemas.HeartbeatResponse = object({ terminalId, status: enumeration(['ONLINE', 'OFFLINE', 'MAINTENANCE']), maintenanceMessage: text, serverTime: dateTime, catalogVersion: text });
  schemas.AuditLog = object({ id: uuid, actorUserId: text, actorName: text, authorizedByUserId: uuid, action: enumeration(['ORDER_CANCELLED', 'PAYMENT_REVERSED', 'SHIFT_OPENED', 'SHIFT_CLOSED', 'CASH_BLEED', 'CASH_SUPPLY', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_PRICE_CHANGED', 'KIOSK_MAINTENANCE_TOGGLED', 'USER_CREATED', 'USER_UPDATED', 'COMPANY_SETTINGS_UPDATED', 'TERMINAL_CREATED', 'PRINT_FAILED', 'PRINT_COMPLETED']), resourceId: text, reason: text, before: { type: 'object', nullable: true, additionalProperties: true, description: 'Snapshot anterior sanitizado ou null.' }, after: { type: 'object', nullable: true, additionalProperties: true, description: 'Snapshot posterior sanitizado ou null.' }, createdAt: dateTime }, ['authorizedByUserId']);
  schemas.OrderPrintPayload = object({ order: ref('Order'), reprint: { type: 'boolean' } });
  schemas.ShiftPrintPayload = object({ report: ref('ShiftReport') });
  schemas.PrintJob = object({ id: uuid, terminalId, orderId: uuid, shiftId: uuid, kind: enumeration(['ORDER_RECEIPT', 'SHIFT_REPORT']), status: enumeration(['QUEUED', 'CLAIMED', 'PRINTED', 'FAILED', 'SIMULATED']), attempts: { ...integer, minimum: 0 }, createdAt: dateTime, printedAt: { ...dateTime, description: 'Horário de conclusão do job; também existe em falhas concluídas.' }, payload: { oneOf: [ref('OrderPrintPayload'), ref('ShiftPrintPayload')] }, lastError: text, claimToken: uuid }, ['orderId', 'shiftId', 'printedAt', 'lastError', 'claimToken']);
  schemas.PrintJobReference = object({ printJobId: uuid });
  schemas.PrintClaimResponse = object({ job: { ...schemas.PrintJob, nullable: true } });
  schemas.RealtimeEvent = object({ id: uuid, type: enumeration(['catalog.updated', 'order.created', 'order.updated', 'terminal.updated', 'shift.updated', 'print.updated', 'settings.updated']), resourceId: text, occurredAt: dateTime }, ['id', 'resourceId', 'occurredAt']);
  schemas.Liveness = object({ status: enumeration(['alive']) });
  schemas.Readiness = object({ status: enumeration(['ready']), database: enumeration(['ready']), redis: enumeration(['ready']), outboxPending: { ...integer, minimum: 0 } });
  schemas.ReadinessUnavailable = { oneOf: [object({ status: enumeration(['degraded']), database: enumeration(['ready']), redis: enumeration(['unavailable']) }), object({ status: enumeration(['unavailable']) })] };
  schemas.OpenApiDocument = object({ openapi: enumeration(['3.0.3']), info: { type: 'object', required: ['title', 'version'], properties: { title: text, version: text, description: text }, additionalProperties: true }, servers: array({ type: 'object', required: ['url'], properties: { url: text }, additionalProperties: true }), paths: { type: 'object', additionalProperties: { type: 'object', additionalProperties: true }, description: 'Path Items e operações definidos pela OpenAPI 3.0.3.' }, components: { type: 'object', additionalProperties: true, description: 'Schemas, respostas e mecanismos de segurança deste contrato.' }, tags: array({ type: 'object', properties: { name: text }, required: ['name'], additionalProperties: true }) });
  schemas.CategoryList = array(ref('ProductCategory'));
  schemas.TerminalList = array(ref('KioskTerminal'));
  schemas.ProductionOrderList = { ...array(ref('ProductionOrder')), maxItems: 200 };
  for (const [name, item] of Object.entries({ ProductPage: 'Product', OrderPage: 'Order', ShiftPage: 'ShiftSummary', CashMovementPage: 'CashMovement', UserPage: 'User', AuditLogPage: 'AuditLog', PrintJobPage: 'PrintJob' })) schemas[name] = page(item);
  return schemas;
}

const problemDescriptions: Record<number, string> = {
  400: 'Entrada, referência ou formato inválido; errors identifica campos quando aplicável.',
  401: 'Credencial ausente, inválida, revogada ou expirada.',
  403: 'Perfil, terminal, proprietário do recurso ou autorização de supervisor não permite esta ação.',
  404: 'Registro solicitado não encontrado.',
  409: 'Conflito de estado, versão, idempotência ou transação já vinculada.',
  413: 'Corpo da requisição ultrapassa o limite de 1 MiB.',
  422: 'Dados violam uma invariante de negócio ou constraint persistente.',
  429: 'Limite de requisições, conexões SSE ou tentativas de credenciais atingido.',
  500: 'Falha interna; efeitos incertos devem ser consultados usando as mesmas chaves.',
  503: 'Dependência indisponível, timeout, deadlock ou conflito transacional; reenvie a mesma intenção.',
};

function security(mode: Authentication): Record<string, never[]>[] {
  if (mode === 'public') return [];
  if (mode === 'terminal') return [{ terminalToken: [] }];
  if (mode === 'agent') return [{ printAgentToken: [] }];
  const human: Record<string, never[]>[] = [{ sessionCookie: [] }, { bearerAuth: [] }];
  return mode === 'sales' || mode === 'settings' ? [...human, { terminalToken: [] }] : human;
}

/** Pure and deterministic: no environment, clock, database or secrets are read. */
export function buildOpenApi() {
  const schemas = buildSchemas();
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of apiOperations) {
    const auth = operation.auth ?? 'user';
    const parameters: Record<string, unknown>[] = [...operation.path.matchAll(/\{(\w+)\}/g)].map((match) => ({ name: match[1], in: 'path', required: true, schema: operation.path.startsWith('/api/terminals/') ? terminalId : operation.path.startsWith('/api/payments/by-key/') ? uuidV7 : uuid }));
    if (operation.pagination) parameters.push({ name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } }, { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } });
    for (const query of operation.query ?? []) parameters.push({ ...query, in: 'query', required: query.required ?? false });
    if (operation.supervisor) parameters.push({ name: 'x-supervisor-token', in: 'header', required: true, schema: { type: 'string', minLength: 1 }, description: 'JWT de uso único emitido por POST /api/auth/supervisor para esta ação, recurso e operador. Necessário na primeira execução; replays concluídos preservam o resultado original.' });
    const success = operation.success ?? 200;
    const response: Record<string, unknown> = operation.response === 'EventStream'
      ? { description: 'Fluxo SSE autenticado aberto. Falhas posteriores encerram a conexão.', content: { 'text/event-stream': { schema: { type: 'string' }, example: ': connected\n\nevent: update\ndata: {"type":"order.created","resourceId":"019aabbc-ddee-7000-8000-000000000001"}\n\n: heartbeat\n\n', 'x-event-schema': ref('RealtimeEvent') } } }
      : { description: success === 201 ? 'Registro persistido. Pedidos idempotentes conservam o resultado e o status 201 em replay.' : success === 202 ? 'Intenção aceita para processamento assíncrono; consulte status e pedido antes de concluir a sincronização.' : 'Operação concluída.', content: { 'application/json': { schema: ref(operation.response) } } };
    if (operation.path === '/api/auth/login') response.headers = { 'Set-Cookie': { description: 'totem_session=<JWT>; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800. Secure em produção.', schema: { type: 'string' } } };
    const responses: Record<string, unknown> = { [success]: response };
    const errors = new Set([...(operation.errors ?? []), 429, 500]);
    if (auth !== 'public') { errors.add(401); errors.add(403); errors.add(503); }
    if (operation.body) errors.add(413);
    for (const status of [...errors].sort((left, right) => left - right)) responses[status] = { description: problemDescriptions[status]!, content: { 'application/problem+json': { schema: ref('ProblemDetails') } } };
    if (operation.path === '/health/ready') responses[503] = { description: 'Banco ou Redis indisponível.', content: { 'application/json': { schema: ref('ReadinessUnavailable') } } };
    const allowedRoles = operation.roles ?? (auth === 'terminal' ? ['TERMINAL'] : auth === 'agent' ? ['PRINT_AGENT'] : auth === 'sales' ? [...roles, 'TERMINAL'] : auth === 'settings' ? ['OWNER', 'MANAGER', 'TERMINAL'] : auth === 'public' ? [] : [...roles]);
    (paths[operation.path] ??= {})[operation.method] = {
      operationId: `${operation.method}_${operation.path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
      tags: [operation.tag], summary: operation.summary, ...(operation.description ? { description: operation.description } : {}),
      security: security(auth), 'x-roles': allowedRoles, ...(parameters.length ? { parameters } : {}), responses,
      ...(operation.body ? { requestBody: { required: true, content: { 'application/json': { schema: ref(operation.body) } } } } : {}),
    };
  }
  return {
    openapi: '3.0.3',
    info: { title: 'Mango Brasil | Totem e PDV Central', version: '2.0.0', description: 'API operacional. Valores monetários em centavos de BRL; chaves de pedidos e pagamentos são UUID v7. NFC-e opera em disabled/sandbox e TEF permanece simulado com 2PC durável. Erros seguem RFC 9457. As permissões de papel são descritas por x-roles e a posse de recursos continua validada no servidor.' },
    servers: [{ url: '/' }],
    tags: [...new Set(apiOperations.map((operation) => operation.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'totem_session', description: 'Sessão de usuário JWT em cookie HttpOnly, emitida pelo login e validada contra a sessão revogável persistida.' },
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT de sessão de usuário com emissor, audiência e sessão persistida válidos.' },
        terminalToken: { type: 'http', scheme: 'bearer', description: 'Credencial opaca exclusiva do totem. Somente rotas explicitamente habilitadas aceitam esta credencial; o terminal só acessa seus próprios recursos.' },
        printAgentToken: { type: 'http', scheme: 'bearer', description: 'Credencial do agente ESC/POS, restrita às rotas /api/print-agent/*.' },
      },
      schemas,
    },
  };
}
