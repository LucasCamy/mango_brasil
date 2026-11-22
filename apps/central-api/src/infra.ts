import { createClient } from 'redis';
import { EventEmitter } from 'node:events';
import { uuidV7 } from '@totem-pdv/shared-types';
import type { DbClient } from './db.js';
export const ROUTES=['kds.orders','print.jobs','totem.offline_sync','fiscal.nfce'] as const;
export type RoutingKey=typeof ROUTES[number];
export async function enqueue(client:DbClient,routingKey:RoutingKey,payload:unknown){
  const id=uuidV7();await client.query('INSERT INTO outbox_events(id,routing_key,payload) VALUES($1,$2,$3)',[id,routingKey,JSON.stringify(payload)]);return id;
}
export class Realtime {
  readonly redis;
  readonly events=new EventEmitter();
  private subscriber?:ReturnType<typeof createClient>;
  private channel:string;
  constructor(url:string){
    this.channel=`totem.events:${new URL(url).pathname||'/0'}`;
    this.redis=createClient({url,disableOfflineQueue:true,socket:{connectTimeout:2000,reconnectStrategy:r=>Math.min(500*r,5000)}});
    this.redis.on('error',()=>{});
    this.events.setMaxListeners(1000);
  }
  async connect(){
    await this.redis.connect();this.subscriber=this.redis.duplicate();this.subscriber.on('error',()=>{});
    await this.subscriber.connect();
    await this.subscriber.subscribe(this.channel,message=>{try{this.events.emit('update',JSON.parse(message));}catch{/* malformed events cannot terminate stream */}});
  }
  async optional<T>(operation:()=>Promise<T>,fallback:T):Promise<T>{
    if(!this.redis.isReady)return fallback;
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([operation(),new Promise<T>(resolve=>{timer=setTimeout(()=>resolve(fallback),750);})]);}catch{return fallback;}finally{if(timer)clearTimeout(timer);}
  }
  async publish(payload:unknown){
    const sent=await this.optional(async()=>{await this.redis.publish(this.channel,JSON.stringify(payload));return true;},false);
    if(!sent)this.events.emit('update',payload);
  }
  async close(){await this.subscriber?.close().catch(()=>{});await this.redis.close().catch(()=>{});}
}
