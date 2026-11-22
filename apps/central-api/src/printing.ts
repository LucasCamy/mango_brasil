import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { paginationSchema,uuidV7,type OrderDTO,type ShiftReport } from '@totem-pdv/shared-types';
import type { Database } from './db.js';
import { iso } from './db.js';
import type { Auth } from './auth.js';
import type { Config } from './config.js';
import type { Realtime } from './infra.js';
import { lockOrderSettlement,type OrderService } from './orders.js';
import { conflict,notFound } from './problem.js';
import { audit } from './audit.js';
export function printJobDTO(r:Record<string,unknown>){return {id:r.id,terminalId:r.terminal_id,orderId:r.order_id??undefined,shiftId:r.shift_id??undefined,kind:r.kind,status:r.status,attempts:Number(r.attempts),createdAt:iso(r.created_at as Date),printedAt:iso(r.completed_at as Date),payload:r.payload,lastError:r.last_error??undefined,...(r.claim_token?{claimToken:r.claim_token}:{})};}
export function registerPrinting(app:FastifyInstance,db:Database,auth:Auth,orders:OrderService,realtime:Realtime,config:Config){
 app.get('/api/print-jobs',{preHandler:auth.require(['OWNER','MANAGER','CASHIER'])},async request=>{
  const {page,pageSize}=paginationSchema.parse(request.query),b=z.object({terminalId:z.string().max(64).optional()}).parse(request.query),actor=request.actor.role==='CASHIER'?request.actor.id:null;
  const filter=' WHERE ($1::text IS NULL OR j.terminal_id=$1) AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM orders o WHERE o.id=j.order_id AND o.operator_id=$2) OR EXISTS(SELECT 1 FROM shifts s WHERE s.id=j.shift_id AND s.operator_id=$2))';
  const [rows,total]=await Promise.all([db.query('SELECT j.* FROM print_jobs j'+filter+' ORDER BY j.created_at DESC,j.id LIMIT $3 OFFSET $4',[b.terminalId??null,actor,pageSize,(page-1)*pageSize]),db.query('SELECT count(*)::int AS total FROM print_jobs j'+filter,[b.terminalId??null,actor])]);return {items:rows.rows.map(printJobDTO),total:total.rows[0]!.total,page,pageSize};
 });
 app.post('/api/print-agent/claim',{preHandler:auth.require(['PRINT_AGENT'])},async request=>{
  const b=z.object({terminalId:z.string().min(2).max(64)}).strict().parse(request.body);
  return db.transaction(async client=>{
   // Expired claims are held for review. An uncertain physical print is never sent twice automatically.
   await client.query("UPDATE print_jobs SET status='FAILED',last_error='Confirmação do agente ausente. Verifique a impressão e faça uma reimpressão auditada.' WHERE terminal_id=$1 AND status='CLAIMED' AND claimed_at<now()-interval '2 minutes'",[b.terminalId]);
   const job=(await client.query("SELECT j.* FROM print_jobs j LEFT JOIN orders o ON o.id=j.order_id WHERE j.terminal_id=$1 AND j.status='QUEUED' AND (o.id IS NULL OR o.status<>'CANCELLED') ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED",[b.terminalId])).rows[0];
   if(!job)return {job:null};
   const row=(await client.query("UPDATE print_jobs SET status='CLAIMED',claim_token=$2,claimed_at=now(),attempts=attempts+1 WHERE id=$1 RETURNING *",[job.id,uuidV7()])).rows[0]!;return {job:printJobDTO(row)};
  },request.abortSignal);
 });
 app.post('/api/print-agent/jobs/:id/ack',{preHandler:auth.require(['PRINT_AGENT'])},async request=>{
  const {id}=z.object({id:z.string().uuid()}).parse(request.params),b=z.object({claimToken:z.string().uuid(),status:z.enum(['PRINTED','FAILED','SIMULATED']),error:z.string().max(500).optional(),uncertain:z.boolean().default(false)}).strict().parse(request.body);
  if(b.status==='SIMULATED'&&config.NODE_ENV==='production')throw conflict('O transporte de spool simulado só é permitido no desenvolvimento. Configure uma impressora TCP.');
  const dto=await db.transaction(async client=>{
   const reference=(await client.query('SELECT order_id,shift_id FROM print_jobs WHERE id=$1',[id])).rows[0];if(!reference)throw notFound();
   if(reference.order_id)await lockOrderSettlement(client,String(reference.order_id));
   else if(reference.shift_id)await client.query('SELECT id FROM shifts WHERE id=$1 FOR UPDATE',[reference.shift_id]);
   const row=(await client.query('SELECT * FROM print_jobs WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw notFound();
   if(row.claim_token!==b.claimToken)throw conflict('A confirmação não pertence à reserva atual deste job.');
   if(['PRINTED','SIMULATED'].includes(String(row.status)))return printJobDTO(row);
   if(row.status!=='CLAIMED')throw conflict('O job não está reservado. Verifique o resultado físico antes de reenviar.');
   const result=(await client.query('UPDATE print_jobs SET status=$2,completed_at=now(),last_error=$3 WHERE id=$1 RETURNING *',[id,b.status,b.error??null])).rows[0]!;
   if(b.status==='PRINTED'||b.status==='SIMULATED'){
    if(row.order_id)await orders.confirmReceipt(client,String(row.order_id),{id:'print-agent',role:'PRINT_AGENT'},new Date().toISOString());
   }else if(row.order_id&&!b.uncertain){
    const pending=await client.query("SELECT 1 FROM order_payments WHERE order_id=$1 AND status='AUTHORIZED'",[row.order_id]);
    if(pending.rowCount)await orders.cancel(client,String(row.order_id),{id:'print-agent',role:'PRINT_AGENT',terminalId:String(row.terminal_id)},b.error??'Falha de impressão antes da entrega da senha',undefined,true);
   }
   await audit(client,{id:'print-agent',role:'PRINT_AGENT',terminalId:String(row.terminal_id)},b.status==='FAILED'?'PRINT_FAILED':'PRINT_COMPLETED',id,b.error??(b.status==='SIMULATED'?'Comprovante ESC/POS salvo no spool de desenvolvimento':'Comprovante aceito pela impressora'),null,{status:b.status});
   return printJobDTO(result);
  },request.abortSignal);await realtime.publish({type:'print.updated',resourceId:id});return dto;
 });
}
const money=(c:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
/** Printable characters only: user text can never inject ESC/POS commands. */
export function printerText(value:unknown){return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E\n]/g,'').slice(0,5000);}
export function buildEscPos(payload:{order?:OrderDTO;report?:ShiftReport;reprint?:boolean},simulated=false):Buffer{
 const lines:string[]=['MANGO BRASIL','COMPROVANTE NAO FISCAL'];
 if(simulated)lines.push('IMPRESSAO SIMULADA - DESENVOLVIMENTO');
 if(payload.reprint)lines.push('SEGUNDA VIA');
 if(payload.order){const o=payload.order;lines.push(`SENHA #${o.publicTicketNumber}`,`Pedido ${o.id}`,new Date(o.createdAt).toLocaleString('pt-BR',{timeZone:'America/Cuiaba'}),'--------------------------------');for(const item of o.items){lines.push(`${item.quantity}x ${item.productName}${item.sizeName?' / '+item.sizeName:''}`);for(const a of item.additions)lines.push(`  + ${a.quantity}x ${a.name}`);if(item.notes)lines.push(`  Obs: ${item.notes}`);lines.push(money(item.totalCents));}lines.push('--------------------------------',`TOTAL ${money(o.totalCents)}`);for(const p of o.payments){lines.push(`${p.method}: ${money(p.amountCents)}`);if(p.method==='CASH')lines.push(`Recebido ${money(p.amountTenderedCents??0)}`,`Troco ${money(p.changeAmountCents??0)}`);if(p.nsu)lines.push(`NSU ${p.nsu}`);}lines.push(`Fiscal: ${o.nfceStatus==='SIMULATED'?'SIMULADO':'NAO EMITIDO'}`);}
 if(payload.report){const r=payload.report;lines.push('RELATORIO DE TURNO',r.terminalId,`Operador ${r.operatorName}`,`Fechamento ${r.closedAt}`);for(const x of r.reconciliations)lines.push(x.method,`Sistema ${money(x.systemCalculatedAmountCents)}`,`Contado ${money(x.operatorDeclaredAmountCents)}`,`Diferenca ${money(x.differenceCents)}`);}
 return Buffer.concat([Buffer.from([0x1b,0x40]),Buffer.from(printerText(lines.join('\n'))+'\n\n\n','ascii'),Buffer.from([0x1d,0x56,0x42,0x00])]);
}
