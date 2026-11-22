import Fastify,{LogController} from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PaymentGatewayError } from '@totem-pdv/tef-client';
import type { Config } from './config.js';
import { Database } from './db.js';
import { Realtime } from './infra.js';
import { Auth } from './auth.js';
import { CatalogService } from './catalog.js';
import { OrderService } from './orders.js';
import { registerPayments } from './payments.js';
import { registerShifts } from './shifts.js';
import { registerAdmin } from './admin.js';
import { registerPrinting } from './printing.js';
import { forbidden,Problem,registerProblems } from './problem.js';
import { buildOpenApi } from './openapi.js';
export async function createApp(config:Config,options:{logger?:boolean}={}){
 const db=new Database(config.DATABASE_URL),realtime=new Realtime(config.REDIS_URL);
 const app=Fastify({logger:options.logger?{redact:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie','password','pin','cscToken']}:false,bodyLimit:1024*1024,requestTimeout:30000,connectionTimeout:30000,trustProxy:false,logController:new LogController({disableRequestLogging:true})});
 try{await realtime.connect();}catch(error){await realtime.close();await db.close();throw error;}
 await app.register(cookie);
 await app.register(jwt,{secret:config.JWT_SECRET,cookie:{cookieName:'totem_session',signed:false},sign:{iss:'totem-central',aud:'totem-clients'},verify:{allowedIss:'totem-central',allowedAud:'totem-clients'}});
 await app.register(cors,{origin:config.WEB_ORIGIN,credentials:true,methods:['GET','POST','PATCH','OPTIONS'],allowedHeaders:['content-type','authorization','x-supervisor-token']});
 await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'none'"],frameAncestors:["'none'"]}},crossOriginResourcePolicy:{policy:'same-site'}});
 await app.register(rateLimit,{max:600,timeWindow:'1 minute'});
 app.addHook('onRequest',async(request,reply)=>{
  // IncomingMessage.close also fires after a complete POST body. It is not a client disconnect.
  // Fastify 5.12's signal/handlerTimeout use that event; own the deadline and response-side cancellation here.
  const controller=new AbortController();request.abortSignal=controller.signal;
  let deadline:ReturnType<typeof setTimeout>|undefined;
  const onAbort=()=>controller.abort(new DOMException('Client disconnected','AbortError'));
  const cleanup=()=>{if(deadline)clearTimeout(deadline);request.raw.off('aborted',onAbort);reply.raw.off('close',onClose);reply.raw.off('finish',cleanup);};
  const onClose=()=>{if(!reply.raw.writableEnded)onAbort();cleanup();};
  request.raw.once('aborted',onAbort);reply.raw.once('close',onClose);reply.raw.once('finish',cleanup);
  if(request.routeOptions.url!=='/api/events')deadline=setTimeout(()=>{
   if(reply.sent)return;
   controller.abort(new DOMException('Request deadline exceeded','TimeoutError'));
   if(reply.raw.headersSent)reply.raw.destroy();
   else reply.send(new Problem(503,'Tempo limite','A operação excedeu o prazo. Reenvie a mesma chave de idempotência.','timeout'));
  },15000);
  if(['POST','PATCH','PUT','DELETE'].includes(request.method)){
   const origin=request.headers.origin;if(origin&&origin!==config.WEB_ORIGIN)throw forbidden('A origem desta requisição não é autorizada.');
  }
 });
 registerProblems(app);
 app.addHook('onError',async(_request,_reply,error)=>{
  if(error instanceof PaymentGatewayError){const status=error.code==='NOT_FOUND'?404:error.code==='TIMEOUT'||error.code==='ABORTED'?503:409;(error as unknown as {statusCode:number}).statusCode=status;}
 });
 const auth=new Auth(app,db,config,realtime);auth.register();
 const catalog=new CatalogService(db,realtime);catalog.register(app,auth);
 const orders=new OrderService(db,realtime,config);orders.register(app,auth);
 registerPayments(app,db,auth);registerShifts(app,db,auth,realtime);registerAdmin(app,db,auth,realtime,config);registerPrinting(app,db,auth,orders,realtime,config);
 app.get('/health/live',async()=>({status:'alive'}));
 app.get('/health/ready',async(_request,reply)=>{
  try{await db.query('SELECT 1');const cache=realtime.redis.isReady;if(!cache)return reply.code(503).send({status:'degraded',database:'ready',redis:'unavailable'});const backlog=(await db.query('SELECT count(*)::int AS total FROM outbox_events WHERE published_at IS NULL')).rows[0]!.total;return {status:'ready',database:'ready',redis:'ready',outboxPending:backlog};}catch{return reply.code(503).send({status:'unavailable'});}
 });
 app.get('/api/openapi.json',async()=>buildOpenApi());
 const activeStreams=new Map<string,number>();
 app.get('/api/events',{preHandler:auth.require(['OWNER','MANAGER','CASHIER'])},async(request,reply)=>{
  const actorId=request.actor.id,count=activeStreams.get(actorId)??0;if(count>=8)throw new Problem(429,'Conexões em excesso','Feche outras abas deste usuário.','stream-limit');activeStreams.set(actorId,count+1);
  request.raw.socket.setTimeout(0);
  reply.hijack();reply.raw.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform',connection:'keep-alive','x-accel-buffering':'no',...(request.headers.origin===config.WEB_ORIGIN?{'access-control-allow-origin':config.WEB_ORIGIN,'access-control-allow-credentials':'true'}:{})});
  reply.raw.write(': connected\n\n');
  const update=(event:unknown)=>{if(!reply.raw.destroyed)reply.raw.write(`event: update\ndata: ${JSON.stringify(event)}\n\n`);};realtime.events.on('update',update);
  let closed=false;const cleanup=()=>{if(closed)return;closed=true;clearInterval(timer);clearTimeout(lifetime);realtime.events.off('update',update);activeStreams.set(actorId,Math.max(0,(activeStreams.get(actorId)??1)-1));};
  const timer=setInterval(()=>{void auth.authenticate(request,['OWNER','MANAGER','CASHIER']).then(()=>{if(!reply.raw.destroyed)reply.raw.write(': heartbeat\n\n');}).catch(()=>reply.raw.end());},15000);
  const lifetime=setTimeout(()=>reply.raw.end(),3600000);
  reply.raw.on('close',cleanup);request.raw.on('error',cleanup);
 });
 app.addHook('onClose',async()=>{await realtime.close();await db.close();});
 await app.ready();return {app,db,realtime,orders};
}
