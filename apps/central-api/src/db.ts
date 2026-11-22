import pg, { type PoolClient, type QueryResultRow } from 'pg';
export type DbClient = Pick<PoolClient,'query'>;
export class Database {
  readonly pool: pg.Pool;
  constructor(url:string) {
    this.pool=new pg.Pool({connectionString:url,max:15,connectionTimeoutMillis:3000,idleTimeoutMillis:30000,statement_timeout:10000,query_timeout:12000,application_name:'totem-central'});
    this.pool.on('error',()=>{ /* request/worker boundaries report sanitized connection failures */ });
  }
  async query<T extends QueryResultRow=QueryResultRow>(sql:string,values:unknown[]=[]){ return this.pool.query<T>(sql,values); }
  async transaction<T>(action:(client:PoolClient)=>Promise<T>,signal?:AbortSignal):Promise<T> {
    signal?.throwIfAborted();
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      signal?.throwIfAborted();
      const result=await action(client);
      signal?.throwIfAborted();
      await client.query('COMMIT');
      return result;
    } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
    finally { client.release(); }
  }
  close(){ return this.pool.end(); }
}
export function iso(value:Date|string|null|undefined):string|undefined {return value?new Date(value).toISOString():undefined;}
export function number(value:unknown):number { return Number(value ?? 0); }
