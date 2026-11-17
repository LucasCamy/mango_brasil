/**
 * @totem-pdv/shared-types
 * Contratos de domínio compartilhados entre Central Web, Totem Flutter e Motor Fiscal.
 */
export interface ProductCategory {
    id: string;
    name: string;
    slug: string;
    order: number;
    icon?: string;
    active: boolean;
}
export interface ProductSize {
    id: string;
    name: string;
    description?: string;
    priceModifier: number;
}
export interface ProductAddition {
    id: string;
    name: string;
    price: number;
    maxQuantity: number;
}
export interface FiscalTaxData {
    ncm: string;
    cest?: string;
    cfop: string;
    origem: number;
    cstCsosn: string;
    aliquotaIcms: number;
    aliquotaIbpt: number;
}
export interface Product {
    id: string;
    categoryId: string;
    name: string;
    description: string;
    imageUrl?: string;
    basePrice: number;
    active: boolean;
    availableInKiosk: boolean;
    availableInPdv: boolean;
    sizes: ProductSize[];
    additions: ProductAddition[];
    fiscal: FiscalTaxData;
    createdAt: string;
    updatedAt: string;
}
export type OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type OrderOrigin = 'TOTEM' | 'PDV_ASSISTIDO' | 'DELIVERY';
export interface SelectedAddition {
    additionId: string;
    name: string;
    price: number;
    quantity: number;
}
export interface OrderItem {
    id: string;
    productId: string;
    productName: string;
    sizeId?: string;
    sizeName?: string;
    unitPrice: number;
    quantity: number;
    additions: SelectedAddition[];
    notes?: string;
    totalPrice: number;
    fiscal: FiscalTaxData;
}
export type PaymentMethodType = 'CREDIT_CARD' | 'DEBIT_CARD' | 'PIX' | 'CASH';
export interface OrderPayment {
    id: string;
    method: PaymentMethodType;
    amount: number;
    changeAmount?: number;
    tefTransactionId?: string;
    authorizationCode?: string;
    nsu?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVERSED';
    paidAt?: string;
}
export interface Order {
    id: string;
    publicTicketNumber: string;
    origin: OrderOrigin;
    kioskId?: string;
    shiftId: string;
    status: OrderStatus;
    items: OrderItem[];
    subtotal: number;
    discount: number;
    total: number;
    payments: OrderPayment[];
    nfceKey?: string;
    nfceStatus?: 'NOT_EMITTED' | 'AUTHORIZED' | 'CONTINGENCY' | 'CANCELLED' | 'REJECTED';
    nfceXmlUrl?: string;
    clientCpf?: string;
    createdAt: string;
    updatedAt: string;
}
export type ShiftStatus = 'OPEN' | 'CLOSED';
export type CashMovementType = 'INITIAL_SUPPLY' | 'SUPPLY' | 'BLEED_SANGRIA' | 'ORDER_PAYMENT';
export interface CashMovement {
    id: string;
    shiftId: string;
    type: CashMovementType;
    amount: number;
    description: string;
    operatorId: string;
    operatorName: string;
    createdAt: string;
}
export interface PaymentMethodReconciliation {
    method: PaymentMethodType;
    systemCalculatedAmount: number;
    operatorDeclaredAmount?: number;
    difference?: number;
}
export interface Shift {
    id: string;
    terminalId: string;
    terminalType: 'PDV' | 'TOTEM';
    operatorId: string;
    operatorName: string;
    status: ShiftStatus;
    openedAt: string;
    closedAt?: string;
    initialCash: number;
    finalCalculatedCash: number;
    finalDeclaredCash?: number;
    cashDifference?: number;
    movements: CashMovement[];
    reconciliation: PaymentMethodReconciliation[];
    notes?: string;
}
export type FiscalEnvironment = 'HOMOLOGATION' | 'PRODUCTION';
export interface FiscalConfig {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string;
    inscricaoEstadual: string;
    regimeTributario: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';
    cscId: string;
    cscToken: string;
    certificateA1Path?: string;
    certificateA1Password?: string;
    serieNFCe: number;
    proximoNumeroNFCe: number;
    environment: FiscalEnvironment;
    offlineContingencyEnabled: boolean;
}
export interface NFCeInvoice {
    id: string;
    orderId: string;
    chaveAcesso: string;
    serie: number;
    numero: number;
    status: 'PENDING' | 'AUTHORIZED' | 'CONTINGENCY_PENDING' | 'REJECTED' | 'CANCELLED';
    protocoloAutorizacao?: string;
    motivoRejeicao?: string;
    qrCodeUrl: string;
    digestValue?: string;
    xmlAssinado: string;
    xmlProtocolado?: string;
    emissaoContingencia: boolean;
    justificativaContingencia?: string;
    dataEmissao: string;
}
export type KioskStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
export interface KioskTerminal {
    id: string;
    name: string;
    ipAddress?: string;
    status: KioskStatus;
    currentShiftId?: string;
    appVersion: string;
    lastHeartbeatAt: string;
    printerStatus: 'READY' | 'OUT_OF_PAPER' | 'ERROR';
    pinpadStatus: 'CONNECTED' | 'DISCONNECTED';
}
export type TEFOperationType = 'CREDIT' | 'DEBIT' | 'PIX_PINPAD';
export type TEFTransactionStatus = 'INITIALIZING' | 'WAITING_CARD_INSERTION' | 'WAITING_PASSWORD' | 'COMMUNICATING_HOST' | 'AUTHORIZED' | 'CONFIRMED' | 'CANCELLED' | 'FAILED' | 'PENDING_REVERSAL';
export interface TEFTransaction {
    id: string;
    orderId: string;
    operationType: TEFOperationType;
    amount: number;
    status: TEFTransactionStatus;
    nsu?: string;
    authorizationCode?: string;
    cardBrand?: string;
    cardLastDigits?: string;
    acquirerName?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}
