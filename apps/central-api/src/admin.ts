import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { companySettingsInputSchema,heartbeatInputSchema,maintenanceInputSchema,paginationSchema,terminalInputSchema,userInputSchema,userUpdateInputSchema,uuidV7,type CompanySettings,type KioskTerminal } from '@totem-pdv/shared-types';
import { randomBytes } from 'node:crypto';
import type { Config } from './config.js';
import type { Database } from './db.js';
import { iso } from './db.js';
import type { Auth } from './auth.js';
import { assertTerminalAccess,userDTO } from './auth.js';
import { audit } from './audit.js';
import type { Realtime } from './infra.js';
import { conflict,forbidden,notFound } from './problem.js';
import { encryptSecret,hashPassword,tokenHash } from './security.js';
export function settingsDTO(row:Record<string,unknown>,config:Config):CompanySettings{
 return {legalName:String(row.razao_social),tradeName:String(row.nome_fantasia),cnpj:String(row.cnpj),stateRegistration:String(row.inscricao_estadual),address:row.address as CompanySettings['address'],taxRegime:row.regime_tributario as CompanySettings['taxRegime'],cscId:String(row.csc_id),cscTokenConfigured:Boolean(row.csc_token_encrypted),nfceSeries:Number(row.serie_nfce),nextNfceNumber:Number(row.proximo_numero_nfce),acceptsCashOnPdv:Boolean(row.accepts_cash_on_pdv),inactivityTimeoutSeconds:Number(row.inactivity_timeout_seconds),fiscalMode:config.FISCAL_MODE,updatedAt:iso(row.updated_at as Date)!};
}
export function terminalDTO(r:Record<string,unknown>,alive:boolean):KioskTerminal{return {id:String(r.id),name:String(r.name),type:r.type as KioskTerminal['type'],ipAddress:r.ip_address?String(r.ip_address):undefined,appVersion:String(r.app_version),status:r.status==='MAINTENANCE'?'MAINTENANCE':alive?'ONLINE':'OFFLINE',printerStatus:r.printer_status as KioskTerminal['printerStatus'],pinpadStatus:r.pinpad_status as KioskTerminal['pinpadStatus'],maintenanceMessage:String(r.maintenance_message??''),lastHeartbeatAt:iso(r.last_heartbeat_at as Date),currentShiftId:r.current_shift_id?String(r.current_shift_id):undefined};}
export function registerAdmin(app:FastifyInstance,db:Database,auth:Auth,realtime:Realtime,config:Config){
 app.get('/api/settings',{preHandler:auth.require(['OWNER','MANAGER','TERMINAL'])},async request=>{
  const r=(await db.query('SELECT * FROM company_settings WHERE id=1')).rows[0]!;const dto=settingsDTO(r,config);
  if(request.actor.role==='TERMINAL')return {tradeName:dto.tradeName,inactivityTimeoutSeconds:dto.inactivityTimeoutSeconds,fiscalMode:dto.fiscalMode};return dto;
 });
 app.patch('/api/settings',{preHandler:auth.require(['OWNER'])},async request=>{
  const b=companySettingsInputSchema.parse(request.body);
  const dto=await db.transaction(async client=>{
   const old=(await client.query('SELECT * FROM company_settings WHERE id=1 FOR UPDATE')).rows[0]!;
   const row=(await client.query('UPDATE company_settings SET razao_social=$1,nome_fantasia=$2,cnpj=$3,inscricao_estadual=$4,address=$5,regime_tributario=$6,csc_id=$7,csc_token_encrypted=$8,serie_nfce=$9,proximo_numero_nfce=$10,accepts_cash_on_pdv=$11,inactivity_timeout_seconds=$12,updated_at=now() WHERE id=1 RETURNING *',[b.legalName,b.tradeName,b.cnpj,b.stateRegistration,JSON.stringify(b.address),b.taxRegime,b.cscId,b.cscToken?encryptSecret(b.cscToken,config.SETTINGS_ENCRYPTION_KEY):old.csc_token_encrypted,b.nfceSeries,b.nextNfceNumber,b.acceptsCashOnPdv,b.inactivityTimeoutSeconds])).rows[0]!;
   const after=settingsDTO(row,config);await audit(client,request.actor,'COMPANY_SETTINGS_UPDATED','company','Configurações da empresa atualizadas',settingsDTO(old,config),after);return after;
  },request.abortSignal);await realtime.publish({type:'settings.updated'});return dto;
 });
 app.get('/api/terminals',{preHandler:auth.require(['OWNER','MANAGER','CASHIER'])},async()=>{
  const rows=await db.query("SELECT t.*,(SELECT s.id FROM shifts s WHERE s.terminal_id=t.id AND s.status='OPEN') AS current_shift_id FROM kiosk_terminals t WHERE active=true ORDER BY type,name");
  const keys=rows.rows.map(t=>`heartbeat:${t.id}`);const alive=keys.length?await realtime.optional(()=>realtime.redis.mGet(keys),keys.map(()=>null)):[];
  return rows.rows.map((t,i)=>terminalDTO(t,Boolean(alive[i])||Boolean(t.last_heartbeat_at&&Date.now()-new Date(t.last_heartbeat_at).getTime()<40000)));
 });
 app.post('/api/terminals',{preHandler:auth.require(['OWNER','MANAGER'])},async(request,reply)=>{
  const b=terminalInputSchema.parse(request.body),token=b.type==='TOTEM'?randomBytes(32).toString('hex'):undefined;
  const terminal=await db.transaction(async client=>{const r=(await client.query('INSERT INTO kiosk_terminals(id,name,type,token_hash) VALUES($1,$2,$3,$4) RETURNING *',[b.id,b.name,b.type,token?tokenHash(token):null])).rows[0]!;await audit(client,request.actor,'TERMINAL_CREATED',b.id,'Cadastro de terminal',null,b);return terminalDTO(r,false);},request.abortSignal);
  reply.code(201);return {...terminal,...(token?{token}:{} )};
 });
 app.post('/api/terminals/:id/heartbeat',{preHandler:auth.require(['TERMINAL'])},async request=>{
  const {id}=z.object({id:z.string().min(2).max(64)}).parse(request.params);assertTerminalAccess(request.actor,id);const b=heartbeatInputSchema.parse(request.body);
  const row=(await db.query("UPDATE kiosk_terminals SET last_heartbeat_at=now(),app_version=$2,printer_status=$3,pinpad_status=$4,ip_address=$5,status=CASE WHEN status='MAINTENANCE' THEN 'MAINTENANCE' ELSE 'ONLINE' END WHERE id=$1 AND active=true RETURNING *",[id,b.appVersion,b.printerStatus,b.pinpadStatus,request.ip])).rows[0];if(!row)throw notFound();
  await realtime.optional(()=>realtime.redis.set(`heartbeat:${id}`,JSON.stringify({printerStatus:b.printerStatus,pinpadStatus:b.pinpadStatus}),{EX:40}),null);await realtime.publish({type:'terminal.updated',resourceId:id});
  const version=(await db.query('SELECT version FROM catalog_state WHERE id=1')).rows[0]?.version;
  return {terminalId:id,status:row.status,maintenanceMessage:row.maintenance_message??'',serverTime:new Date().toISOString(),catalogVersion:String(version)};
 });
 app.patch('/api/terminals/:id/maintenance',{preHandler:auth.require(['OWNER','MANAGER'])},async request=>{
  const {id}=z.object({id:z.string().min(2).max(64)}).parse(request.params),b=maintenanceInputSchema.parse(request.body);
  const dto=await db.transaction(async client=>{const old=(await client.query('SELECT * FROM kiosk_terminals WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)throw notFound();const row=(await client.query('UPDATE kiosk_terminals SET status=$2,maintenance_message=$3 WHERE id=$1 RETURNING *',[id,b.enabled?'MAINTENANCE':'OFFLINE',b.enabled?b.message:''])).rows[0]!;await audit(client,request.actor,'KIOSK_MAINTENANCE_TOGGLED',id,b.reason,{status:old.status},{enabled:b.enabled,message:b.message},request.actor.id);return terminalDTO(row,Boolean(row.last_heartbeat_at&&Date.now()-new Date(row.last_heartbeat_at).getTime()<40000));},request.abortSignal);
  await realtime.publish({type:'terminal.updated',resourceId:id});return dto;
 });
 app.get('/api/users',{preHandler:auth.require(['OWNER','MANAGER'])},async request=>{
  const {page,pageSize}=paginationSchema.parse(request.query);const [rows,total]=await Promise.all([db.query('SELECT id,name,email,role,active,created_at FROM users ORDER BY name,id LIMIT $1 OFFSET $2',[pageSize,(page-1)*pageSize]),db.query('SELECT count(*)::int AS total FROM users')]);return {items:rows.rows.map(userDTO),total:total.rows[0]!.total,page,pageSize};
 });
 app.post('/api/users',{preHandler:auth.require(['OWNER'])},async(request,reply)=>{
  const b=userInputSchema.parse(request.body);const password=await hashPassword(b.password),pin=b.supervisorPin?await hashPassword(b.supervisorPin):null;
  const result=await db.transaction(async client=>{const row=(await client.query('INSERT INTO users(id,name,email,password_hash,supervisor_pin_hash,role,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,email,role,active,created_at',[uuidV7(),b.name,b.email.toLowerCase(),password,pin,b.role,b.active])).rows[0]!;const dto=userDTO(row);await audit(client,request.actor,'USER_CREATED',dto.id,'Cadastro de usuário',null,dto);return dto;},request.abortSignal);reply.code(201);return result;
 });
 app.patch('/api/users/:id',{preHandler:auth.require(['OWNER'])},async request=>{
  const {id}=z.object({id:z.string().uuid()}).parse(request.params),b=userUpdateInputSchema.partial().strict().parse(request.body);
  const password=b.password?await hashPassword(b.password):undefined,pin=b.supervisorPin?await hashPassword(b.supervisorPin):undefined;
  return db.transaction(async client=>{
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended('active-owners',0))");const old=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)throw notFound();
   if(old.role==='OWNER'&&old.active&&(b.role&&b.role!=='OWNER'||b.active===false)){const owners=await client.query("SELECT 1 FROM users WHERE role='OWNER' AND active=true AND id<>$1",[id]);if(!owners.rowCount)throw conflict('Mantenha pelo menos um dono ativo no sistema.');}
   const row=(await client.query('UPDATE users SET name=$2,email=$3,role=$4,active=$5,password_hash=$6,supervisor_pin_hash=$7,token_version=token_version+1,updated_at=now() WHERE id=$1 RETURNING id,name,email,role,active,created_at',[id,b.name??old.name,b.email?.toLowerCase()??old.email,b.role??old.role,b.active??old.active,password??old.password_hash,pin??old.supervisor_pin_hash])).rows[0]!;
   await audit(client,request.actor,'USER_UPDATED',id,'Permissões ou credenciais atualizadas',userDTO(old),userDTO(row));return userDTO(row);
  },request.abortSignal);
 });
 app.get('/api/audit-logs',{preHandler:auth.require(['OWNER','MANAGER'])},async request=>{
  const {page,pageSize}=paginationSchema.parse(request.query);const [rows,total]=await Promise.all([db.query('SELECT a.*,u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC,a.id LIMIT $1 OFFSET $2',[pageSize,(page-1)*pageSize]),db.query('SELECT count(*)::int AS total FROM audit_logs')]);
  return {items:rows.rows.map(r=>({id:r.id,actorUserId:r.user_id??r.terminal_id??'system',actorName:r.actor_name??r.terminal_id??'Sistema',authorizedByUserId:r.authorized_by_user_id??undefined,action:r.action,resourceId:r.resource_id,reason:r.reason,before:r.before_payload,after:r.after_payload,createdAt:iso(r.created_at)})),total:total.rows[0]!.total,page,pageSize};
 });
}
