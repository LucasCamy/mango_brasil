import { uuidV7 } from '@totem-pdv/shared-types';
import { Database } from './db.js';
import { hashPassword,tokenHash } from './security.js';
const url=process.env.DATABASE_URL,email=process.env.BOOTSTRAP_EMAIL,password=process.env.BOOTSTRAP_PASSWORD,pin=process.env.BOOTSTRAP_PIN;
if(!url||!email||!password||password.length<12||!pin||!/^\d{6,12}$/.test(pin))throw Error('Configure DATABASE_URL e BOOTSTRAP_EMAIL/PASSWORD/PIN com credenciais próprias.');
const demo=process.env.ALLOW_DEMO_SEED==='true';
if(demo&&process.env.NODE_ENV==='production')throw Error('Seed de demonstração é proibido em produção. Desative ALLOW_DEMO_SEED.');
const db=new Database(url);
try{
 const passwordHash=await hashPassword(password),pinHash=await hashPassword(pin);
 await db.transaction(async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('bootstrap-seed',0))");
  const existing=await client.query('SELECT id FROM users WHERE lower(email)=lower($1)',[email]);
  if(!existing.rowCount){const owner=await client.query("SELECT 1 FROM users WHERE role='OWNER' AND active=true");if(owner.rowCount)throw Error('Já existe um dono. Crie usuários pela Central; o bootstrap não adiciona outro administrador.');await client.query("INSERT INTO users(id,name,email,password_hash,supervisor_pin_hash,role) VALUES($1,'Administrador',$2,$3,$4,'OWNER')",[uuidV7(),email.toLowerCase(),passwordHash,pinHash]);}
  await client.query("INSERT INTO kiosk_terminals(id,name,type) VALUES('CAIXA-01','Balcão 01','PDV') ON CONFLICT(id) DO NOTHING");
  const terminalId=process.env.TERMINAL_ID,terminalToken=process.env.TERMINAL_TOKEN;
  if(terminalId&&terminalToken){if(terminalToken.length<32)throw Error('TERMINAL_TOKEN deve ter pelo menos 32 caracteres.');await client.query("INSERT INTO kiosk_terminals(id,name,type,token_hash) VALUES($1,'Autoatendimento 01','TOTEM',$2) ON CONFLICT(id) DO NOTHING",[terminalId,tokenHash(terminalToken)]);}
  if(!demo)return;
  const present=await client.query('SELECT 1 FROM products LIMIT 1');if(present.rowCount)return;
  const categoryIds=[uuidV7(),uuidV7(),uuidV7()];
  for(const [index,name,slug] of [[0,'Hambúrgueres','hamburgueres'],[1,'Acompanhamentos','acompanhamentos'],[2,'Bebidas','bebidas']] as const)await client.query('INSERT INTO categories(id,name,slug,sort_order) VALUES($1,$2,$3,$4)',[categoryIds[index],name,slug,index]);
  const samples=[
   [0,'Clássico da casa','Pão macio, carne grelhada, queijo e molho da casa.',2490],
   [0,'Bacon & cheddar','Carne grelhada, bacon crocante e cheddar.',3290],
   [0,'Duplo da casa','Duas carnes, queijo e cebola na chapa.',3890],
   [0,'Vegetariano','Hambúrguer vegetal, folhas e molho de ervas.',2990],
   [1,'Batata crocante','Batata frita com sal e ervas.',1490],
   [1,'Anéis de cebola','Porção de anéis crocantes.',1690],
   [2,'Refrigerante 350 ml','Lata gelada.',700],
   [2,'Água mineral 500 ml','Sem gás.',500],
   [2,'Suco 400 ml','Suco de fruta preparado na hora.',1000],
  ] as const;
  for(const [cat,name,description,price] of samples){const id=uuidV7();await client.query("INSERT INTO products(id,category_id,name,description,base_price_cents,ncm,cfop,origem,cst_csosn) VALUES($1,$2,$3,$4,$5,$6,'5102',0,'102')",[id,categoryIds[cat],name,description,price,cat===2?'22021000':'21069090']);if(cat===0){await client.query("INSERT INTO product_sizes(id,product_id,name,price_modifier_cents) VALUES($1,$2,'Individual',0),($3,$2,'Combo',1200)",[uuidV7(),id,uuidV7()]);await client.query("INSERT INTO product_additions(id,product_id,name,price_cents,max_quantity) VALUES($1,$2,'Bacon',500,3),($3,$2,'Queijo',300,3)",[uuidV7(),id,uuidV7()]);}if(name==='Batata crocante')await client.query("INSERT INTO product_sizes(id,product_id,name,price_modifier_cents) VALUES($1,$2,'Pequena',0),($3,$2,'Grande',700)",[uuidV7(),id,uuidV7()]);}
 });
 console.log(`Bootstrap concluído. ${demo?'Catálogo de demonstração fictício inserido apenas se vazio.':'Sem dados de demonstração.'} Credenciais existentes foram preservadas.`);
}finally{await db.close();}
