"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FiscalEngineService = void 0;
exports.calculateMod11 = calculateMod11;
exports.generateNFCeAccessKey = generateNFCeAccessKey;
exports.generateNFCeQRCodeUrl = generateNFCeQRCodeUrl;
exports.buildNFCeXml = buildNFCeXml;
const crypto = __importStar(require("crypto"));
/**
 * Cálculo do Dígito Verificador da Chave de Acesso (Módulo 11)
 */
function calculateMod11(keyWithoutDV) {
    let multiplier = 2;
    let sum = 0;
    for (let i = keyWithoutDV.length - 1; i >= 0; i--) {
        sum += parseInt(keyWithoutDV.charAt(i), 10) * multiplier;
        multiplier = multiplier === 9 ? 2 : multiplier + 1;
    }
    const remainder = sum % 11;
    const dv = 11 - remainder;
    return dv === 0 || dv === 10 || dv === 11 ? 0 : dv;
}
/**
 * Gerador da Chave de Acesso da NFC-e de 44 dígitos
 * Formato: UF (2) + AAMM (4) + CNPJ (14) + mod (2) + serie (3) + nNF (9) + tpEmis (1) + cNF (8) + cDV (1)
 */
function generateNFCeAccessKey(params) {
    const ufCode = params.uf.padStart(2, '0');
    const year = params.dataEmissao.getFullYear().toString().slice(-2);
    const month = (params.dataEmissao.getMonth() + 1).toString().padStart(2, '0');
    const aamm = `${year}${month}`;
    const cleanCnpj = params.cnpj.replace(/\D/g, '').padStart(14, '0');
    const modelo = '65'; // Modelo 65 = NFC-e
    const serie = params.serie.toString().padStart(3, '0');
    const numero = params.numero.toString().padStart(9, '0');
    const tpEmis = params.tipoEmissao;
    const cNF = params.codigoAleatorio || Math.floor(10000000 + Math.random() * 90000000).toString();
    const baseKey = `${ufCode}${aamm}${cleanCnpj}${modelo}${serie}${numero}${tpEmis}${cNF}`;
    const dv = calculateMod11(baseKey);
    return `${baseKey}${dv}`;
}
/**
 * Gerador de URL do QR Code da NFC-e (Padrão Nacional v2.0)
 * Formato: <URL_UF>?p=<chave>|<versao>|<tpAmb>|<dia_emissao>|<valor_total>|<digest_hex>|<id_csc>|<hash_sha1>
 */
function generateNFCeQRCodeUrl(params) {
    const versaoQRCode = '2';
    const diaEmissao = params.dataEmissao.getDate().toString().padStart(2, '0');
    const valorTotalFormatado = params.valorTotal.toFixed(2);
    const cscIdFormatado = parseInt(params.cscId, 10).toString();
    // String para hash: chave|versao|ambiente|idCSC + cscToken
    const stringToSign = `${params.chaveAcesso}|${versaoQRCode}|${params.ambiente}|${cscIdFormatado}${params.cscToken}`;
    const sha1Hash = crypto.createHash('sha1').update(stringToSign, 'utf8').digest('hex');
    const queryParams = `${params.chaveAcesso}|${versaoQRCode}|${params.ambiente}|${diaEmissao}|${valorTotalFormatado}|${params.digestHex}|${cscIdFormatado}|${sha1Hash}`;
    return `${params.ufUrl}?p=${queryParams}`;
}
/**
 * Montador de XML da NFC-e
 */
function buildNFCeXml(order, config, accessKey, isContingency) {
    const dataFormatada = new Date().toISOString();
    const cleanCnpj = config.cnpj.replace(/\D/g, '');
    let itensXml = '';
    let totalIbpt = 0;
    let totalIcms = 0;
    order.items.forEach((item, index) => {
        const itemNumber = index + 1;
        const vProd = item.totalPrice.toFixed(2);
        const vUnit = (item.totalPrice / item.quantity).toFixed(2);
        const itemIbpt = (item.totalPrice * (item.fiscal.aliquotaIbpt / 100));
        totalIbpt += itemIbpt;
        itensXml += `
    <det nItem="${itemNumber}">
      <prod>
        <cProd>${item.productId}</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd><![CDATA[${item.productName}${item.sizeName ? ' ' + item.sizeName : ''}]]></xProd>
        <NCM>${item.fiscal.ncm.replace(/\D/g, '')}</NCM>
        ${item.fiscal.cest ? `<CEST>${item.fiscal.cest.replace(/\D/g, '')}</CEST>` : ''}
        <CFOP>${item.fiscal.cfop.replace(/\D/g, '')}</CFOP>
        <uCom>UN</uCom>
        <qCom>${item.quantity.toFixed(4)}</qCom>
        <vUnCom>${vUnit}</vUnCom>
        <vProd>${vProd}</vProd>
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>UN</uTrib>
        <qTrib>${item.quantity.toFixed(4)}</qTrib>
        <vUnTrib>${vUnit}</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        <vTotTrib>${itemIbpt.toFixed(2)}</vTotTrib>
        <ICMS>
          <ICMSSN102>
            <orig>${item.fiscal.origem}</orig>
            <CSOSN>${item.fiscal.cstCsosn}</CSOSN>
          </ICMSSN102>
        </ICMS>
        <PIS>
          <PISOutr>
            <CST>99</CST>
            <vBC>0.00</vBC>
            <pPIS>0.00</pPIS>
            <vPIS>0.00</vPIS>
          </PISOutr>
        </PIS>
        <COFINS>
          <COFINSOutr>
            <CST>99</CST>
            <vBC>0.00</vBC>
            <pCOFINS>0.00</pCOFINS>
            <vCOFINS>0.00</vCOFINS>
          </COFINSOutr>
        </COFINS>
      </imposto>
    </det>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe${accessKey}" versao="4.00">
    <ide>
      <cUF>50</cUF>
      <cNF>${accessKey.slice(35, 43)}</cNF>
      <natOp>VENDA DE MERCADORIAS</natOp>
      <mod>65</mod>
      <serie>${config.serieNFCe}</serie>
      <nNF>${config.proximoNumeroNFCe}</nNF>
      <dhEmi>${dataFormatada}</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>5002704</cMunFG>
      <tpImp>4</tpImp>
      <tpEmis>${isContingency ? '9' : '1'}</tpEmis>
      <cDV>${accessKey.slice(-1)}</cDV>
      <tpAmb>${config.environment === 'PRODUCTION' ? '1' : '2'}</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>1</indFinal>
      <indPres>1</indPres>
      <procEmi>0</procEmi>
      <verProc>TotemCentral 1.0</verProc>
      ${isContingency ? '<dhCont>' + dataFormatada + '</dhCont><xJust>Queda temporaria de conectividade com a SEFAZ</xJust>' : ''}
    </ide>
    <emit>
      <CNPJ>${cleanCnpj}</CNPJ>
      <xNome>${config.razaoSocial}</xNome>
      <xFant>${config.nomeFantasia}</xFant>
      <enderEmit>
        <xLgr>Avenida Principal</xLgr>
        <nro>1000</nro>
        <xBairro>Centro</xBairro>
        <cMun>5002704</cMun>
        <xMun>Campo Grande</xMun>
        <UF>MS</UF>
        <CEP>79000000</CEP>
        <cPais>1058</cPais>
        <xPais>BRASIL</xPais>
      </enderEmit>
      <IE>${config.inscricaoEstadual.replace(/\D/g, '')}</IE>
      <CRT>1</CRT>
    </emit>
    ${order.clientCpf ? `
    <dest>
      <CPF>${order.clientCpf.replace(/\D/g, '')}</CPF>
      <indIEDest>9</indIEDest>
    </dest>` : ''}
    ${itensXml}
    <total>
      <ICMSTot>
        <vBC>0.00</vBC>
        <vICMS>${totalIcms.toFixed(2)}</vICMS>
        <vICMSDeson>0.00</vICMSDeson>
        <vFCP>0.00</vFCP>
        <vBCST>0.00</vBCST>
        <vST>0.00</vST>
        <vFCPST>0.00</vFCPST>
        <vFCPSTRet>0.00</vFCPSTRet>
        <vProd>${order.subtotal.toFixed(2)}</vProd>
        <vFrete>0.00</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>${order.discount.toFixed(2)}</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>0.00</vPIS>
        <vCOFINS>0.00</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>${order.total.toFixed(2)}</vNF>
        <vTotTrib>${totalIbpt.toFixed(2)}</vTotTrib>
      </ICMSTot>
    </total>
    <pag>
      <detPag>
        <tPag>03</tPag>
        <vPag>${order.total.toFixed(2)}</vPag>
      </detPag>
    </pag>
    <infAdic>
      <infCpl>Trib aprox R$: ${totalIbpt.toFixed(2)} Federal e Estadual Fonte: IBPT. Senha: ${order.publicTicketNumber}</infCpl>
    </infAdic>
  </infNFe>
</NFe>`;
}
/**
 * Serviço do Motor Fiscal NFC-e
 */
class FiscalEngineService {
    config;
    constructor(config) {
        this.config = config;
    }
    async emitNFCe(order, forceContingency = false) {
        const isContingency = forceContingency || !this.isSefazOnline();
        const tipoEmissao = isContingency ? '9' : '1';
        const accessKey = generateNFCeAccessKey({
            uf: '50', // MS
            dataEmissao: new Date(),
            cnpj: this.config.cnpj,
            serie: this.config.serieNFCe,
            numero: this.config.proximoNumeroNFCe,
            tipoEmissao
        });
        const xml = buildNFCeXml(order, this.config, accessKey, isContingency);
        const digestHex = crypto.createHash('sha1').update(xml, 'utf8').digest('hex');
        const qrCodeUrl = generateNFCeQRCodeUrl({
            ufUrl: 'http://www.dfe.ms.gov.br/nfce/qrcode',
            chaveAcesso: accessKey,
            ambiente: this.config.environment === 'PRODUCTION' ? '1' : '2',
            dataEmissao: new Date(),
            valorTotal: order.total,
            digestHex,
            cscId: this.config.cscId,
            cscToken: this.config.cscToken
        });
        this.config.proximoNumeroNFCe += 1;
        return {
            id: crypto.randomUUID(),
            orderId: order.id,
            chaveAcesso: accessKey,
            serie: this.config.serieNFCe,
            numero: this.config.proximoNumeroNFCe - 1,
            status: isContingency ? 'CONTINGENCY_PENDING' : 'AUTHORIZED',
            protocoloAutorizacao: isContingency ? undefined : `15024000${Math.floor(10000000 + Math.random() * 90000000)}`,
            qrCodeUrl,
            digestValue: digestHex,
            xmlAssinado: xml,
            emissaoContingencia: isContingency,
            justificativaContingencia: isContingency ? 'Queda temporaria de conexao com SEFAZ' : undefined,
            dataEmissao: new Date().toISOString()
        };
    }
    isSefazOnline() {
        return true; // Simulado para o MVP
    }
}
exports.FiscalEngineService = FiscalEngineService;
