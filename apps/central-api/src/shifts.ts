import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cashMovementInputSchema,paginationSchema,shiftCloseInputSchema,shiftOpenInputSchema,uuidV7,paymentMethods,type ShiftSummary,type ShiftReport,type CashMovement } from '@totem-pdv/shared-types';
import type { Database,DbClient } from './db.js';
import { iso } from './db.js';
import type { Auth } from './auth.js';
import { assertShiftAccess } from './auth.js';
import { audit } from './audit.js';
import { conflict,forbidden,notFound } from './problem.js';
import { enqueue,type Realtime } from './infra.js';
export function movementDTO(r:Record<string,unknown>):CashMovement{return {id:String(r.id),shiftId:String(r.shift_id),type:r.type as CashMovement['type'],amountCents:Number(r.amount_cents),reason:String(r.reason),operatorId:String(r.operator_id),operatorName:r.operator_name?String(r.operator_name):undefined,authorizedByUserId:r.authorized_by_user_id?String(r.authorized_by_user_id):undefined,orderId:r.order_id?String(r.order_id):undefined,createdAt:iso(r.created_at as Date)!};}
export const shiftSelect='SELECT s.*,u.name AS operator_name,t.name AS terminal_name FROM shifts s JOIN users u ON u.id=s.operator_id JOIN kiosk_terminals t ON t.id=s.terminal_id';
export function shiftDTO(r:Record<string,unknown>):ShiftSummary{return {id:String(r.id),terminalId:String(r.terminal_id),terminalName:String(r.terminal_name),operatorId:String(r.operator_id),operatorName:String(r.operator_name),status:r.status as ShiftSummary['status'],initialCashCents:Number(r.initial_cash_cents),openedAt:iso(r.opened_at as Date)!,closedAt:iso(r.closed_at as Date),movements:[]};}
export async function shiftReport(client:DbClient,id:string):Promise<ShiftReport>{
 const r=(await client.query(shiftSelect+' WHERE s.id=$1',[id])).rows[0];if(!r)throw notFound();if(r.status!=='CLOSED')throw conflict('A conferência só fica disponível depois do fechamento cego.');
 const rows=await client.query('SELECT * FROM shift_reconciliations WHERE shift_id=$1 ORDER BY method',[id]);
 return {...shiftDTO(r),status:'CLOSED',closedAt:iso(r.closed_at)!,reconciliations:rows.rows.map(x=>({method:x.method,systemCalculatedAmountCents:Number(x.system_calculated_amount),operatorDeclaredAmountCents:Number(x.operator_declared_amount),differenceCents:Number(x.difference)}))};
}
export async function cashBalance(client:DbClient,shiftId:string){const r=await client.query("SELECT COALESCE(sum(CASE WHEN type IN ('BLEED_SANGRIA','ORDER_REFUND') THEN -amount_cents ELSE amount_cents END),0)::bigint AS amount FROM cash_movements WHERE shift_id=$1",[shiftId]);return Number(r.rows[0]!.amount);}
export function registerShifts(app:FastifyInstance,db:Database,auth:Auth,realtime:Realtime){
 const humans=auth.require(['OWNER','MANAGER','CASHIER']);
 app.get('/api/shifts/current',{preHandler:humans},async request=>{
  const {terminalId}=z.object({terminalId:z.string().min(2).max(64)}).parse(request.query);const row=(await db.query(shiftSelect+" WHERE s.terminal_id=$1 AND s.status='OPEN'",[terminalId])).rows[0];
  if(!row)return {open:false,shift:null};assertShiftAccess(request.actor,row);return {open:true,shift:shiftDTO(row)};
 });
 app.get('/api/shifts',{preHandler:humans},async request=>{
  const {page,pageSize}=paginationSchema.parse(request.query),operator=request.actor.role==='CASHIER'?request.actor.id:null;
  const [rows,total]=await Promise.all([db.query(shiftSelect+' WHERE ($1::uuid IS NULL OR s.operator_id=$1) ORDER BY s.opened_at DESC,s.id LIMIT $2 OFFSET $3',[operator,pageSize,(page-1)*pageSize]),db.query('SELECT count(*)::int AS total FROM shifts WHERE ($1::uuid IS NULL OR operator_id=$1)',[operator])]);return {items:rows.rows.map(shiftDTO),total:total.rows[0]!.total,page,pageSize};
 });
 app.post('/api/shifts/open',{preHandler:humans},async(request,reply)=>{
  const b=shiftOpenInputSchema.parse(request.body);
  const result=await db.transaction(async client=>{
   const terminal=(await client.query('SELECT * FROM kiosk_terminals WHERE id=$1 AND active=true FOR SHARE',[b.terminalId])).rows[0];if(!terminal)throw notFound('Terminal não encontrado.');if(terminal.status==='MAINTENANCE')throw conflict('Retire o terminal do modo manutenção antes de abrir o caixa.');if(terminal.type==='TOTEM'&&request.actor.role==='CASHIER')throw forbidden('Somente o gerente pode abrir o turno de um totem.');
   const id=uuidV7();await client.query("INSERT INTO shifts(id,terminal_id,operator_id,status,initial_cash_cents) VALUES($1,$2,$3,'OPEN',$4)",[id,b.terminalId,request.actor.id,b.initialCashCents]);
   await client.query("INSERT INTO cash_movements(id,idempotency_key,shift_id,operator_id,type,amount_cents,reason) VALUES($1,$2,$3,$4,'INITIAL_SUPPLY',$5,'Fundo inicial de troco')",[uuidV7(),uuidV7(),id,request.actor.id,b.initialCashCents]);
   await audit(client,request.actor,'SHIFT_OPENED',id,'Abertura de turno',null,{terminalId:b.terminalId,initialCashCents:b.initialCashCents});const r=(await client.query(shiftSelect+' WHERE s.id=$1',[id])).rows[0]!;return shiftDTO(r);
  },request.abortSignal);await realtime.publish({type:'shift.updated',resourceId:result.id});reply.code(201);return result;
 });
 app.get('/api/shifts/:id/movements',{preHandler:humans},async request=>{
  const {id}=z.object({id:z.string().uuid()}).parse(request.params),{page,pageSize}=paginationSchema.parse(request.query);const shift=(await db.query('SELECT * FROM shifts WHERE id=$1',[id])).rows[0];if(!shift)throw notFound();assertShiftAccess(request.actor,shift);
  const [rows,total]=await Promise.all([db.query('SELECT m.*,u.name AS operator_name FROM cash_movements m JOIN users u ON u.id=m.operator_id WHERE m.shift_id=$1 ORDER BY m.created_at DESC,m.id LIMIT $2 OFFSET $3',[id,pageSize,(page-1)*pageSize]),db.query('SELECT count(*)::int AS total FROM cash_movements WHERE shift_id=$1',[id])]);return {items:rows.rows.map(movementDTO),total:total.rows[0]!.total,page,pageSize};
 });
 app.post('/api/shifts/:id/movements',{preHandler:humans},async request=>{
  const {id}=z.object({id:z.string().uuid()}).parse(request.params),b=cashMovementInputSchema.parse(request.body);
  const result=await db.transaction(async client=>{
   const shift=(await client.query('SELECT * FROM shifts WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!shift)throw notFound();assertShiftAccess(request.actor,shift);
   const old=(await client.query('SELECT * FROM cash_movements WHERE idempotency_key=$1',[b.idempotencyKey])).rows[0];
   if(old){if(old.shift_id!==id||old.operator_id!==request.actor.id||old.type!==b.type||Number(old.amount_cents)!==b.amountCents||old.reason!==b.reason)throw conflict('A chave já foi usada em outra movimentação.');return movementDTO(old);}
   if(shift.status!=='OPEN')throw conflict('O turno já foi fechado.');
   const authorizedBy=await auth.supervisor(request,client,b.type==='SUPPLY'?'CASH_SUPPLY':'CASH_BLEED',id);
   if(b.type==='BLEED_SANGRIA'&&await cashBalance(client,id)<b.amountCents)throw conflict('A sangria excede o dinheiro disponível no caixa.');
   const row=(await client.query('INSERT INTO cash_movements(id,idempotency_key,shift_id,operator_id,authorized_by_user_id,type,amount_cents,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[uuidV7(),b.idempotencyKey,id,request.actor.id,authorizedBy,b.type,b.amountCents,b.reason])).rows[0]!;
   await audit(client,request.actor,b.type==='SUPPLY'?'CASH_SUPPLY':'CASH_BLEED',id,b.reason,null,{amountCents:b.amountCents,movementId:row.id},authorizedBy);return movementDTO(row);
  },request.abortSignal);await realtime.publish({type:'shift.updated',resourceId:id});return result;
 });
 app.post('/api/shifts/:id/close',{preHandler:humans},async request=>{
  const {id}=z.object({id:z.string().uuid()}).parse(request.params),b=shiftCloseInputSchema.parse(request.body);
  const result=await db.transaction(async client=>{
   const shift=(await client.query('SELECT * FROM shifts WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!shift)throw notFound();assertShiftAccess(request.actor,shift);
   if(shift.status==='CLOSED'){const report=await shiftReport(client,id);if(report.reconciliations.some(r=>r.operatorDeclaredAmountCents!==b.declared[r.method]))throw conflict('Este turno já foi fechado com outra contagem.');return report;}
   const authorizedBy=await auth.supervisor(request,client,'SHIFT_CLOSED',id);
   const offlinePending=await client.query("SELECT 1 FROM offline_sync_requests WHERE terminal_id=$1 AND status='QUEUED' LIMIT 1",[shift.terminal_id]);if(offlinePending.rowCount)throw conflict('Há vendas offline conhecidas aguardando sincronização neste terminal. Aguarde o processamento antes de fechar.');
   const pending=await client.query("SELECT 1 FROM order_payments p JOIN orders o ON o.id=p.order_id WHERE o.shift_id=$1 AND p.status='AUTHORIZED' LIMIT 1",[id]);if(pending.rowCount)throw conflict('Há pagamento aguardando impressão/confirmacão neste turno. Resolva a pendência antes de fechar.');
   const cash=await cashBalance(client,id);const totals=await client.query("SELECT p.method,sum(p.amount_cents)::bigint AS total FROM order_payments p JOIN orders o ON o.id=p.order_id WHERE o.shift_id=$1 AND p.method<>'CASH' AND p.status='CONFIRMED' GROUP BY p.method",[id]);
   const expected:Record<string,number>={CASH:cash,CREDIT_CARD:0,DEBIT_CARD:0,PIX:0};for(const row of totals.rows)expected[String(row.method)]=Number(row.total);
   const reversals=await client.query('SELECT method,sum(amount_cents)::bigint AS total FROM payment_reversals WHERE settlement_shift_id=$1 AND original_shift_id IS DISTINCT FROM settlement_shift_id GROUP BY method',[id]);for(const row of reversals.rows)expected[String(row.method)]=(expected[String(row.method)]??0)-Number(row.total);
   for(const method of paymentMethods){if(!Number.isSafeInteger(expected[method])||Math.abs(expected[method]!)>999999999999)throw conflict('O total do turno ultrapassou o limite de conciliação. Consulte o suporte.');await client.query('INSERT INTO shift_reconciliations(id,shift_id,method,system_calculated_amount,operator_declared_amount,difference) VALUES($1,$2,$3,$4,$5,$6)',[uuidV7(),id,method,expected[method],b.declared[method],b.declared[method]-expected[method]!]);}
   await client.query("UPDATE shifts SET status='CLOSED',closed_at=now(),closed_by_user_id=$2,authorized_by_user_id=$3,close_reason=$4 WHERE id=$1",[id,request.actor.id,authorizedBy,b.reason]);
   await audit(client,request.actor,'SHIFT_CLOSED',id,b.reason,{status:'OPEN'},{status:'CLOSED',declared:b.declared},authorizedBy);
   const report=await shiftReport(client,id);await queueReport(client,report);return report;
  },request.abortSignal);await realtime.publish({type:'shift.updated',resourceId:id});return result;
 });
 app.get('/api/shifts/:id/report',{preHandler:humans},async request=>{const {id}=z.object({id:z.string().uuid()}).parse(request.params);const r=(await db.query('SELECT * FROM shifts WHERE id=$1',[id])).rows[0];if(!r)throw notFound();assertShiftAccess(request.actor,r);return shiftReport(db.pool,id);});
 app.post('/api/shifts/:id/print',{preHandler:humans},async request=>{const {id}=z.object({id:z.string().uuid()}).parse(request.params);return db.transaction(async client=>{const r=(await client.query('SELECT * FROM shifts WHERE id=$1',[id])).rows[0];if(!r)throw notFound();assertShiftAccess(request.actor,r);return {printJobId:await queueReport(client,await shiftReport(client,id))};},request.abortSignal);});
}
async function queueReport(client:DbClient,report:ShiftReport){const id=uuidV7();await client.query("INSERT INTO print_jobs(id,terminal_id,shift_id,kind,payload) VALUES($1,$2,$3,'SHIFT_REPORT',$4)",[id,report.terminalId,report.id,JSON.stringify({report})]);await enqueue(client,'print.jobs',{printJobId:id});return id;}
