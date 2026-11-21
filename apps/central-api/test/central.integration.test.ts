import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { readFile,readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { uuidV7,type OrderInput,type Product } from '@totem-pdv/shared-types';
import { createApp } from '../src/app.js';
import { loadConfig,type Config } from '../src/config.js';
import { hashPassword,tokenHash } from '../src/security.js';
import { startWorker,recoverPaymentPendencies } from '../src/worker.js';
import { connectBroker,publishConfirmed } from '../src/broker.js';

const env=parseEnv(await readFile(new URL('../../../.env',import.meta.url),'utf8'));
const testDbName=`totem_test_${process.pid}_${randomBytes(4).toString('hex')}`;
const maintenance=new pg.Pool({connectionString:env.MIGRATION_DATABASE_URL});
let runtime:Awaited<ReturnType<typeof createApp>>,config:Config,ownerCookie:string,cashierCookie:string,otherCookie:string;
const ownerId=uuidV7(),cashierId=uuidV7(),otherId=uuidV7(),categoryId=uuidV7(),productId=uuidV7(),sizeId=uuidV7(),additionId=uuidV7();
const testPassword='Test-only-secret-2026',testPin='783921',ownerEmail=`owner-${testDbName}@example.test`;
const terminalToken=randomBytes(32).toString('hex'),otherTerminalToken=randomBytes(32).toString('hex');
const agentToken=randomBytes(32).toString('hex');
const cookieHeaders=(cookie=ownerCookie)=>({cookie});
const terminalHeaders={authorization:`Bearer ${terminalToken}`};
const agentHeaders={authorization:`Bearer ${agentToken}`};
const supervisors=async(action:string,resourceId:string,cookie=ownerCookie)=>{
 const r=await runtime.app.inject({method:'POST',url:'/api/auth/supervisor',headers:cookieHeaders(cookie),payload:{email:ownerEmail,pin:testPin,action,resourceId}});expect(r.statusCode,r.body).toBe(200);return r.json<{token:string}>().token;
};
async function terminal(type:'PDV'|'TOTEM'='PDV'){const id=`${type}-${randomBytes(4).toString('hex')}`;await runtime.db.query('INSERT INTO kiosk_terminals(id,name,type) VALUES($1,$1,$2)',[id,type]);return id;}
async function openShift(terminalId:string,initialCashCents=10000,cookie=ownerCookie){const r=await runtime.app.inject({method:'POST',url:'/api/shifts/open',headers:cookieHeaders(cookie),payload:{terminalId,initialCashCents}});expect(r.statusCode,r.body).toBe(201);return r.json<{id:string}>().id;}
function cashOrder(terminalId:string):OrderInput{return {idempotencyKey:uuidV7(),terminalId,origin:'PDV_ASSISTIDO',items:[{productId,sizeId,quantity:2,additions:[{additionId,quantity:2}]}],payment:{idempotencyKey:uuidV7(),method:'CASH',amountTenderedCents:5000}};}
async function postOrder(body:OrderInput,headers=cookieHeaders()){return runtime.app.inject({method:'POST',url:'/api/orders',headers,payload:body});}
async function waitUntil(check:()=>Promise<boolean>,timeout=10000){const start=Date.now();while(!await check()){if(Date.now()-start>timeout)throw Error('Condição não alcançada dentro do prazo de teste.');await delay(50);}}
function offlineOrder(printed=true):OrderInput{
 const now=new Date().toISOString(),paymentKey=uuidV7();
 return {idempotencyKey:uuidV7(),terminalId:'TEST-TOTEM',origin:'TOTEM',items:[{productId,sizeId,quantity:1,additions:[]}],payment:{idempotencyKey:paymentKey,method:'PIX'},offline:{createdAt:now,authorizedPayment:{idempotencyKey:paymentKey,method:'PIX',amountCents:1500,nsu:'123456789012',authorizationCode:'654321',authorizedAt:now},...(printed?{printedAt:now,confirmedAt:now,contingencyTicket:`CT-${randomBytes(4).toString('hex')}`}:{ }),lines:[{productId,productName:'Produto de teste',sizeId,sizeName:'Grande',unitPriceCents:1500,quantity:1,additions:[],totalCents:1500,fiscal:{ncm:'21069090',cest:'',cfop:'5102',origem:0,cstCsosn:'102',aliquotaIcms:0,ibsRate:0.1,cbsRate:0.9,aliquotaIbpt:12.5}}]}};
}
beforeAll(async()=>{
 await maintenance.query(`CREATE DATABASE ${pg.escapeIdentifier(testDbName)}`);
 const ownerUrl=new URL(env.MIGRATION_DATABASE_URL!);ownerUrl.pathname=`/${testDbName}`;const setup=new pg.Pool({connectionString:ownerUrl.href});
 try{
  const migrations=new URL('../migrations/',import.meta.url);for(const file of (await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort())await setup.query(await readFile(new URL(file,migrations),'utf8'));
  await setup.query('GRANT USAGE ON SCHEMA public TO totem_app');await setup.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO totem_app');await setup.query('REVOKE UPDATE,DELETE,TRUNCATE ON audit_logs FROM totem_app');
  const passwordHash=await hashPassword(testPassword),pinHash=await hashPassword(testPin);
  for(const [id,email,role,name] of [[ownerId,ownerEmail,'OWNER','Dono de teste'],[cashierId,`cashier-${testDbName}@example.test`,'CASHIER','Atendente'],[otherId,`other-${testDbName}@example.test`,'CASHIER','Outro atendente']])await setup.query('INSERT INTO users(id,name,email,password_hash,supervisor_pin_hash,role) VALUES($1,$2,$3,$4,$5,$6)',[id,name,email,passwordHash,role==='OWNER'?pinHash:null,role]);
  await setup.query("INSERT INTO kiosk_terminals(id,name,type,token_hash) VALUES('TEST-TOTEM','Totem teste','TOTEM',$1),('OTHER-TOTEM','Outro totem','TOTEM',$2)",[tokenHash(terminalToken),tokenHash(otherTerminalToken)]);
  await setup.query("INSERT INTO categories(id,name,slug) VALUES($1,'Teste','teste')",[categoryId]);
  await setup.query("INSERT INTO products(id,category_id,name,base_price_cents,ncm,cfop,origem,cst_csosn) VALUES($1,$2,'Produto de teste',1000,'21069090','5102',0,'102')",[productId,categoryId]);
  await setup.query("INSERT INTO product_sizes(id,product_id,name,price_modifier_cents) VALUES($1,$2,'Grande',500)",[sizeId,productId]);
  await setup.query("INSERT INTO product_additions(id,product_id,name,price_cents,max_quantity) VALUES($1,$2,'Queijo',200,2)",[additionId,productId]);
 }finally{await setup.end();}
 const appUrl=new URL(env.DATABASE_URL!);appUrl.pathname=`/${testDbName}`;const redisUrl=new URL(env.REDIS_URL!);redisUrl.pathname='/15';
 config=loadConfig({...env,NODE_ENV:'test',DATABASE_URL:appUrl.href,REDIS_URL:redisUrl.href,PRINT_AGENT_TOKEN:agentToken,WEB_ORIGIN:'http://localhost:5173'});
 runtime=await createApp(config);
 await runtime.realtime.redis.del('catalog:v1');
 async function login(email:string){const r=await runtime.app.inject({method:'POST',url:'/api/auth/login',payload:{email,password:testPassword}});expect(r.statusCode,r.body).toBe(200);return String(r.headers['set-cookie']).split(';')[0]!;}
 ownerCookie=await login(ownerEmail);cashierCookie=await login(`cashier-${testDbName}@example.test`);otherCookie=await login(`other-${testDbName}@example.test`);
},30000);
afterAll(async()=>{
 await runtime?.app.close();
 await maintenance.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(testDbName)} WITH (FORCE)`);await maintenance.end();
},30000);

describe('API Central com PostgreSQL e Redis reais',()=>{
 it('distingue autenticação, autorização, entrada inválida e não encontrado',async()=>{
  const anonymous=await runtime.app.inject('/api/catalog');expect(anonymous.statusCode).toBe(401);expect(anonymous.headers['content-type']).toContain('application/problem+json');
  const forbidden=await runtime.app.inject({url:'/api/audit-logs',headers:cookieHeaders(cashierCookie)});expect(forbidden.statusCode).toBe(403);
  const invalid=await runtime.app.inject({method:'POST',url:'/api/orders',headers:cookieHeaders(),payload:{idempotencyKey:'invalid'}});expect(invalid.statusCode).toBe(400);expect(invalid.json().errors).toBeDefined();
  const missing=await runtime.app.inject({url:`/api/orders/by-key/${uuidV7()}`,headers:cookieHeaders()});expect(missing.statusCode).toBe(404);
  const csrf=await runtime.app.inject({method:'POST',url:'/api/auth/logout',headers:{cookie:ownerCookie,origin:'https://untrusted.example.test'}});expect(csrf.statusCode).toBe(403);
 });
 it('impede abertura concorrente de dois turnos no mesmo terminal pelo índice parcial',async()=>{
  const terminalId=await terminal();const responses=await Promise.all(Array.from({length:8},()=>runtime.app.inject({method:'POST',url:'/api/shifts/open',headers:cookieHeaders(),payload:{terminalId,initialCashCents:10000}})));
  expect(responses.filter(r=>r.statusCode===201)).toHaveLength(1);expect(responses.filter(r=>r.statusCode===409)).toHaveLength(7);
  expect((await runtime.db.query("SELECT count(*)::int AS count FROM shifts WHERE terminal_id=$1 AND status='OPEN'",[terminalId])).rows[0]!.count).toBe(1);
 });
 it('não usa turno de outro operador nem vende sem turno',async()=>{
  const terminalId=await terminal();expect((await postOrder(cashOrder(terminalId))).statusCode).toBe(409);await openShift(terminalId,10000,cashierCookie);
  expect((await postOrder(cashOrder(terminalId),cookieHeaders(otherCookie))).statusCode).toBe(403);
  expect((await runtime.app.inject({url:`/api/shifts/current?terminalId=${terminalId}`,headers:cookieHeaders(otherCookie)})).statusCode).toBe(403);
 });
 it('replay não revela pedido de outro atendente nem referências de autorização',async()=>{
  const terminalId=await terminal();await openShift(terminalId,10000,cashierCookie);const b=cashOrder(terminalId);expect((await postOrder(b,cookieHeaders(cashierCookie))).statusCode).toBe(201);
  expect((await postOrder(b,cookieHeaders(otherCookie))).statusCode).toBe(403);
  const key=uuidV7();const a=await runtime.app.inject({method:'POST',url:'/api/payments/authorize',headers:cookieHeaders(cashierCookie),payload:{idempotencyKey:key,terminalId,method:'PIX',amountCents:3800}});expect(a.statusCode,a.body).toBe(200);
  expect((await runtime.app.inject({url:`/api/payments/${a.json().id}`,headers:cookieHeaders(otherCookie)})).statusCode).toBe(403);
  expect((await runtime.app.inject({method:'POST',url:`/api/payments/${a.json().id}/reverse`,headers:cookieHeaders(otherCookie),payload:{reason:'Tentativa por outro operador'}})).statusCode).toBe(403);
 });
 it('valida tamanho, limites de adicionais e dinheiro insuficiente antes de qualquer venda',async()=>{
  const terminalId=await terminal();await openShift(terminalId);const b=cashOrder(terminalId);b.payment.amountTenderedCents=100;
  expect((await postOrder(b)).statusCode).toBe(422);expect((await runtime.db.query('SELECT 1 FROM orders WHERE idempotency_key=$1',[b.idempotencyKey])).rowCount).toBe(0);
  const noSize=cashOrder(terminalId);delete noSize.items[0]!.sizeId;expect((await postOrder(noSize)).statusCode).toBe(400);
  const extras=cashOrder(terminalId);extras.items[0]!.additions[0]!.quantity=3;expect((await postOrder(extras)).statusCode).toBe(400);
  const changed=cashOrder(terminalId);changed.expectedTotalCents=3799;expect((await postOrder(changed)).statusCode).toBe(409);expect((await runtime.db.query('SELECT 1 FROM orders WHERE idempotency_key=$1',[changed.idempotencyKey])).rowCount).toBe(0);
 });
 it('edição exige versão atual e motivo de preço sem perder alteração concorrente',async()=>{
  const list=await runtime.app.inject({url:'/api/products?pageSize=100',headers:cookieHeaders()});const p=list.json().items.find((value:Product)=>value.id===productId) as Product;
  const {id,version,createdAt,updatedAt,...input}=p;const edit={...input,expectedVersion:version,basePriceCents:1100};
  const save=(body:unknown)=>runtime.app.inject({method:'PATCH',url:`/api/products/${id}`,headers:cookieHeaders(),payload:body as Record<string,unknown>});
  const noReason=await save(edit);expect(noReason.statusCode,noReason.body).toBe(400);
  const saved=await save({...edit,changeReason:'Reajuste controlado de teste'});expect(saved.statusCode,saved.body).toBe(200);expect(saved.json().version).toBe(version+1);
  const stale=await save({...edit,changeReason:'Cadastro antigo em outra aba'});expect(stale.statusCode).toBe(409);
  const restored=await save({...input,expectedVersion:saved.json().version,changeReason:'Restaurar fixture após teste'});expect(restored.statusCode,restored.body).toBe(200);
 });
 it('reenvio concorrente preserva uma única venda, troco, movimento, comprovante e eventos',async()=>{
  const terminalId=await terminal();await openShift(terminalId);const b=cashOrder(terminalId);const results=await Promise.all(Array.from({length:10},()=>postOrder(b)));
  expect(results.map(r=>r.statusCode),results.map(r=>r.body).join('\n')).toEqual(Array(10).fill(201));const ids=new Set(results.map(r=>r.json().id));expect(ids.size).toBe(1);const order=results[0]!.json();
  expect(order.totalCents).toBe(3800);expect(order.payments[0].changeAmountCents).toBe(1200);expect(order.payments[0].status).toBe('CONFIRMED');expect(order.nfceStatus).toBe('NOT_EMITTED');
  for(const [table,column] of [['orders','id'],['order_payments','order_id'],['cash_movements','order_id'],['print_jobs','order_id']])expect((await runtime.db.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${column}=$1`,[order.id])).rows[0]!.count).toBe(1);
  const duplicate={...b,items:[{...b.items[0]!,quantity:1}]};expect((await postOrder(duplicate)).statusCode).toBe(409);
  const reusedPayment={...b,idempotencyKey:uuidV7()};expect((await postOrder(reusedPayment)).statusCode).toBe(409);
 });
 it('exige supervisor vinculado ao recurso e torna sangria idempotente',async()=>{
  const terminalId=await terminal(),shift=await openShift(terminalId);const body={idempotencyKey:uuidV7(),type:'BLEED_SANGRIA',amountCents:2000,reason:'Retirada para cofre'};
  const send=(token?:string)=>runtime.app.inject({method:'POST',url:`/api/shifts/${shift}/movements`,headers:{...cookieHeaders(),...(token?{'x-supervisor-token':token}:{})},payload:body});
  expect((await send()).statusCode).toBe(403);const wrong=await supervisors('CASH_BLEED',uuidV7());expect((await send(wrong)).statusCode).toBe(403);
  const token=await supervisors('CASH_BLEED',shift);const done=await send(token);expect(done.statusCode,done.body).toBe(200);expect((await send(token)).json().id).toBe(done.json().id);
  const reused=await runtime.app.inject({method:'POST',url:`/api/shifts/${shift}/movements`,headers:{...cookieHeaders(),'x-supervisor-token':token},payload:{...body,idempotencyKey:uuidV7()}});expect(reused.statusCode).toBe(403);
  const tooMuch=await runtime.app.inject({method:'POST',url:`/api/shifts/${shift}/movements`,headers:{...cookieHeaders(),'x-supervisor-token':await supervisors('CASH_BLEED',shift)},payload:{...body,idempotencyKey:uuidV7(),amountCents:999999}});expect(tooMuch.statusCode).toBe(409);
 });
 it('mantém fechamento cego e só revela esperado após persistir as quatro contagens',async()=>{
  const terminalId=await terminal(),shift=await openShift(terminalId);const order=await postOrder(cashOrder(terminalId));expect(order.statusCode,order.body).toBe(201);
  const current=await runtime.app.inject({url:`/api/shifts/current?terminalId=${terminalId}`,headers:cookieHeaders()});expect(current.body).not.toMatch(/systemCalculated|reconciliation|expected|finalCalculated/);
  const early=await runtime.app.inject({url:`/api/shifts/${shift}/report`,headers:cookieHeaders()});expect(early.statusCode).toBe(409);
  const payload={declared:{CASH:13700,CREDIT_CARD:0,DEBIT_CARD:0,PIX:0},reason:'Conferência do fim do turno'};
  const closed=await runtime.app.inject({method:'POST',url:`/api/shifts/${shift}/close`,headers:{...cookieHeaders(),'x-supervisor-token':await supervisors('SHIFT_CLOSED',shift)},payload});expect(closed.statusCode,closed.body).toBe(200);const cash=closed.json().reconciliations.find((x:{method:string})=>x.method==='CASH');expect(cash).toMatchObject({systemCalculatedAmountCents:13800,operatorDeclaredAmountCents:13700,differenceCents:-100});
  const report=await runtime.app.inject({url:`/api/shifts/${shift}/report`,headers:cookieHeaders()});expect(report.statusCode).toBe(200);
  expect((await runtime.app.inject({method:'POST',url:`/api/shifts/${shift}/close`,headers:cookieHeaders(),payload})).statusCode).toBe(200);
 });
 it('cancelamento auditado devolve dinheiro uma única vez e exige PIN',async()=>{
  const terminalId=await terminal(),shift=await openShift(terminalId);const response=await postOrder(cashOrder(terminalId)),order=response.json();
  const send=(token?:string)=>runtime.app.inject({method:'POST',url:`/api/orders/${order.id}/cancel`,headers:{...cookieHeaders(),...(token?{'x-supervisor-token':token}:{})},payload:{reason:'Cliente desistiu antes do preparo'}});
  expect((await send()).statusCode).toBe(403);const cancelled=await send(await supervisors('ORDER_CANCELLED',order.id));expect(cancelled.statusCode,cancelled.body).toBe(200);expect(cancelled.json().payments[0].status).toBe('REVERSED');expect((await send(await supervisors('ORDER_CANCELLED',order.id))).statusCode).toBe(200);
  expect((await runtime.db.query("SELECT count(*)::int AS count FROM cash_movements WHERE shift_id=$1 AND type='ORDER_REFUND'",[shift])).rows[0]!.count).toBe(1);
  expect((await runtime.db.query("SELECT authorized_by_user_id FROM audit_logs WHERE resource_id=$1 AND action='ORDER_CANCELLED'",[order.id])).rows[0]!.authorized_by_user_id).toBe(ownerId);
 });
 it('concilia soma de movimentos válidos acima de um preço e do inteiro SQL de 32 bits',async()=>{
  const terminalId=await terminal(),shift=await openShift(terminalId,999999999);
  for(let i=0;i<2;i++){
   const movement=await runtime.app.inject({method:'POST',url:`/api/shifts/${shift}/movements`,headers:{...cookieHeaders(),'x-supervisor-token':await supervisors('CASH_SUPPLY',shift)},payload:{idempotencyKey:uuidV7(),type:'SUPPLY',amountCents:999999999,reason:'Movimentação de fronteira controlada'}});expect(movement.statusCode,movement.body).toBe(200);
  }
  expect((await postOrder(cashOrder(terminalId))).statusCode).toBe(201);
  const close=await runtime.app.inject({method:'POST',url:`/api/shifts/${shift}/close`,headers:{...cookieHeaders(),'x-supervisor-token':await supervisors('SHIFT_CLOSED',shift)},payload:{declared:{CASH:3000003797,CREDIT_CARD:0,DEBIT_CARD:0,PIX:0},reason:'Conferência de soma acima do limite individual'}});expect(close.statusCode,close.body).toBe(200);expect(close.json().reconciliations.find((r:{method:string})=>r.method==='CASH')).toMatchObject({systemCalculatedAmountCents:3000003797,differenceCents:0});
 });
 it('pagamento 2PC só entra no KDS após ack de impressão e bloqueia fechamento pendente',async()=>{
  const terminalId=await terminal(),shift=await openShift(terminalId),paymentKey=uuidV7();
  const authorized=await runtime.app.inject({method:'POST',url:'/api/payments/authorize',headers:cookieHeaders(),payload:{idempotencyKey:paymentKey,terminalId,method:'CREDIT_CARD',amountCents:3800}});expect(authorized.statusCode,authorized.body).toBe(200);expect(authorized.json().status).toBe('AUTHORIZED');
  const body=cashOrder(terminalId);body.payment={idempotencyKey:paymentKey,method:'CREDIT_CARD',terminalTransactionId:authorized.json().id};const response=await postOrder(body);expect(response.statusCode,response.body).toBe(201);const order=response.json();expect(order.payments[0].status).toBe('AUTHORIZED');
  const before=await runtime.app.inject({url:'/api/orders/kds',headers:cookieHeaders()});expect(before.json().some((x:{id:string})=>x.id===order.id)).toBe(false);
  const close=await runtime.app.inject({method:'POST',url:`/api/shifts/${shift}/close`,headers:{...cookieHeaders(),'x-supervisor-token':await supervisors('SHIFT_CLOSED',shift)},payload:{declared:{CASH:10000,CREDIT_CARD:3800,DEBIT_CARD:0,PIX:0},reason:'Fechar turno'}});expect(close.statusCode).toBe(409);
  const claim=await runtime.app.inject({method:'POST',url:'/api/print-agent/claim',headers:agentHeaders,payload:{terminalId}});expect(claim.statusCode,claim.body).toBe(200);const job=claim.json().job;
  const invalid=await runtime.app.inject({method:'POST',url:`/api/print-agent/jobs/${job.id}/ack`,headers:agentHeaders,payload:{claimToken:uuidV7(),status:'PRINTED'}});expect(invalid.statusCode).toBe(409);
  const printed=await runtime.app.inject({method:'POST',url:`/api/print-agent/jobs/${job.id}/ack`,headers:agentHeaders,payload:{claimToken:job.claimToken,status:'PRINTED'}});expect(printed.statusCode,printed.body).toBe(200);
  const lookup=await runtime.app.inject({url:`/api/orders/by-key/${body.idempotencyKey}`,headers:cookieHeaders()});expect(lookup.json().payments[0].status).toBe('CONFIRMED');
  const after=await runtime.app.inject({url:'/api/orders/kds',headers:cookieHeaders()});expect(after.json().some((x:{id:string})=>x.id===order.id)).toBe(true);
  expect(after.body).not.toMatch(/"payments"|"fiscal"|"unitPriceCents"|"totalCents"|"nsu"/);
  const badStage=await runtime.app.inject({method:'PATCH',url:`/api/orders/${order.id}/status`,headers:cookieHeaders(),payload:{status:'DELIVERED'}});expect(badStage.statusCode).toBe(409);
  const next=await runtime.app.inject({method:'PATCH',url:`/api/orders/${order.id}/status`,headers:cookieHeaders(),payload:{status:'PREPARING'}});expect(next.statusCode).toBe(200);expect(next.body).not.toMatch(/"payments"|"fiscal"|"unitPriceCents"|"totalCents"|"nsu"/);
 });
 it('falha conhecida de impressão desfaz autorização e cancela pedido atomicamente',async()=>{
  const terminalId=await terminal();await openShift(terminalId);const key=uuidV7();const a=await runtime.app.inject({method:'POST',url:'/api/payments/authorize',headers:cookieHeaders(),payload:{idempotencyKey:key,terminalId,method:'DEBIT_CARD',amountCents:3800}});const b=cashOrder(terminalId);b.payment={idempotencyKey:key,method:'DEBIT_CARD',terminalTransactionId:a.json().id};const order=(await postOrder(b)).json();
  const claim=(await runtime.app.inject({method:'POST',url:'/api/print-agent/claim',headers:agentHeaders,payload:{terminalId}})).json().job;
  const ack=await runtime.app.inject({method:'POST',url:`/api/print-agent/jobs/${claim.id}/ack`,headers:agentHeaders,payload:{claimToken:claim.claimToken,status:'FAILED',error:'Sem papel antes de enviar',uncertain:false}});expect(ack.statusCode,ack.body).toBe(200);
  const row=(await runtime.db.query('SELECT status FROM payment_transactions WHERE id=$1',[a.json().id])).rows[0]!;expect(row.status).toBe('REVERSED');expect((await runtime.db.query('SELECT status FROM orders WHERE id=$1',[order.id])).rows[0]!.status).toBe('CANCELLED');
 });
 it('isola credenciais dos totens e preserva modo manutenção nos heartbeats',async()=>{
  const heartbeat={appVersion:'2.0.0-test',printerStatus:'READY',pinpadStatus:'CONNECTED'};
  const cross=await runtime.app.inject({method:'POST',url:'/api/terminals/OTHER-TOTEM/heartbeat',headers:terminalHeaders,payload:heartbeat});expect(cross.statusCode).toBe(403);
  const set=await runtime.app.inject({method:'PATCH',url:'/api/terminals/TEST-TOTEM/maintenance',headers:cookieHeaders(),payload:{enabled:true,message:'Limpeza em andamento',reason:'Higienização programada'}});expect(set.statusCode).toBe(200);
  const beat=await runtime.app.inject({method:'POST',url:'/api/terminals/TEST-TOTEM/heartbeat',headers:terminalHeaders,payload:heartbeat});expect(beat.statusCode,beat.body).toBe(200);expect(beat.json().status).toBe('MAINTENANCE');
  await runtime.app.inject({method:'PATCH',url:'/api/terminals/TEST-TOTEM/maintenance',headers:cookieHeaders(),payload:{enabled:false,message:'',reason:'Higienização encerrada'}});
 });
 it('sincroniza preço histórico e fiscal completo mesmo com cardápio alterado',async()=>{
  const b=offlineOrder();await runtime.db.query('UPDATE products SET active=false,base_price_cents=9000 WHERE id=$1',[productId]);
  try{const response=await postOrder(b,terminalHeaders);expect(response.statusCode,response.body).toBe(201);const order=response.json();expect(order.totalCents).toBe(1500);expect(order.payments[0].status).toBe('CONFIRMED');expect(order.publicTicketNumber).toBe(b.offline!.contingencyTicket);expect(order.items[0].fiscal.cbsRate).toBe(0.9);expect((await runtime.db.query('SELECT 1 FROM print_jobs WHERE order_id=$1',[order.id])).rowCount).toBe(0);expect((await postOrder(b,terminalHeaders)).json().id).toBe(order.id);}finally{await runtime.db.query('UPDATE products SET active=true,base_price_cents=1000 WHERE id=$1',[productId]);}
 });
 it('tombstone antes de create impede pagamento órfão após timeout/falha de impressão',async()=>{
  const b=offlineOrder(false);const ack=await runtime.app.inject({method:'POST',url:`/api/orders/by-key/${b.idempotencyKey}/receipt`,headers:terminalHeaders,payload:{printed:false,failureReason:'Falha local antes de entregar senha'}});expect(ack.statusCode,ack.body).toBe(200);expect(ack.json().status).toBe('CANCELLED');expect((await postOrder(b,terminalHeaders)).statusCode).toBe(409);
  const racing=offlineOrder(false);const [created,cancelled]=await Promise.all([postOrder(racing,terminalHeaders),runtime.app.inject({method:'POST',url:`/api/orders/by-key/${racing.idempotencyKey}/receipt`,headers:terminalHeaders,payload:{printed:false,failureReason:'Impressão local falhou'}})]);expect([201,409]).toContain(created.statusCode);expect(cancelled.statusCode,cancelled.body).toBe(200);const remaining=await runtime.db.query("SELECT 1 FROM orders WHERE idempotency_key=$1 AND status<>'CANCELLED'",[racing.idempotencyKey]);expect(remaining.rowCount).toBe(0);
 });
 it('consome confirmação de impressão que chegou antes da intenção de venda',async()=>{
  const b=offlineOrder(false),printedAt=new Date().toISOString();const early=await runtime.app.inject({method:'POST',url:`/api/orders/by-key/${b.idempotencyKey}/receipt`,headers:terminalHeaders,payload:{printed:true,printedAt,contingencyTicket:'CT-ANTECIPADO-001'}});expect(early.json().status).toBe('AWAITING_ORDER');
  const order=await postOrder(b,terminalHeaders);expect(order.statusCode,order.body).toBe(201);expect(order.json().payments[0].status).toBe('CONFIRMED');expect(order.json().publicTicketNumber).toBe('CT-ANTECIPADO-001');
 });
 it('recovery concorrente nunca vincula uma autorização já revertida a uma venda ativa',async()=>{
  const terminalId=await terminal();await openShift(terminalId);const key=uuidV7();const a=await runtime.app.inject({method:'POST',url:'/api/payments/authorize',headers:cookieHeaders(),payload:{idempotencyKey:key,terminalId,method:'PIX',amountCents:3800}});const paymentId=a.json().id;
  await runtime.db.query("UPDATE payment_transactions SET updated_at=now()-interval '3 minutes' WHERE id=$1",[paymentId]);const b=cashOrder(terminalId);b.payment={idempotencyKey:key,method:'PIX',terminalTransactionId:paymentId};
  const [order]=await Promise.all([postOrder(b),recoverPaymentPendencies(runtime.db,runtime.orders,undefined,0)]);expect([201,409]).toContain(order.statusCode);
  const inconsistent=await runtime.db.query("SELECT 1 FROM orders o JOIN order_payments p ON p.order_id=o.id JOIN payment_transactions t ON t.id=p.terminal_transaction_id WHERE t.id=$1 AND o.status<>'CANCELLED' AND p.status='AUTHORIZED' AND t.status='REVERSED'",[paymentId]);expect(inconsistent.rowCount).toBe(0);
 });
 it('ack e cancelamento concorrentes respeitam a mesma ordem de locks',async()=>{
  const terminalId=await terminal();await openShift(terminalId);const key=uuidV7(),a=await runtime.app.inject({method:'POST',url:'/api/payments/authorize',headers:cookieHeaders(),payload:{idempotencyKey:key,terminalId,method:'PIX',amountCents:3800}});const b=cashOrder(terminalId);b.payment={idempotencyKey:key,method:'PIX',terminalTransactionId:a.json().id};const order=(await postOrder(b)).json();
  const job=(await runtime.app.inject({method:'POST',url:'/api/print-agent/claim',headers:agentHeaders,payload:{terminalId}})).json().job;const supervisor=await supervisors('ORDER_CANCELLED',order.id);
  const [ack,cancel]=await Promise.all([runtime.app.inject({method:'POST',url:`/api/print-agent/jobs/${job.id}/ack`,headers:agentHeaders,payload:{claimToken:job.claimToken,status:'PRINTED'}}),runtime.app.inject({method:'POST',url:`/api/orders/${order.id}/cancel`,headers:{...cookieHeaders(),'x-supervisor-token':supervisor},payload:{reason:'Cancelamento concorrente auditado'}})]);
  expect([200,409]).toContain(ack.statusCode);expect(cancel.statusCode,cancel.body).toBe(200);const final=(await runtime.app.inject({url:`/api/orders/by-key/${b.idempotencyKey}`,headers:cookieHeaders()})).json();expect(final.status).toBe('CANCELLED');expect(final.payments[0].status).toBe('REVERSED');
 });
 it('estorno após fechamento preserva o relatório e é conciliado no turno atual',async()=>{
  const terminalId=await terminal(),oldShift=await openShift(terminalId),key=uuidV7(),a=await runtime.app.inject({method:'POST',url:'/api/payments/authorize',headers:cookieHeaders(),payload:{idempotencyKey:key,terminalId,method:'PIX',amountCents:3800}});const b=cashOrder(terminalId);b.payment={idempotencyKey:key,method:'PIX',terminalTransactionId:a.json().id};const order=(await postOrder(b)).json();const job=(await runtime.app.inject({method:'POST',url:'/api/print-agent/claim',headers:agentHeaders,payload:{terminalId}})).json().job;
  expect((await runtime.app.inject({method:'POST',url:`/api/print-agent/jobs/${job.id}/ack`,headers:agentHeaders,payload:{claimToken:job.claimToken,status:'PRINTED'}})).statusCode).toBe(200);
  const close=async(id:string,declared:Record<string,number>)=>runtime.app.inject({method:'POST',url:`/api/shifts/${id}/close`,headers:{...cookieHeaders(),'x-supervisor-token':await supervisors('SHIFT_CLOSED',id)},payload:{declared,reason:'Contagem de turno encerrado'}});
  const closed=await close(oldShift,{CASH:10000,CREDIT_CARD:0,DEBIT_CARD:0,PIX:3800});expect(closed.statusCode,closed.body).toBe(200);
  const current=await openShift(terminalId);const cancel=await runtime.app.inject({method:'POST',url:`/api/orders/${order.id}/cancel`,headers:{...cookieHeaders(),'x-supervisor-token':await supervisors('ORDER_CANCELLED',order.id)},payload:{reason:'Devolução de venda do turno anterior'}});expect(cancel.statusCode,cancel.body).toBe(200);
  const historical=await runtime.app.inject({url:`/api/shifts/${oldShift}/report`,headers:cookieHeaders()});expect(historical.json().reconciliations.find((r:{method:string})=>r.method==='PIX').systemCalculatedAmountCents).toBe(3800);
  const next=await close(current,{CASH:10000,CREDIT_CARD:0,DEBIT_CARD:0,PIX:-3800});expect(next.statusCode,next.body).toBe(200);expect(next.json().reconciliations.find((r:{method:string})=>r.method==='PIX')).toMatchObject({systemCalculatedAmountCents:-3800,operatorDeclaredAmountCents:-3800,differenceCents:0});
 });
 it('versão geracional invalida categorias e disponibilidade sem repovoar cache antigo',async()=>{
  const get=()=>runtime.app.inject({url:'/api/catalog',headers:cookieHeaders()});const before=(await get()).json();
  const created=await runtime.app.inject({method:'POST',url:'/api/categories',headers:cookieHeaders(),payload:{name:'Categoria nova',slug:`nova-${randomBytes(3).toString('hex')}`,order:10,active:true}});expect(created.statusCode).toBe(201);const after=(await get()).json();expect(after.version).not.toBe(before.version);expect(after.categories.some((c:{id:string})=>c.id===created.json().id)).toBe(true);
  await runtime.app.inject({method:'PATCH',url:`/api/products/${productId}/availability`,headers:cookieHeaders(),payload:{active:false}});const unavailable=(await get()).json();expect(unavailable.products.some((p:{id:string})=>p.id===productId)).toBe(false);
  await runtime.app.inject({method:'PATCH',url:`/api/products/${productId}/availability`,headers:cookieHeaders(),payload:{active:true}});
 });
 it('protege CSC e impede atualização de auditoria pelo usuário da aplicação',async()=>{
  const secret='CSC_TEST_DO_NOT_LOG';const b={legalName:'Empresa de teste',tradeName:'Teste',cnpj:'00000000000000',stateRegistration:'TESTE',address:{street:'Rua de teste',number:'1',complement:'',neighborhood:'Centro',city:'Cuiabá',state:'MT',postalCode:'78000000',ibgeCityCode:'5103403'},taxRegime:'SIMPLES_NACIONAL',cscId:'1',cscToken:secret,nfceSeries:1,nextNfceNumber:1,acceptsCashOnPdv:true,inactivityTimeoutSeconds:45};
  const saved=await runtime.app.inject({method:'PATCH',url:'/api/settings',headers:cookieHeaders(),payload:b});expect(saved.statusCode,saved.body).toBe(200);expect(saved.body).not.toContain(secret);expect(saved.json().cscTokenConfigured).toBe(true);
  const log=await runtime.app.inject({url:'/api/audit-logs?pageSize=100',headers:cookieHeaders()});expect(log.body).not.toContain(secret);expect(log.body).not.toMatch(/password_hash|supervisor_pin_hash/);
  const encrypted=(await runtime.db.query('SELECT csc_token_encrypted FROM company_settings WHERE id=1')).rows[0]!.csc_token_encrypted;expect(encrypted).not.toContain(secret);
  await expect(runtime.db.query("UPDATE audit_logs SET reason='Mutação proibida' WHERE id=(SELECT id FROM audit_logs LIMIT 1)")).rejects.toMatchObject({code:'42501'});
 });
 it('SSE entrega invalidação real e libera conexão ao desconectar',async()=>{
  const address=await runtime.app.listen({port:0,host:'127.0.0.1'});const stop=new AbortController();const response=await fetch(address+'/api/events',{headers:{cookie:ownerCookie},signal:stop.signal});expect(response.status).toBe(200);const reader=response.body!.getReader();await reader.read();await runtime.realtime.publish({type:'catalog.updated',resourceId:'test-event'});const chunk=await reader.read();expect(Buffer.from(chunk.value!).toString()).toContain('event: update');stop.abort();await reader.cancel().catch(()=>{});
 });
});

describe('RabbitMQ real e sincronização durável',()=>{
 it('outbox mantém venda durante parada do worker e sincroniza exatamente uma vez após retorno',async()=>{
  const virtualHost=`${testDbName}_vhost`,rabbit=new URL(env.RABBITMQ_URL!),management='http://127.0.0.1:15679';
  const authorization='Basic '+Buffer.from(`${decodeURIComponent(rabbit.username)}:${decodeURIComponent(rabbit.password)}`).toString('base64');
  const headers={authorization,'content-type':'application/json'};
  const createdVhost=await fetch(`${management}/api/vhosts/${virtualHost}`,{method:'PUT',headers,body:'{}'});expect(createdVhost.ok).toBe(true);
  const permissions=await fetch(`${management}/api/permissions/${virtualHost}/${decodeURIComponent(rabbit.username)}`,{method:'PUT',headers,body:JSON.stringify({configure:'.*',write:'.*',read:'.*'})});expect(permissions.ok).toBe(true);
  rabbit.pathname=`/${virtualHost}`;const workerConfig={...config,RABBITMQ_URL:rabbit.href},stop=new AbortController();let worker:Promise<void>|undefined;
  try{
   const b=offlineOrder(),submit=()=>runtime.app.inject({method:'POST',url:'/api/offline-sync',headers:terminalHeaders,payload:b});
   const accepted=await submit();expect(accepted.statusCode,accepted.body).toBe(202);const id=accepted.json().id;expect((await runtime.db.query('SELECT 1 FROM orders WHERE idempotency_key=$1',[b.idempotencyKey])).rowCount).toBe(0);expect((await submit()).json().id).toBe(id);
   expect((await runtime.db.query("SELECT 1 FROM outbox_events WHERE routing_key='totem.offline_sync' AND payload->>'syncRequestId'=$1 AND published_at IS NULL",[id])).rowCount).toBe(1);
   worker=startWorker(workerConfig,stop.signal);
   await waitUntil(async()=>{const r=await runtime.db.query('SELECT status FROM offline_sync_requests WHERE id=$1',[id]);return r.rows[0]?.status==='PROCESSED';},15000);
   const lookup=await runtime.app.inject({url:`/api/orders/by-key/${b.idempotencyKey}`,headers:terminalHeaders});expect(lookup.statusCode,lookup.body).toBe(200);expect(lookup.json().payments[0].status).toBe('CONFIRMED');
   const broker=await connectBroker(rabbit.href);try{
    await publishConfirmed(broker.channel,'totem.offline_sync',Buffer.from(JSON.stringify({syncRequestId:id})),{messageId:uuidV7()});await delay(250);
    for(const queue of ['kds.orders','print.jobs','totem.offline_sync','fiscal.nfce']){expect((await broker.channel.checkQueue(`${queue}.queue`)).queue).toBe(`${queue}.queue`);expect((await broker.channel.checkQueue(`${queue}.queue.dlq`)).queue).toBe(`${queue}.queue.dlq`);}
    await publishConfirmed(broker.channel,'fiscal.nfce',Buffer.from(JSON.stringify({orderId:uuidV7()})),{messageId:uuidV7()});
    await waitUntil(async()=>{const dlq=await broker.channel.checkQueue('fiscal.nfce.queue.dlq');return dlq.messageCount===1;},40000);
   }finally{await broker.connection.close();}
   expect((await runtime.db.query('SELECT count(*)::int AS count FROM orders WHERE idempotency_key=$1',[b.idempotencyKey])).rows[0]!.count).toBe(1);
  }finally{stop.abort();await worker?.catch(()=>{});await fetch(`${management}/api/vhosts/${virtualHost}`,{method:'DELETE',headers});}
 },55000);
});
