import amqp,{type ConfirmChannel,type ConsumeMessage} from 'amqplib';
import { ROUTES,type RoutingKey } from './infra.js';
import type { Database } from './db.js';
export const EXCHANGE='totem.events',DLX='totem.dlx';
export const RETRY_DELAYS=[1000,5000,25000] as const;
export async function connectBroker(url:string){
 const connection=await amqp.connect(url,{timeout:3000,heartbeat:10});connection.on('error',()=>{});
 try{
 const channel=await connection.createConfirmChannel();channel.on('error',()=>{});
 await channel.assertExchange(EXCHANGE,'direct',{durable:true});await channel.assertExchange(DLX,'direct',{durable:true});
 for(const route of ROUTES){
  const name=`${route}.queue`;
  await channel.assertQueue(name,{durable:true,arguments:{'x-dead-letter-exchange':DLX,'x-dead-letter-routing-key':`${route}.dead`}});await channel.bindQueue(name,EXCHANGE,route);
  await channel.assertQueue(`${name}.dlq`,{durable:true});await channel.bindQueue(`${name}.dlq`,DLX,`${route}.dead`);
  for(let i=0;i<RETRY_DELAYS.length;i++)await channel.assertQueue(`${name}.retry.${i+1}`,{durable:true,arguments:{'x-message-ttl':RETRY_DELAYS[i],'x-dead-letter-exchange':EXCHANGE,'x-dead-letter-routing-key':route}});
 }
 await channel.prefetch(10);return {connection,channel};
 }catch(error){await connection.close().catch(()=>{});throw error;}
}
export function publishConfirmed(channel:ConfirmChannel,route:string,content:Buffer,options:amqp.Options.Publish={}){
 return new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Broker confirmation timeout')),3000);channel.publish(EXCHANGE,route,content,{persistent:true,contentType:'application/json',...options},error=>{clearTimeout(timer);error?reject(error):resolve();});});
}
export async function dispatchOutbox(db:Database,channel:ConfirmChannel){
 return db.transaction(async client=>{
  const events=await client.query('SELECT * FROM outbox_events WHERE published_at IS NULL AND next_attempt_at<=now() ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED');let published=0;
  for(const event of events.rows){
   try{await publishConfirmed(channel,String(event.routing_key),Buffer.from(JSON.stringify(event.payload)),{messageId:event.id});await client.query('UPDATE outbox_events SET published_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1',[event.id]);published++;}
   catch{await client.query("UPDATE outbox_events SET attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>LEAST(300,power(2,LEAST(attempts,8))::int)),last_error='Broker indisponível' WHERE id=$1",[event.id]);break;}
  }
  return published;
 });
}
export async function retryMessage(channel:ConfirmChannel,route:RoutingKey,message:ConsumeMessage){
 const attempt=Number(message.properties.headers?.['x-attempt']??0);
 const target=attempt<RETRY_DELAYS.length?`${route}.queue.retry.${attempt+1}`:`${route}.queue.dlq`;
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Broker retry confirmation timeout')),3000);channel.sendToQueue(target,message.content,{persistent:true,contentType:'application/json',messageId:message.properties.messageId,headers:{...message.properties.headers,'x-attempt':attempt+1}},error=>{clearTimeout(timer);error?reject(error):resolve();});});
 channel.ack(message);
}
