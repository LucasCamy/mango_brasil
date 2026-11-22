import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import type { ConsumeMessage } from 'amqplib';
import { orderInputSchema,uuidV7 } from '@totem-pdv/shared-types';
import { SandboxFiscalAdapter } from '@totem-pdv/fiscal-engine';
import { loadConfig,type Config } from './config.js';
import { Database } from './db.js';
import { Realtime,ROUTES,type RoutingKey } from './infra.js';
import { connectBroker,dispatchOutbox,retryMessage } from './broker.js';
import { OrderService,lockOrderSettlement } from './orders.js';
import { gateway,PgPaymentTransactionStore } from './payments.js';
import { Problem } from './problem.js';
import { audit } from './audit.js';
import { hostname } from 'node:os';
export async function startWorker(config:Config,signal:AbortSignal){
 const db=new Database(config.DATABASE_URL),realtime=new Realtime(config.REDIS_URL),orders=new OrderService(db,realtime,config);
 try{
  await realtime.connect();
  while(!signal.aborted){
   let broker:Awaited<ReturnType<typeof connectBroker>>|undefined;
   try{
    broker=await connectBroker(config.RABBITMQ_URL);const channel=broker.channel;let disconnected=false;broker.connection.on('close',()=>{disconnected=true;});
    for(const route of ROUTES)await channel.consume(`${route}.queue`,async message=>{
     if(!message)return;
     try{await consume(route,message);channel.ack(message);}catch{try{await retryMessage(channel,route,message);}catch{try{channel.nack(message,false,true);}catch{/* connection lost; broker redelivers unacknowledged message */}}}
    },{noAck:false});
    let lastRecovery=0;
    while(!signal.aborted&&!disconnected){
     await dispatchOutbox(db,channel);
     await realtime.optional(()=>realtime.redis.set(`worker:heartbeat:${hostname()}`,new Date().toISOString(),{EX:45}),null);
     if(Date.now()-lastRecovery>30000){await recoverPaymentPendencies(db,orders,signal);lastRecovery=Date.now();}
     await delay(500,undefined,{signal}).catch(()=>{});
    }
   }catch{if(!signal.aborted){console.error('Worker aguardando reconexão ao broker.');await delay(3000,undefined,{signal}).catch(()=>{});}}
   finally{await broker?.connection.close().catch(()=>{});}
  }
 }finally{await realtime.close();await db.close();}
 async function consume(route:RoutingKey,message:ConsumeMessage){
  const messageId=message.properties.messageId;if(!messageId)throw Error('Mensagem sem identificador.');
  const already=await db.query('SELECT 1 FROM inbox_messages WHERE consumer=$1 AND message_id=$2',[route,messageId]);if(already.rowCount)return;
  const payload=JSON.parse(message.content.toString('utf8')) as Record<string,string>;
  if(route==='totem.offline_sync'){
   const row=(await db.query('SELECT * FROM offline_sync_requests WHERE id=$1',[payload.syncRequestId])).rows[0];if(!row)throw Error('Sincronização ausente.');
   if(row.status==='QUEUED'){
    try{
     const body=orderInputSchema.parse(row.payload);const order=await orders.create(body,{id:String(row.terminal_id),terminalId:String(row.terminal_id),role:'TERMINAL'},signal);
     await db.query("UPDATE offline_sync_requests SET status='PROCESSED',order_id=$2,processed_at=now() WHERE id=$1",[row.id,order.id]);
    }catch(error){if(error instanceof Problem&&error.status>=400&&error.status<500){await db.query("UPDATE offline_sync_requests SET status='REJECTED',error_detail=$2,processed_at=now() WHERE id=$1",[row.id,error.message]);}else throw error;}
   }
  }else if(route==='fiscal.nfce'){
   const row=(await db.query('SELECT id,idempotency_key FROM orders WHERE id=$1',[payload.orderId])).rows[0];if(!row)throw Error('Pedido fiscal ausente.');
   const result=await new SandboxFiscalAdapter(config.FISCAL_MODE).process({id:String(row.id),idempotencyKey:String(row.idempotency_key)},{signal});
   await db.query('UPDATE orders SET nfce_status=$2 WHERE id=$1',[row.id,result.nfceStatus]);
  }else if(route==='kds.orders')await realtime.publish({id:messageId,type:payload.type??'order.updated',resourceId:payload.orderId,occurredAt:new Date().toISOString()});
  else if(route==='print.jobs')await realtime.publish({id:messageId,type:'print.updated',resourceId:payload.printJobId,occurredAt:new Date().toISOString()});
  await db.query('INSERT INTO inbox_messages(consumer,message_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[route,messageId]);
 }
}
export async function recoverPaymentPendencies(db:Database,orders:OrderService,signal?:AbortSignal,graceMs=120000){
 const pending=await new PgPaymentTransactionStore(db.pool).listPending();
 for(const candidate of pending){
  signal?.throwIfAborted();
  if(Date.now()-Date.parse(candidate.updatedAt)<graceMs)continue;
  await db.transaction(async client=>{
   const before=(await client.query('SELECT order_id FROM order_payments WHERE terminal_transaction_id=$1',[candidate.id])).rows[0];
   if(before)await lockOrderSettlement(client,String(before.order_id));
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`payment:${candidate.id}`]);
   const current=await new PgPaymentTransactionStore(client).get(candidate.id);if(!current||['CONFIRMED','REVERSED','FAILED'].includes(current.status)||Date.now()-Date.parse(current.updatedAt)<graceMs)return;
   const linked=(await client.query('SELECT o.id,o.status FROM order_payments p JOIN orders o ON o.id=p.order_id WHERE p.terminal_transaction_id=$1',[candidate.id])).rows[0];
   // A create committed while the orphan lock was being acquired: release, then settle in normal lock order on the next cycle.
   if(!before&&linked)return;
   if(!linked||linked.status==='CANCELLED'){
    await gateway(client).reverse(candidate.id,{signal});
    await audit(client,{id:'worker',role:'PRINT_AGENT',terminalId:candidate.terminalId},'PAYMENT_REVERSED',candidate.id,!linked?'Autorização órfã sem pedido persistido':'Pendência de pedido cancelado',{status:current.status},{status:'REVERSED'});
   }else{
    const printed=await client.query("SELECT 1 FROM print_jobs WHERE order_id=$1 AND status IN ('PRINTED','SIMULATED') LIMIT 1",[linked.id]);
    if(printed.rowCount)await orders.confirmReceipt(client,String(linked.id),{id:'worker',role:'PRINT_AGENT'},new Date().toISOString());
   }
  },signal);
 }
 await db.query("DELETE FROM auth_sessions WHERE expires_at<now()-interval '7 days'");
 await db.query("DELETE FROM supervisor_authorizations WHERE expires_at<now()-interval '1 day'");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const stop=new AbortController();for(const sig of ['SIGINT','SIGTERM'] as const)process.once(sig,()=>stop.abort());startWorker(loadConfig(),stop.signal).catch(()=>{console.error('Worker não iniciado. Confira configuração e dependências.');process.exitCode=1;});}
