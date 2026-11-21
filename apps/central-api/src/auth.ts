import type { FastifyInstance,FastifyRequest } from 'fastify';
import { loginInputSchema,supervisorInputSchema,uuidV7,type UserDTO } from '@totem-pdv/shared-types';
import type { Database,DbClient } from './db.js';
import type { Config } from './config.js';
import type { Realtime } from './infra.js';
import { forbidden,Problem } from './problem.js';
import { tokenHash,verifyPassword,safeEqual } from './security.js';
import { iso } from './db.js';
import type { Actor } from './audit.js';
interface Claims { sub:string; sid:string; ver:number; kind:'user'|'supervisor'; action?:string; resourceId?:string; requestedBy?:string; exp?:number }
declare module 'fastify' {interface FastifyRequest {actor:Actor; abortSignal:AbortSignal} }
export function userDTO(row:Record<string,unknown>):UserDTO {return {id:String(row.id),name:String(row.name),email:String(row.email),role:row.role as UserDTO['role'],active:Boolean(row.active),createdAt:iso(row.created_at as Date)!};}
export class Auth {
  constructor(private app:FastifyInstance,private db:Database,private config:Config,private realtime:Realtime){}
  async authenticate(request:FastifyRequest,roles?:Actor['role'][]):Promise<Actor>{
    const authorization=request.headers.authorization;
    const raw=authorization?.startsWith('Bearer ')?authorization.slice(7):undefined;
    if(raw&&safeEqual(raw,this.config.PRINT_AGENT_TOKEN)){
      const actor:Actor={id:'print-agent',role:'PRINT_AGENT'};request.actor=actor;if(roles&&!roles.includes(actor.role))throw forbidden();return actor;
    }
    if(raw&&!raw.includes('.')){
      const terminal=await this.db.query('SELECT id FROM kiosk_terminals WHERE token_hash=$1 AND active=true',[tokenHash(raw)]);
      if(terminal.rows[0]){const actor:Actor={id:String(terminal.rows[0].id),terminalId:String(terminal.rows[0].id),role:'TERMINAL'};request.actor=actor;if(roles&&!roles.includes(actor.role))throw forbidden();return actor;}
    }
    let claims:Claims;
    try{claims=await request.jwtVerify<Claims>({onlyCookie:!raw});}catch{throw new Problem(401,'Autenticação necessária','Entre com sua conta ou forneça a credencial do terminal.','unauthorized');}
    if(claims.kind!=='user')throw new Problem(401,'Sessão inválida','Entre novamente.','unauthorized');
    const found=await this.db.query('SELECT u.*,s.id AS sid FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active=true AND u.token_version=$3',[claims.sub,claims.sid,claims.ver]);
    const user=found.rows[0];if(!user)throw new Problem(401,'Sessão expirada','Entre novamente.','unauthorized');
    const actor:Actor={id:user.id,role:user.role,name:user.name,sessionId:claims.sid};request.actor=actor;
    if(roles&&!roles.includes(actor.role))throw forbidden();return actor;
  }
  require(roles?:Actor['role'][]){return async(request:FastifyRequest)=>{await this.authenticate(request,roles);};}
  async supervisor(request:FastifyRequest,client:DbClient,action:string,resourceId:string):Promise<string>{
    const value=request.headers['x-supervisor-token'];
    if(typeof value!=='string')throw forbidden('Informe a autorização de um gerente ou dono.');
    let claims:Claims;
    try{claims=this.app.jwt.verify<Claims>(value);}catch{throw forbidden('A autorização expirou. Informe o PIN novamente.');}
    if(claims.kind!=='supervisor'||claims.action!==action||claims.resourceId!==resourceId||claims.requestedBy!==request.actor.id)throw forbidden('Esta autorização não pertence à ação solicitada.');
    const result=await client.query("UPDATE supervisor_authorizations a SET consumed_at=now() FROM users u WHERE a.id=$1 AND a.user_id=u.id AND u.active=true AND u.role IN ('OWNER','MANAGER') AND a.requested_by_user_id=$2 AND a.action=$3 AND a.resource_id=$4 AND a.expires_at>now() AND a.consumed_at IS NULL RETURNING a.user_id",[claims.sid,request.actor.id,action,resourceId]);
    if(!result.rows[0])throw forbidden('Autorização já utilizada ou expirada. Informe o PIN novamente.');
    return String(result.rows[0].user_id);
  }
  async throttle(kind:string,key:string){
    // Redis-backed across API replicas; failure closes only credential entry, never kiosk sales.
    if(!this.realtime.redis.isReady)throw new Problem(503,'Autenticação indisponível','Tente novamente em instantes.','auth-unavailable');
    const redisKey=`auth:limit:${kind}:${tokenHash(key)}`;
    const count=await this.realtime.redis.incr(redisKey);if(count===1)await this.realtime.redis.expire(redisKey,300);
    if(count>10)throw new Problem(429,'Muitas tentativas','Aguarde cinco minutos antes de tentar novamente.','rate-limit');
    return redisKey;
  }
  register(){
    this.app.post('/api/auth/login',async(request,reply)=>{
      const body=loginInputSchema.parse(request.body);const bucket=await this.throttle('login',`${request.ip}:${body.email.toLowerCase()}`);
      const found=await this.db.query('SELECT * FROM users WHERE lower(email)=lower($1) AND active=true',[body.email]);const user=found.rows[0];
      if(!user||!await verifyPassword(String(user.password_hash),body.password))throw new Problem(401,'Credenciais inválidas','Confira o e-mail e a senha.','invalid-credentials');
      await this.realtime.redis.del(bucket);
      const sid=uuidV7();await this.db.query("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[sid,user.id]);
      const token=this.app.jwt.sign({sub:user.id,sid,ver:user.token_version,kind:'user'},{expiresIn:'8h'});
      reply.setCookie('totem_session',token,{httpOnly:true,sameSite:'strict',secure:this.config.NODE_ENV==='production',path:'/',maxAge:28800});
      return userDTO(user);
    });
    this.app.get('/api/auth/me',{preHandler:this.require(['OWNER','MANAGER','CASHIER'])},async request=>{
      const found=await this.db.query('SELECT id,name,email,role,active,created_at FROM users WHERE id=$1',[request.actor.id]);return userDTO(found.rows[0]!);
    });
    this.app.post('/api/auth/logout',{preHandler:this.require(['OWNER','MANAGER','CASHIER'])},async(request,reply)=>{
      await this.db.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',[request.actor.sessionId]);reply.clearCookie('totem_session',{path:'/'});return {success:true};
    });
    this.app.post('/api/auth/supervisor',{preHandler:this.require(['OWNER','MANAGER','CASHIER'])},async request=>{
      const body=supervisorInputSchema.parse(request.body);const bucket=await this.throttle('pin',`${request.ip}:${body.email.toLowerCase()}`);
      const found=await this.db.query("SELECT id,supervisor_pin_hash FROM users WHERE lower(email)=lower($1) AND active=true AND role IN ('OWNER','MANAGER')",[body.email]);const user=found.rows[0];
      if(!user?.supervisor_pin_hash||!await verifyPassword(String(user.supervisor_pin_hash),body.pin))throw forbidden('Credencial de supervisor inválida.');
      await this.realtime.redis.del(bucket);
      const id=uuidV7();await this.db.query("INSERT INTO supervisor_authorizations(id,user_id,requested_by_user_id,action,resource_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '2 minutes')",[id,user.id,request.actor.id,body.action,body.resourceId]);
      return {token:this.app.jwt.sign({sub:user.id,sid:id,kind:'supervisor',requestedBy:request.actor.id,action:body.action,resourceId:body.resourceId},{expiresIn:'2m'}),expiresIn:120};
    });
  }
}
export function assertShiftAccess(actor:Actor,shift:Record<string,unknown>){if(actor.role==='CASHIER'&&shift.operator_id!==actor.id)throw forbidden('Este turno pertence a outro operador.');}
export function assertTerminalAccess(actor:Actor,terminalId:string){if(actor.role==='TERMINAL'&&actor.terminalId!==terminalId)throw forbidden('A credencial pertence a outro terminal.');}
