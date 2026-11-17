import { FiscalConfig, NFCeInvoice, Order } from '@totem-pdv/shared-types';
/**
 * Cálculo do Dígito Verificador da Chave de Acesso (Módulo 11)
 */
export declare function calculateMod11(keyWithoutDV: string): number;
/**
 * Gerador da Chave de Acesso da NFC-e de 44 dígitos
 * Formato: UF (2) + AAMM (4) + CNPJ (14) + mod (2) + serie (3) + nNF (9) + tpEmis (1) + cNF (8) + cDV (1)
 */
export declare function generateNFCeAccessKey(params: {
    uf: string;
    dataEmissao: Date;
    cnpj: string;
    serie: number;
    numero: number;
    tipoEmissao: '1' | '9';
    codigoAleatorio?: string;
}): string;
/**
 * Gerador de URL do QR Code da NFC-e (Padrão Nacional v2.0)
 * Formato: <URL_UF>?p=<chave>|<versao>|<tpAmb>|<dia_emissao>|<valor_total>|<digest_hex>|<id_csc>|<hash_sha1>
 */
export declare function generateNFCeQRCodeUrl(params: {
    ufUrl: string;
    chaveAcesso: string;
    ambiente: '1' | '2';
    dataEmissao: Date;
    valorTotal: number;
    digestHex: string;
    cscId: string;
    cscToken: string;
}): string;
/**
 * Montador de XML da NFC-e
 */
export declare function buildNFCeXml(order: Order, config: FiscalConfig, accessKey: string, isContingency: boolean): string;
/**
 * Serviço do Motor Fiscal NFC-e
 */
export declare class FiscalEngineService {
    private config;
    constructor(config: FiscalConfig);
    emitNFCe(order: Order, forceContingency?: boolean): Promise<NFCeInvoice>;
    private isSefazOnline;
}
