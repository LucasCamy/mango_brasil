import { categoryInputSchema,productInputSchema,uuidV7,paginationSchema,type Product,type ProductCategory } from '@totem-pdv/shared-types';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Database,DbClient } from './db.js';
import { iso } from './db.js';
import type { Auth } from './auth.js';
import type { Realtime } from './infra.js';
import { audit } from './audit.js';
import { conflict,notFound,Problem } from './problem.js';
export const productSelect=`SELECT p.*,
COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'priceModifierCents',s.price_modifier_cents,'priceCents',s.price_cents) ORDER BY s.price_modifier_cents,s.name) FROM product_sizes s WHERE s.product_id=p.id),'[]'::jsonb) AS sizes,
COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'priceCents',a.price_cents,'maxQuantity',a.max_quantity) ORDER BY a.name) FROM product_additions a WHERE a.product_id=p.id),'[]'::jsonb) AS additions FROM products p`;
export function productDTO(row:Record<string,unknown>):Product {
 return {id:String(row.id),categoryId:String(row.category_id),name:String(row.name),description:String(row.description),imageUrl:String(row.image_url??''),basePriceCents:Number(row.base_price_cents),active:Boolean(row.active),availableInKiosk:Boolean(row.available_in_kiosk),availableInPdv:Boolean(row.available_in_pdv),sizes:row.sizes as Product['sizes'],additions:row.additions as Product['additions'],fiscal:{ncm:String(row.ncm),cest:String(row.cest??''),cfop:String(row.cfop),origem:Number(row.origem),cstCsosn:String(row.cst_csosn),aliquotaIcms:Number(row.aliquota_icms),ibsRate:Number(row.ibs_rate),cbsRate:Number(row.cbs_rate),aliquotaIbpt:Number(row.aliquota_ibpt)},version:Number(row.version),createdAt:iso(row.created_at as Date)!,updatedAt:iso(row.updated_at as Date)!};
}
export function categoryDTO(r:Record<string,unknown>):ProductCategory{return {id:String(r.id),name:String(r.name),slug:String(r.slug),order:Number(r.sort_order),active:Boolean(r.active)};}
export class CatalogService {
  constructor(readonly db:Database,readonly realtime:Realtime){}
  async invalidate(){await this.realtime.optional(()=>this.realtime.redis.del('catalog:v1'),0);await this.realtime.publish({type:'catalog.updated',occurredAt:new Date().toISOString()});}
  async get(){
    return this.db.transaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const version=String((await client.query('SELECT version FROM catalog_state WHERE id=1')).rows[0]!.version);
      const key=`catalog:v2:${version}`,cached=await this.realtime.optional(()=>this.realtime.redis.get(key),null);
      if(cached){try{const parsed=JSON.parse(cached) as {categories:ProductCategory[];products:Product[];version:string};if(parsed.version===version)return parsed;}catch{/* replace malformed cache */}}
      const categories=await client.query('SELECT * FROM categories WHERE active=true ORDER BY sort_order,name');
      const products=await client.query(productSelect+' WHERE p.active=true ORDER BY p.name');
      const result={categories:categories.rows.map(categoryDTO),products:products.rows.map(productDTO),version};
      await this.realtime.optional(()=>this.realtime.redis.set(key,JSON.stringify(result),{EX:60}),null);return result;
    });
  }
  async product(client:DbClient,id:string){const result=await client.query(productSelect+' WHERE p.id=$1',[id]);if(!result.rows[0])throw notFound('Produto não encontrado.');return productDTO(result.rows[0]);}
  register(app:FastifyInstance,auth:Auth){
    app.get('/api/catalog',{preHandler:auth.require(['OWNER','MANAGER','CASHIER','TERMINAL'])},async(request,reply)=>{const data=await this.get();reply.header('Cache-Control','private, no-cache');return request.actor.role==='TERMINAL'?{...data,products:data.products.filter(p=>p.availableInKiosk)}:data;});
    app.get('/api/categories',{preHandler:auth.require(['OWNER','MANAGER','CASHIER'])},async()=>{const r=await this.db.query('SELECT * FROM categories ORDER BY sort_order,name');return r.rows.map(categoryDTO);});
    app.post('/api/categories',{preHandler:auth.require(['OWNER','MANAGER'])},async(request,reply)=>{
      const b=categoryInputSchema.parse(request.body);const r=await this.db.query('INSERT INTO categories(id,name,slug,sort_order,active) VALUES($1,$2,$3,$4,$5) RETURNING *',[uuidV7(),b.name,b.slug,b.order,b.active]);await this.invalidate();reply.code(201);return categoryDTO(r.rows[0]!);
    });
    app.get('/api/products',{preHandler:auth.require(['OWNER','MANAGER','CASHIER'])},async request=>{
      const {page,pageSize}=paginationSchema.parse(request.query);const filter=z.object({search:z.string().max(160).optional()}).parse(request.query);const search=`%${filter.search??''}%`;
      const [rows,total]=await Promise.all([this.db.query(productSelect+' WHERE p.name ILIKE $1 ORDER BY p.name,p.id LIMIT $2 OFFSET $3',[search,pageSize,(page-1)*pageSize]),this.db.query('SELECT count(*)::int AS total FROM products WHERE name ILIKE $1',[search])]);return {items:rows.rows.map(productDTO),total:total.rows[0]!.total,page,pageSize};
    });
    app.post('/api/products',{preHandler:auth.require(['OWNER','MANAGER'])},async(request,reply)=>{
      const b=productInputSchema.parse(request.body),id=uuidV7();
      const product=await this.db.transaction(async client=>{await writeProduct(client,id,b,false);await audit(client,request.actor,'PRODUCT_CREATED',id,'Cadastro de produto',null,{name:b.name,basePriceCents:b.basePriceCents});return this.product(client,id);},request.abortSignal);
      await this.invalidate();reply.code(201);return product;
    });
    app.patch('/api/products/:id',{preHandler:auth.require(['OWNER','MANAGER'])},async request=>{
      const id=z.object({id:z.string().uuid()}).parse(request.params).id,b=productInputSchema.parse(request.body);
      const product=await this.db.transaction(async client=>{
        const previous=await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id]);if(!previous.rows[0])throw notFound();const old=await this.product(client,id);
        if(b.expectedVersion===undefined||b.expectedVersion!==old.version)throw conflict('O produto foi alterado. Recarregue o cadastro antes de salvar.');
        const priceMap=(values:{id?:string;priceCents?:number|null;priceModifierCents?:number}[])=>values.map(x=>({id:x.id,priceCents:x.priceCents??null,priceModifierCents:x.priceModifierCents??0})).sort((a,c)=>String(a.id).localeCompare(String(c.id)));
        const changed=old.basePriceCents!==b.basePriceCents||JSON.stringify(priceMap(old.sizes))!==JSON.stringify(priceMap(b.sizes))||JSON.stringify(priceMap(old.additions))!==JSON.stringify(priceMap(b.additions));
        if(changed&&!b.changeReason)throw new Problem(400,'Motivo obrigatório','Informe o motivo da alteração de preço.','invalid-input',{changeReason:['Informe um motivo com pelo menos 3 caracteres.']});
        await writeProduct(client,id,b,true);const saved=await this.product(client,id);await audit(client,request.actor,changed?'PRODUCT_PRICE_CHANGED':'PRODUCT_UPDATED',id,b.changeReason??'Atualização do cadastro',old,saved);return saved;
      },request.abortSignal);
      await this.invalidate();return product;
    });
    app.patch('/api/products/:id/availability',{preHandler:auth.require(['OWNER','MANAGER'])},async request=>{
      const id=z.object({id:z.string().uuid()}).parse(request.params).id,b=z.object({active:z.boolean()}).strict().parse(request.body);
      const product=await this.db.transaction(async client=>{const locked=await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[id]);if(!locked.rowCount)throw notFound();const old=await this.product(client,id);await client.query('UPDATE products SET active=$2,version=version+1,updated_at=now() WHERE id=$1',[id,b.active]);await audit(client,request.actor,'PRODUCT_UPDATED',id,'Disponibilidade alterada',{active:old.active},b);return this.product(client,id);},request.abortSignal);await this.invalidate();return product;
    });
  }
}
async function writeProduct(client:DbClient,id:string,b:ReturnType<typeof productInputSchema.parse>,update:boolean){
  if(new Set(b.sizes.map(x=>x.name.toLowerCase())).size!==b.sizes.length||new Set(b.additions.map(x=>x.name.toLowerCase())).size!==b.additions.length)throw conflict('Nomes de tamanhos e adicionais devem ser únicos no produto.');
  const v=[id,b.categoryId,b.name,b.description,b.imageUrl||null,b.basePriceCents,b.active,b.availableInKiosk,b.availableInPdv,b.fiscal.ncm,b.fiscal.cest||null,b.fiscal.cfop,b.fiscal.origem,b.fiscal.cstCsosn,b.fiscal.aliquotaIcms,b.fiscal.ibsRate,b.fiscal.cbsRate,b.fiscal.aliquotaIbpt];
  if(update)await client.query('UPDATE products SET category_id=$2,name=$3,description=$4,image_url=$5,base_price_cents=$6,active=$7,available_in_kiosk=$8,available_in_pdv=$9,ncm=$10,cest=$11,cfop=$12,origem=$13,cst_csosn=$14,aliquota_icms=$15,ibs_rate=$16,cbs_rate=$17,aliquota_ibpt=$18,version=version+1,updated_at=now() WHERE id=$1',v);
  else await client.query('INSERT INTO products(id,category_id,name,description,image_url,base_price_cents,active,available_in_kiosk,available_in_pdv,ncm,cest,cfop,origem,cst_csosn,aliquota_icms,ibs_rate,cbs_rate,aliquota_ibpt) VALUES('+v.map((_,i)=>`$${i+1}`).join(',')+')',v);
  await client.query('DELETE FROM product_sizes WHERE product_id=$1',[id]);await client.query('DELETE FROM product_additions WHERE product_id=$1',[id]);
  for(const s of b.sizes)await client.query('INSERT INTO product_sizes(id,product_id,name,price_modifier_cents,price_cents) VALUES($1,$2,$3,$4,$5)',[s.id??uuidV7(),id,s.name,s.priceModifierCents,s.priceCents??null]);
  for(const a of b.additions)await client.query('INSERT INTO product_additions(id,product_id,name,price_cents,max_quantity) VALUES($1,$2,$3,$4,$5)',[a.id??uuidV7(),id,a.name,a.priceCents,a.maxQuantity]);
}
