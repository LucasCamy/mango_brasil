import { PaymentGatewayError,SimulatedPinpadAdapter,type PaymentTransactionStore } from '@totem-pdv/tef-client';
import { paymentAuthorizeInputSchema,reasonSchema,uuidV7,type PaymentState,type PaymentTransaction } from '@totem-pdv/shared-types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database,DbClient } from './db.js';
import { iso } from './db.js';
import type { Auth } from './auth.js';
import { assertTerminalAccess } from './auth.js';
import { conflict,forbidden,notFound } from './problem.js';
import { audit,type Actor } from './audit.js';
export function transactionDTO(r:Record<string,unknown>):PaymentTransaction{return {id:String(r.id),idempotencyKey:String(r.idempotency_key),terminalId:String(r.terminal_id),method:r.method as PaymentTransaction['method'],amountCents:Number(r.amount_cents),status:r.status as PaymentState,version:Number(r.version),nsu:r.nsu?String(r.nsu):undefined,authorizationCode:r.authorization_code?String(r.authorization_code):undefined,failureCode:r.error_code?String(r.error_code):undefined,createdAt:iso(r.created_at as Date)!,updatedAt:iso(r.updated_at as Date)!};}
export class PgPaymentTransactionStore implements PaymentTransactionStore {
  constructor(private client:DbClient,private initiatedBy?:string){}
  async get(id:string){const r=await this.client.query('SELECT * FROM payment_transactions WHERE id=$1',[id]);return r.rows[0]?transactionDTO(r.rows[0]):undefined;}
  async findByIdempotencyKey(key:string){const r=await this.client.query('SELECT * FROM payment_transactions WHERE idempotency_key=$1',[key]);return r.rows[0]?transactionDTO(r.rows[0]):undefined;}
  async create(tx:PaymentTransaction){
    const r=await this.client.query('INSERT INTO payment_transactions(id,idempotency_key,terminal_id,method,amount_cents,status,nsu,authorization_code,version,created_at,updated_at,initiated_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *',[tx.id,tx.idempotencyKey,tx.terminalId,tx.method,tx.amountCents,tx.status,tx.nsu??null,tx.authorizationCode??null,tx.version,tx.createdAt,tx.updatedAt,this.initiatedBy??null]);
    if(r.rows[0])return transactionDTO(r.rows[0]);const existing=await this.findByIdempotencyKey(tx.idempotencyKey);if(!existing)throw new PaymentGatewayError('CONFLICT','Autorização concorrente. Reenvie a mesma chave.');return existing;
  }
  async update(tx:PaymentTransaction,expectedStatus:PaymentState){
    const r=await this.client.query('UPDATE payment_transactions SET status=$2,version=$3,nsu=$4,authorization_code=$5,error_code=$6,updated_at=$7 WHERE id=$1 AND status=$8 AND version=$9 RETURNING *',[tx.id,tx.status,tx.version,tx.nsu??null,tx.authorizationCode??null,tx.failureCode??null,tx.updatedAt,expectedStatus,tx.version-1]);
    if(!r.rows[0])throw new PaymentGatewayError('CONFLICT','O pagamento foi alterado por outra operação.');return transactionDTO(r.rows[0]);
  }
  async listPending(){const r=await this.client.query("SELECT * FROM payment_transactions WHERE status NOT IN ('CONFIRMED','REVERSED','FAILED') ORDER BY created_at LIMIT 100");return r.rows.map(transactionDTO);}
}
export const gateway=(client:DbClient,delay=0,initiatedBy?:string)=>new SimulatedPinpadAdapter(new PgPaymentTransactionStore(client,initiatedBy),{stepDelayMs:delay,orphanGracePeriodMs:120000});
export async function assertPaymentAccess(client:DbClient,actor:Actor,id:string){const r=(await client.query('SELECT terminal_id,initiated_by_user_id FROM payment_transactions WHERE id=$1',[id])).rows[0];if(!r)throw notFound();assertTerminalAccess(actor,String(r.terminal_id));if(actor.role==='CASHIER'&&r.initiated_by_user_id!==actor.id)throw forbidden('Esta autorização pertence a outro operador.');}
export function registerPayments(app:FastifyInstance,db:Database,auth:Auth){
 app.post('/api/payments/authorize',{preHandler:auth.require(['OWNER','MANAGER','CASHIER','TERMINAL'])},async request=>{
   const b=paymentAuthorizeInputSchema.parse(request.body);assertTerminalAccess(request.actor,b.terminalId);
   const terminal=await db.query('SELECT type,status,active FROM kiosk_terminals WHERE id=$1',[b.terminalId]);
   if(!terminal.rows[0])throw notFound('Terminal não encontrado.');if(!terminal.rows[0].active||terminal.rows[0].status==='MAINTENANCE')throw conflict('O terminal está em manutenção.');
   if(request.actor.role!=='TERMINAL'&&terminal.rows[0].type!=='PDV')throw forbidden('Use a credencial própria do totem.');
   if(terminal.rows[0].type==='PDV'){
    const shifts=await db.query("SELECT operator_id FROM shifts WHERE terminal_id=$1 AND status='OPEN'",[b.terminalId]);
    if(!shifts.rows[0])throw conflict('Abra um turno antes de iniciar o pagamento.');
    if(request.actor.role==='CASHIER'&&shifts.rows[0].operator_id!==request.actor.id)throw forbidden('O turno pertence a outro operador.');
   }
   const previous=(await db.query('SELECT id FROM payment_transactions WHERE idempotency_key=$1',[b.idempotencyKey])).rows[0];if(previous)await assertPaymentAccess(db.pool,request.actor,String(previous.id));
   return gateway(db.pool,250,request.actor.role==='TERMINAL'?undefined:request.actor.id).authorize(b,{signal:request.abortSignal});
 });
 app.get('/api/payments/:id',{preHandler:auth.require(['OWNER','MANAGER','CASHIER','TERMINAL'])},async request=>{
   const {id}=z.object({id:z.string().uuid()}).parse(request.params);await assertPaymentAccess(db.pool,request.actor,id);const result=await new PgPaymentTransactionStore(db.pool).get(id);if(!result)throw notFound();return result;
 });
 app.post('/api/payments/:id/reverse',{preHandler:auth.require(['OWNER','MANAGER','CASHIER','TERMINAL'])},async request=>{
   const {id}=z.object({id:z.string().uuid()}).parse(request.params),b=z.object({reason:reasonSchema}).strict().parse(request.body);
   return db.transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`payment:${id}`]);
    await assertPaymentAccess(client,request.actor,id);const transaction=await new PgPaymentTransactionStore(client).get(id);if(!transaction)throw notFound();
    const linked=await client.query('SELECT order_id FROM order_payments WHERE terminal_transaction_id=$1',[id]);if(linked.rowCount)throw conflict('O pagamento pertence a um pedido. Use o cancelamento auditado do pedido.');
    const result=await gateway(client).reverse(id,{signal:request.abortSignal});await audit(client,request.actor,'PAYMENT_REVERSED',id,b.reason,{status:transaction.status},{status:result.status});return result;
   },request.abortSignal);
 });
}
