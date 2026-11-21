import pg from 'pg';
import { readdir,readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const databaseUrl=process.env.MIGRATION_DATABASE_URL;
if(!databaseUrl)throw Error('MIGRATION_DATABASE_URL é obrigatória.');
const pool=new pg.Pool({connectionString:databaseUrl,connectionTimeoutMillis:5000});
const client=await pool.connect();
try{
  await client.query('SELECT pg_advisory_lock(705645213)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const directory=fileURLToPath(new URL('../migrations/',import.meta.url));
  const names=(await readdir(directory)).filter(x=>/^\d+.*\.sql$/.test(x)).sort();
  const applied=await client.query<{name:string;checksum:string}>('SELECT name,checksum FROM schema_migrations');
  for(const name of names){
    const sql=(await readFile(`${directory}/${name}`,'utf8')).replace(/\r\n/g,'\n');const checksum=createHash('sha256').update(sql).digest('hex');
    const found=applied.rows.find(x=>x.name===name);
    if(found&&found.checksum!==checksum)throw Error(`Migration ${name} foi alterada após aplicação. Crie uma migration nova.`);
    if(found){console.log(`${name}: aplicada`);continue;}
    if(process.argv[2]!=='apply'){console.log(`${name}: pendente (revise o SQL antes de db:migrate)`);continue;}
    await client.query('BEGIN');
    try{await client.query(sql);await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);await client.query('COMMIT');console.log(`${name}: aplicada`);}catch(error){await client.query('ROLLBACK');throw error;}
  }
  if(process.argv[2]==='apply'){
    const password=process.env.APP_DATABASE_PASSWORD;
    if(!password||password.length<32)throw Error('APP_DATABASE_PASSWORD deve ter pelo menos 32 caracteres.');
    const exists=await client.query("SELECT 1 FROM pg_roles WHERE rolname='totem_app'");
    if(!exists.rowCount){const roleSql=await client.query<{sql:string}>("SELECT format('CREATE ROLE totem_app LOGIN PASSWORD %L', $1::text) AS sql",[password]);await client.query(roleSql.rows[0]!.sql);}
    await client.query('GRANT CONNECT ON DATABASE '+pg.escapeIdentifier(new URL(databaseUrl).pathname.slice(1))+' TO totem_app');
    await client.query('GRANT USAGE ON SCHEMA public TO totem_app');
    await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO totem_app');
    await client.query('REVOKE UPDATE,DELETE,TRUNCATE ON audit_logs FROM totem_app');
    await client.query('REVOKE ALL ON schema_migrations FROM totem_app');
    console.log('Permissões do usuário de aplicação conferidas; auditoria protegida contra alteração.');
  }
}finally{await client.query('SELECT pg_advisory_unlock(705645213)').catch(()=>{});client.release();await pool.end();}
