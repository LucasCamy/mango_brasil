import { z } from 'zod';
import { orderInputSchema,orderStatusSchema,paginationSchema,reasonSchema,uuidV7,type OrderInput,type OrderDTO,type OrderItem,type ProductionOrderDTO } from '@totem-pdv/shared-types';
import { SandboxFiscalAdapter } from '@totem-pdv/fiscal-engine';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import type { Database,DbClient } from './db.js';
import { iso } from './db.js';
import type { Auth } from './auth.js';
import { assertShiftAccess,assertTerminalAccess } from './auth.js';
import { audit,type Actor } from './audit.js';
import { enqueue,type Realtime } from './infra.js';
import { badRequest,conflict,forbidden,notFound,Problem } from './problem.js';
import { intentHash } from './security.js';
import { productSelect,productDTO } from './catalog.js';
import { gateway,PgPaymentTransactionStore,assertPaymentAccess } from './payments.js';

export const orderSelect=`SELECT o.*,
COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'productName',i.product_name,'sizeId',i.size_id,'sizeName',i.size_name,'unitPriceCents',i.unit_price_cents,'quantity',i.quantity,'notes',i.notes,'totalCents',i.total_price_cents,'fiscal',i.fiscal,'additions',COALESCE((SELECT jsonb_agg(jsonb_build_object('additionId',a.addition_id,'name',a.name,'priceCents',a.price_cents,'quantity',a.quantity) ORDER BY a.id) FROM order_item_additions a WHERE a.order_item_id=i.id),'[]'::jsonb)) ORDER BY i.id) FROM order_items i WHERE i.order_id=o.id),'[]'::jsonb) AS items,
COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'idempotencyKey',p.idempotency_key,'method',p.method,'amountCents',p.amount_cents,'amountTenderedCents',p.amount_tendered_cents,'changeAmountCents',p.change_amount_cents,'terminalTransactionId',p.terminal_transaction_id,'status',p.status,'paidAt',p.paid_at,'nsu',t.nsu,'authorizationCode',t.authorization_code)) FROM order_payments p LEFT JOIN payment_transactions t ON t.id=p.terminal_transaction_id WHERE p.order_id=o.id),'[]'::jsonb) AS payments FROM orders o`;
export function orderDTO(r:Record<string,unknown>):OrderDTO{
 const compact=<T>(value:unknown):T=>Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==null&&v!==undefined)) as T;
 return {id:String(r.id),idempotencyKey:String(r.idempotency_key),publicTicketNumber:String(r.contingency_ticket??r.public_ticket_number),terminalId:String(r.terminal_id),origin:r.origin as OrderDTO['origin'],shiftId:r.shift_id?String(r.shift_id):null,status:r.status as OrderDTO['status'],items:(r.items as unknown[]).map(i=>compact<OrderDTO['items'][number]>(i)),subtotalCents:Number(r.subtotal_cents),totalCents:Number(r.total_cents),payments:(r.payments as unknown[]).map(p=>compact<OrderDTO['payments'][number]>(p)),nfceStatus:r.nfce_status as OrderDTO['nfceStatus'],offline:Boolean(r.offline_created_at),createdAt:iso(r.created_at as Date)!,updatedAt:iso(r.updated_at as Date)!};
}
export async function readOrder(client:DbClient,id:string,byKey=false):Promise<OrderDTO>{const r=await client.query(orderSelect+` WHERE o.${byKey?'idempotency_key':'id'}=$1`,[id]);if(!r.rows[0])throw notFound('Pedido não encontrado.');return orderDTO(r.rows[0]);}
/** Settlement lock order is shift -> order -> print job/payment rows -> payment advisory lock. */
export async function lockOrderSettlement(client:DbClient,id:string){
 const reference=(await client.query('SELECT shift_id FROM orders WHERE id=$1',[id])).rows[0];if(!reference)throw notFound('Pedido não encontrado.');
 if(reference.shift_id)await client.query('SELECT id FROM shifts WHERE id=$1 FOR UPDATE',[reference.shift_id]);
 const row=(await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw notFound();return row;
}
export function orderIntent(b:OrderInput){return intentHash({idempotencyKey:b.idempotencyKey,terminalId:b.terminalId,origin:b.origin,items:b.items,payment:b.payment,expectedTotalCents:b.expectedTotalCents,offline:b.offline?{authorizedPayment:b.offline.authorizedPayment,createdAt:b.offline.createdAt,lines:b.offline.lines}:undefined});}
export function productionOrderDTO(order:OrderDTO):ProductionOrderDTO{return {id:order.id,publicTicketNumber:order.publicTicketNumber,origin:order.origin,status:order.status,createdAt:order.createdAt,updatedAt:order.updatedAt,items:order.items.map(i=>({id:i.id,productId:i.productId,productName:i.productName,sizeId:i.sizeId,sizeName:i.sizeName,quantity:i.quantity,notes:i.notes,additions:i.additions.map(a=>({additionId:a.additionId,name:a.name,quantity:a.quantity}))}))};}
export function businessDate(date:Date,timeZone:string){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function totalLine(line:{unitPriceCents:number;quantity:number;additions:{priceCents:number;quantity:number}[]}){const total=(line.unitPriceCents+line.additions.reduce((s,a)=>s+a.priceCents*a.quantity,0))*line.quantity;if(!Number.isSafeInteger(total)||total<0||total>999999999)throw new Problem(422,'Valor inválido','O total do item excede o limite permitido.','amount');return total;}
export class OrderService {
 constructor(readonly db:Database,readonly realtime:Realtime,readonly config:Config){}
 async create(b:OrderInput,actor:Actor,signal?:AbortSignal):Promise<OrderDTO>{
   assertTerminalAccess(actor,b.terminalId);
   if(actor.role==='TERMINAL'&&b.origin!=='TOTEM')throw forbidden('Um totem só pode registrar pedidos de autoatendimento.');
   if(actor.role!=='TERMINAL'&&(b.origin!=='PDV_ASSISTIDO'||b.offline))throw forbidden('Use a credencial do terminal para vendas do totem.');
   const redisLockKey=`idempotency:order:${b.idempotencyKey}`,redisLockToken=uuidV7();
   const redisLocked=await this.realtime.optional(()=>this.realtime.redis.set(redisLockKey,redisLockToken,{NX:true,PX:15000}),null);
   try{return await this.db.transaction(async client=>{
     await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[b.idempotencyKey]);
     const receiptResolution=(await client.query('SELECT * FROM terminal_receipt_resolutions WHERE idempotency_key=$1',[b.idempotencyKey])).rows[0];
     if(receiptResolution&&receiptResolution.terminal_id!==b.terminalId)throw forbidden('A resolução da impressão pertence a outro terminal.');
     if(receiptResolution&&!receiptResolution.printed)throw conflict('Esta intenção foi cancelada pelo terminal após falha de impressão.');
     const printedAt=b.offline?.printedAt??(receiptResolution?.printed?new Date(receiptResolution.printed_at??receiptResolution.created_at).toISOString():undefined);
     const contingencyTicket=b.offline?.contingencyTicket??receiptResolution?.contingency_ticket??undefined;
     const hash=orderIntent(b),existing=await client.query('SELECT id,intent_hash,operator_id,terminal_id FROM orders WHERE idempotency_key=$1',[b.idempotencyKey]);
     if(existing.rows[0]){
       if(actor.role==='CASHIER'&&existing.rows[0].operator_id!==actor.id)throw forbidden('Este pedido pertence a outro operador.');
       assertTerminalAccess(actor,String(existing.rows[0].terminal_id));
       if(existing.rows[0].intent_hash!==hash)throw conflict('A chave já pertence a um pedido com dados diferentes.');
       if(actor.role==='TERMINAL'&&printedAt)await this.confirmReceipt(client,String(existing.rows[0].id),actor,printedAt,contingencyTicket);
       return readOrder(client,String(existing.rows[0].id));
     }
     const terminal=(await client.query('SELECT * FROM kiosk_terminals WHERE id=$1 AND active=true FOR SHARE',[b.terminalId])).rows[0];
     if(!terminal)throw notFound('Terminal não encontrado ou desativado.');
     if(terminal.type!==(b.origin==='TOTEM'?'TOTEM':'PDV'))throw conflict('A origem do pedido não corresponde ao terminal.');
     const offlinePrinted=actor.role==='TERMINAL'&&Boolean(printedAt);
     if(!offlinePrinted&&terminal.status==='MAINTENANCE')throw conflict('O terminal está em manutenção.');
     if(!offlinePrinted&&actor.role==='TERMINAL'&&terminal.printer_status!=='READY')throw conflict('Verifique o papel da impressora antes de iniciar uma venda.');
     const shift=(await client.query("SELECT * FROM shifts WHERE terminal_id=$1 AND status='OPEN' FOR UPDATE",[b.terminalId])).rows[0];
     if(b.origin==='PDV_ASSISTIDO'&&!shift)throw conflict('Abra o turno deste terminal antes de vender.');
     if(shift&&b.origin==='PDV_ASSISTIDO')assertShiftAccess(actor,shift);
     const lines=await this.priceLines(client,b,actor);
     const total=lines.reduce((s,line)=>s+line.totalCents,0);
     if(!Number.isSafeInteger(total)||total<=0||total>999999999)throw new Problem(422,'Total inválido','O pedido precisa ter um total positivo dentro do limite.','amount');
     if(b.expectedTotalCents!==undefined&&b.expectedTotalCents!==total)throw conflict('O preço do catálogo mudou. Revise o pedido e o troco antes de finalizar.');
     let transactionId:string|null=null;
     if(b.payment.method==='CASH'){
       const settings=(await client.query('SELECT accepts_cash_on_pdv FROM company_settings WHERE id=1')).rows[0];
       if(!settings?.accepts_cash_on_pdv)throw conflict('O recebimento em dinheiro está desativado.');
       if((b.payment.amountTenderedCents??0)<total)throw new Problem(422,'Dinheiro insuficiente','O valor recebido precisa cobrir o total da venda.','cash-insufficient');
     }else{
       const store=new PgPaymentTransactionStore(client);
       let paymentId=b.payment.terminalTransactionId;
       if(b.offline?.authorizedPayment&&actor.role==='TERMINAL'){
         const proof=b.offline.authorizedPayment;
         if(proof.amountCents!==total)throw conflict('O total do pagamento offline difere dos itens vendidos.');
         paymentId=(await store.create({id:uuidV7(),idempotencyKey:proof.idempotencyKey,terminalId:b.terminalId,method:proof.method,amountCents:proof.amountCents,status:'AUTHORIZED',version:0,nsu:proof.nsu,authorizationCode:proof.authorizationCode,createdAt:proof.authorizedAt,updatedAt:proof.authorizedAt})).id;
       }
       if(!paymentId)throw conflict('Autorize o pagamento antes de registrar o pedido.');
       await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`payment:${paymentId}`]);
       await assertPaymentAccess(client,actor,paymentId);
       const payment=await store.get(paymentId);
       if(!payment)throw conflict('Autorize o pagamento antes de registrar o pedido.');
       if(payment.idempotencyKey!==b.payment.idempotencyKey||payment.terminalId!==b.terminalId||payment.method!==b.payment.method||payment.amountCents!==total)throw conflict('A autorização não corresponde ao terminal, valor, método ou chave deste pagamento.');
       if(payment.status!=='AUTHORIZED')throw conflict('O pagamento precisa estar autorizado e ainda não confirmado.');
       transactionId=payment.id;
     }
     const date=businessDate(new Date(b.offline?.createdAt??Date.now()),this.config.BUSINESS_TIMEZONE);
     await client.query('INSERT INTO daily_ticket_counters(business_date,last_number) VALUES($1,1) ON CONFLICT(business_date) DO NOTHING',[date]);
     const counter=(await client.query('SELECT last_number FROM daily_ticket_counters WHERE business_date=$1 FOR UPDATE',[date])).rows[0]!;
     const used=(await client.query('SELECT COALESCE(max(ticket_sequence),0)::int AS value FROM orders WHERE business_date=$1',[date])).rows[0]!;
     const base=Math.max(Number(counter.last_number)-1,Number(used.value));
     const sequence=await this.realtime.optional(async()=>Number(await this.realtime.redis.eval("local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n<tonumber(ARGV[1]) then redis.call('SET',KEYS[1],ARGV[1]); end; local v=redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],259200); return v",{keys:[`ticket:${date}`],arguments:[String(base)]})),base+1);
     await client.query('UPDATE daily_ticket_counters SET last_number=$2 WHERE business_date=$1',[date,sequence]);
     const id=uuidV7(),fiscal=await new SandboxFiscalAdapter(this.config.FISCAL_MODE).process({id,idempotencyKey:b.idempotencyKey},{signal});
     await client.query("INSERT INTO orders(id,idempotency_key,intent_hash,terminal_id,operator_id,shift_id,origin,business_date,ticket_sequence,public_ticket_number,status,subtotal_cents,total_cents,nfce_status,offline_created_at,contingency_ticket) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'RECEIVED',$11,$11,$12,$13,$14)",[id,b.idempotencyKey,hash,b.terminalId,actor.role==='TERMINAL'?null:actor.id,shift?.id??null,b.origin,date,sequence,String(sequence).padStart(3,'0'),total,fiscal.nfceStatus,b.offline?.createdAt??null,offlinePrinted?contingencyTicket??null:null]);
     for(const line of lines){
       signal?.throwIfAborted();
       await client.query('INSERT INTO order_items(id,order_id,product_id,product_name,size_id,size_name,unit_price_cents,quantity,total_price_cents,notes,fiscal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[line.id,id,line.productId,line.productName,line.sizeId??null,line.sizeName??null,line.unitPriceCents,line.quantity,line.totalCents,line.notes??'',JSON.stringify(line.fiscal)]);
       for(const a of line.additions){signal?.throwIfAborted();await client.query('INSERT INTO order_item_additions(id,order_item_id,addition_id,name,price_cents,quantity) VALUES($1,$2,$3,$4,$5,$6)',[uuidV7(),line.id,a.additionId,a.name,a.priceCents,a.quantity]);}
     }
     const cash=b.payment.method==='CASH';
     await client.query('INSERT INTO order_payments(id,order_id,idempotency_key,method,amount_cents,amount_tendered_cents,change_amount_cents,terminal_transaction_id,status,paid_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[uuidV7(),id,b.payment.idempotencyKey,b.payment.method,total,cash?b.payment.amountTenderedCents:null,cash?b.payment.amountTenderedCents!-total:null,transactionId,cash?'CONFIRMED':'AUTHORIZED',cash?new Date():null]);
     if(cash&&shift)await client.query("INSERT INTO cash_movements(id,idempotency_key,shift_id,order_id,operator_id,type,amount_cents,reason) VALUES($1,$2,$3,$4,$5,'ORDER_PAYMENT',$6,$7)",[uuidV7(),b.payment.idempotencyKey,shift.id,id,actor.id,total,`Venda #${String(sequence).padStart(3,'0')}`]);
     let order=await readOrder(client,id);
     if(b.origin==='PDV_ASSISTIDO')await this.print(client,order,false);
     else if(printedAt){await this.confirmReceipt(client,id,actor,printedAt,contingencyTicket);order=await readOrder(client,id);}
     if(cash)await enqueue(client,'kds.orders',{orderId:id,type:'order.created'});
     await enqueue(client,'fiscal.nfce',{orderId:id});
     return order;
   },signal);}finally{if(redisLocked)await this.realtime.optional(()=>this.realtime.redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",{keys:[redisLockKey],arguments:[redisLockToken]}),0);}
 }
 private async priceLines(client:DbClient,b:OrderInput,actor:Actor):Promise<OrderItem[]>{
   const ids=[...new Set(b.items.map(i=>i.productId))];
   const result=await client.query(productSelect+' WHERE p.id=ANY($1::uuid[]) ORDER BY p.id FOR SHARE OF p',[ids]);
   const products=new Map(result.rows.map(r=>{const p=productDTO(r);return [p.id,p] as const;}));
   if(products.size!==ids.length)throw notFound('Um dos produtos não existe.');
   const snapshots=b.offline?.lines;
   if(snapshots&&actor.role==='TERMINAL'){
     if(snapshots.length!==b.items.length)throw conflict('O snapshot offline não corresponde aos itens.');
     return snapshots.map((line,index)=>{
       const item=b.items[index]!;
       const refs=(adds:{additionId:string;quantity:number}[])=>adds.map(x=>({additionId:x.additionId,quantity:x.quantity})).sort((a,c)=>a.additionId.localeCompare(c.additionId));
       if(line.productId!==item.productId||line.sizeId!==item.sizeId||line.quantity!==item.quantity||(line.notes??'')!==(item.notes??'')||intentHash(refs(line.additions))!==intentHash(refs(item.additions)))throw conflict('As referências do snapshot offline diferem do pedido.');
       if(line.totalCents!==totalLine(line))throw conflict('O preço do snapshot offline não fecha com os adicionais e quantidades.');
       return {...line,id:uuidV7()};
     });
   }
   return b.items.map(item=>{
     const product=products.get(item.productId)!;
     if(!product.active||(b.origin==='TOTEM'?!product.availableInKiosk:!product.availableInPdv))throw conflict(`${product.name} não está disponível neste canal.`);
     const size=item.sizeId?product.sizes.find(s=>s.id===item.sizeId):undefined;
     if(product.sizes.length&&!size)throw badRequest(`Escolha um tamanho válido para ${product.name}.`);
     if(item.sizeId&&!size)throw badRequest('O tamanho escolhido não pertence ao produto.');
     const additions=item.additions.map(selected=>{const a=product.additions.find(x=>x.id===selected.additionId);if(!a||selected.quantity>a.maxQuantity)throw badRequest('Adicional inválido ou quantidade acima do permitido.');return {additionId:a.id,name:a.name,priceCents:a.priceCents,quantity:selected.quantity};});
     const line:OrderItem={id:uuidV7(),productId:product.id,productName:product.name,sizeId:size?.id,sizeName:size?.name,unitPriceCents:size?.priceCents??product.basePriceCents+(size?.priceModifierCents??0),quantity:item.quantity,additions,notes:item.notes,totalCents:0,fiscal:product.fiscal};line.totalCents=totalLine(line);return line;
   });
 }
 async confirmReceipt(client:DbClient,id:string,actor:Actor,printedAt:string,contingencyTicket?:string){
   const row=await lockOrderSettlement(client,id);assertTerminalAccess(actor,String(row.terminal_id));
   if(row.status==='CANCELLED')throw conflict('O pedido já foi cancelado.');
   const payments=await client.query('SELECT * FROM order_payments WHERE order_id=$1 FOR UPDATE',[id]);
   for(const p of payments.rows){
     if(p.status==='REVERSED')throw conflict('O pagamento já foi desfeito.');
     if(p.status==='CONFIRMED')continue;
     if(p.terminal_transaction_id){await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`payment:${p.terminal_transaction_id}`]);await gateway(client).confirm(String(p.terminal_transaction_id));}
     await client.query("UPDATE order_payments SET status='CONFIRMED',paid_at=$2 WHERE id=$1",[p.id,printedAt]);
     await enqueue(client,'kds.orders',{orderId:id,type:'order.created'});
   }
   if(contingencyTicket)await client.query('UPDATE orders SET contingency_ticket=$2,updated_at=now() WHERE id=$1 AND contingency_ticket IS NULL',[id,contingencyTicket]);
 }
 async print(client:DbClient,order:OrderDTO,reprint:boolean){
   const id=uuidV7();await client.query("INSERT INTO print_jobs(id,terminal_id,order_id,kind,payload) VALUES($1,$2,$3,'ORDER_RECEIPT',$4)",[id,order.terminalId,order.id,JSON.stringify({order,reprint})]);await enqueue(client,'print.jobs',{printJobId:id});return id;
 }
 async cancel(client:DbClient,id:string,actor:Actor,reason:string,authorizedBy?:string,technical=false){
   const row=await lockOrderSettlement(client,id);assertTerminalAccess(actor,String(row.terminal_id));
   if(row.status==='CANCELLED')return readOrder(client,id);
   const order=await readOrder(client,id);if(actor.role==='CASHIER'&&row.operator_id!==actor.id)throw forbidden();
   const payments=await client.query('SELECT * FROM order_payments WHERE order_id=$1 FOR UPDATE',[id]);
   if(technical&&payments.rows.some(p=>p.status==='CONFIRMED'))throw conflict('Uma venda confirmada exige cancelamento por supervisor.');
   const refundShift=(await client.query("SELECT * FROM shifts WHERE terminal_id=$1 AND status='OPEN' FOR UPDATE",[row.terminal_id])).rows[0];
   for(const p of payments.rows){
    if(p.status==='REVERSED')continue;
    if(p.terminal_transaction_id){
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`payment:${p.terminal_transaction_id}`]);
      await gateway(client).reverse(String(p.terminal_transaction_id));
      if(p.status==='CONFIRMED')await client.query('INSERT INTO payment_reversals(id,order_payment_id,original_shift_id,settlement_shift_id,amount_cents,method,user_id,authorized_by_user_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(order_payment_id) DO NOTHING',[uuidV7(),p.id,row.shift_id??null,refundShift?.id??null,p.amount_cents,p.method,['TERMINAL','PRINT_AGENT'].includes(actor.role)?null:actor.id,authorizedBy??null,reason]);
      await audit(client,actor,'PAYMENT_REVERSED',String(p.id),reason,{status:p.status},{status:'REVERSED'},authorizedBy);
    }else if(p.method==='CASH'){
      const shift=refundShift;if(!shift)throw conflict('Abra um turno para registrar a devolução em dinheiro.');assertShiftAccess(actor,shift);
      const balance=(await client.query("SELECT COALESCE(sum(CASE WHEN type IN ('BLEED_SANGRIA','ORDER_REFUND') THEN -amount_cents ELSE amount_cents END),0)::int AS amount FROM cash_movements WHERE shift_id=$1",[shift.id])).rows[0]!;
      if(Number(balance.amount)<Number(p.amount_cents))throw conflict('O caixa não possui dinheiro suficiente para devolver esta venda.');
      await client.query("INSERT INTO cash_movements(id,idempotency_key,shift_id,order_id,operator_id,authorized_by_user_id,type,amount_cents,reason) VALUES($1,$2,$3,$4,$5,$6,'ORDER_REFUND',$7,$8)",[uuidV7(),uuidV7(),shift.id,id,actor.id,authorizedBy??null,p.amount_cents,reason]);
    }
    await client.query("UPDATE order_payments SET status='REVERSED' WHERE id=$1",[p.id]);
   }
   await client.query("UPDATE orders SET status='CANCELLED',updated_at=now() WHERE id=$1",[id]);
   await client.query("UPDATE print_jobs SET status='FAILED',last_error='Pedido cancelado' WHERE order_id=$1 AND status IN ('QUEUED','CLAIMED')",[id]);
   await audit(client,actor,'ORDER_CANCELLED',id,reason,{status:order.status},{status:'CANCELLED'},authorizedBy);await enqueue(client,'kds.orders',{orderId:id,type:'order.updated'});return readOrder(client,id);
 }
 register(app:FastifyInstance,auth:Auth){
   const humans=auth.require(['OWNER','MANAGER','CASHIER']),sales=auth.require(['OWNER','MANAGER','CASHIER','TERMINAL']);
   app.post('/api/orders',{preHandler:sales},async(request,reply)=>{const b=orderInputSchema.parse(request.body);const order=await this.create(b,request.actor,request.abortSignal);reply.code(201);return order;});
   app.get('/api/orders/kds',{preHandler:humans},async()=>{const r=await this.db.query(orderSelect+" WHERE o.status IN ('RECEIVED','PREPARING','READY') AND EXISTS(SELECT 1 FROM order_payments p WHERE p.order_id=o.id AND p.status='CONFIRMED') ORDER BY o.created_at,o.id LIMIT 200");return r.rows.map(row=>productionOrderDTO(orderDTO(row)));});
   app.get('/api/orders',{preHandler:humans},async request=>{
     const {page,pageSize}=paginationSchema.parse(request.query),operator=request.actor.role==='CASHIER'?request.actor.id:null;
     const [rows,total]=await Promise.all([this.db.query(orderSelect+' WHERE ($1::uuid IS NULL OR o.operator_id=$1) ORDER BY o.created_at DESC,o.id LIMIT $2 OFFSET $3',[operator,pageSize,(page-1)*pageSize]),this.db.query('SELECT count(*)::int AS total FROM orders WHERE ($1::uuid IS NULL OR operator_id=$1)',[operator])]);return {items:rows.rows.map(orderDTO),total:total.rows[0]!.total,page,pageSize};
   });
   app.get('/api/orders/by-key/:key',{preHandler:sales},async request=>{const {key}=z.object({key:z.string().uuid()}).parse(request.params);const order=await readOrder(this.db.pool,key,true);assertTerminalAccess(request.actor,order.terminalId);if(request.actor.role==='CASHIER'){const own=await this.db.query('SELECT operator_id FROM orders WHERE id=$1',[order.id]);if(own.rows[0]?.operator_id!==request.actor.id)throw forbidden();}return order;});
   app.post('/api/orders/by-key/:key/receipt',{preHandler:auth.require(['TERMINAL'])},async request=>{
     const {key}=z.object({key:z.string().uuid()}).parse(request.params),b=z.object({printed:z.boolean(),printedAt:z.string().datetime().optional(),contingencyTicket:z.string().max(80).optional(),failureReason:reasonSchema.optional()}).strict().parse(request.body);
     return this.db.transaction(async client=>{
       await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
       const prior=(await client.query('SELECT * FROM terminal_receipt_resolutions WHERE idempotency_key=$1',[key])).rows[0];
       if(prior&&(prior.terminal_id!==request.actor.terminalId||prior.printed!==b.printed))throw conflict('Já existe outra resolução de impressão para esta chave.');
       const existing=(await client.query('SELECT id,terminal_id FROM orders WHERE idempotency_key=$1',[key])).rows[0];
       if(existing)assertTerminalAccess(request.actor,String(existing.terminal_id));
       if(!prior)await client.query('INSERT INTO terminal_receipt_resolutions(idempotency_key,terminal_id,printed,printed_at,contingency_ticket,failure_reason) VALUES($1,$2,$3,$4,$5,$6)',[key,request.actor.terminalId,b.printed,b.printed?(b.printedAt??new Date().toISOString()):null,b.contingencyTicket??null,b.failureReason??null]);
       if(!existing)return {acknowledged:true,idempotencyKey:key,status:b.printed?'AWAITING_ORDER':'CANCELLED'};
       if(b.printed){await this.confirmReceipt(client,String(existing.id),request.actor,b.printedAt??new Date().toISOString(),b.contingencyTicket);return readOrder(client,String(existing.id));}
       return this.cancel(client,String(existing.id),request.actor,b.failureReason??'Impressão local não concluída',undefined,true);
     },request.abortSignal);
   });
   app.patch('/api/orders/:id/status',{preHandler:humans},async request=>{
     const {id}=z.object({id:z.string().uuid()}).parse(request.params),b=z.object({status:orderStatusSchema}).strict().parse(request.body);
     const next:Record<string,string>={RECEIVED:'PREPARING',PREPARING:'READY',READY:'DELIVERED'};
     const result=await this.db.transaction(async client=>{const r=(await client.query('SELECT status FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r)throw notFound();if(r.status===b.status)return readOrder(client,id);if(next[String(r.status)]!==b.status)throw conflict('A cozinha só pode avançar para a próxima etapa. Cancelamentos exigem supervisor.');const paid=await client.query("SELECT 1 FROM order_payments WHERE order_id=$1 AND status='CONFIRMED'",[id]);if(!paid.rowCount)throw conflict('Aguarde a confirmação do pagamento e da impressão.');await client.query('UPDATE orders SET status=$2,updated_at=now() WHERE id=$1',[id,b.status]);await enqueue(client,'kds.orders',{orderId:id,type:'order.updated'});return readOrder(client,id);},request.abortSignal);return productionOrderDTO(result);
   });
   app.post('/api/orders/:id/cancel',{preHandler:humans},async request=>{const {id}=z.object({id:z.string().uuid()}).parse(request.params),b=z.object({reason:reasonSchema}).strict().parse(request.body);return this.db.transaction(async client=>{const authorizedBy=await auth.supervisor(request,client,'ORDER_CANCELLED',id);return this.cancel(client,id,request.actor,b.reason,authorizedBy);},request.abortSignal);});
   app.post('/api/orders/:id/print',{preHandler:humans},async request=>{const {id}=z.object({id:z.string().uuid()}).parse(request.params);return this.db.transaction(async client=>{const order=await readOrder(client,id);if(order.status==='CANCELLED')throw conflict('Pedido cancelado não pode ser impresso como venda.');if(request.actor.role==='CASHIER'){const r=await client.query('SELECT operator_id FROM orders WHERE id=$1',[id]);if(r.rows[0]?.operator_id!==request.actor.id)throw forbidden();}return {printJobId:await this.print(client,order,true)};},request.abortSignal);});
   app.post('/api/offline-sync',{preHandler:auth.require(['TERMINAL'])},async(request,reply)=>{
     const b=orderInputSchema.parse(request.body);assertTerminalAccess(request.actor,b.terminalId);if(b.origin!=='TOTEM'||!b.offline?.printedAt)throw badRequest('A sincronização exige uma venda do totem com impressão local confirmada.');
     const result=await this.db.transaction(async client=>{await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`sync:${b.idempotencyKey}`]);const hash=orderIntent(b);const old=(await client.query('SELECT * FROM offline_sync_requests WHERE idempotency_key=$1',[b.idempotencyKey])).rows[0];if(old){if(old.intent_hash!==hash)throw conflict('A chave offline possui outro conteúdo.');return old;}
       const id=uuidV7();const inserted=(await client.query('INSERT INTO offline_sync_requests(id,idempotency_key,terminal_id,payload,intent_hash) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,b.idempotencyKey,b.terminalId,JSON.stringify(b),hash])).rows[0]!;await enqueue(client,'totem.offline_sync',{syncRequestId:id});return inserted;},request.abortSignal);
     reply.code(202);return {id:result.id,accepted:true,status:result.status,orderId:result.order_id??undefined,errorDetail:result.error_detail??undefined};
   });
 }
}
