import { uuidV7 } from '@totem-pdv/shared-types';
import type { DbClient } from './db.js';
export interface Actor { id:string; role:'OWNER'|'MANAGER'|'CASHIER'|'TERMINAL'|'PRINT_AGENT'; terminalId?:string; name?:string; sessionId?:string; }
export async function audit(client:DbClient,actor:Actor,action:string,resourceId:string,reason:string,before:unknown=null,after:unknown=null,authorizedBy?:string){
  await client.query('INSERT INTO audit_logs(id,user_id,terminal_id,authorized_by_user_id,action,resource_id,reason,before_payload,after_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[uuidV7(),['TERMINAL','PRINT_AGENT'].includes(actor.role)?null:actor.id,actor.terminalId??null,authorizedBy??null,action,resourceId,reason,JSON.stringify(before),JSON.stringify(after)]);
}
