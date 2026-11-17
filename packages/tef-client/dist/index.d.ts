import { TEFOperationType, TEFTransaction } from '@totem-pdv/shared-types';
export interface PinpadDisplayEvent {
    message: string;
    step: 'INSERT_CARD' | 'ENTER_PIN' | 'PROCESSING' | 'REMOVE_CARD' | 'DONE';
}
export type PinpadCallback = (event: PinpadDisplayEvent) => void;
/**
 * Interface do Driver de Comunicação com Pinpad físico (SiTef, PayGo, D-TEF)
 */
export interface IPinpadDriver {
    connect(): Promise<boolean>;
    disconnect(): Promise<void>;
    processPayment(amount: number, operationType: TEFOperationType, onProgress: PinpadCallback): Promise<{
        success: boolean;
        nsu?: string;
        authCode?: string;
        brand?: string;
        lastDigits?: string;
        acquirer?: string;
        errorMessage?: string;
    }>;
    confirm(nsu: string): Promise<boolean>;
    reverse(nsu: string): Promise<boolean>;
}
/**
 * Driver Simulado de Pinpad para desenvolvimento e testes
 */
export declare class MockPinpadDriver implements IPinpadDriver {
    connect(): Promise<boolean>;
    disconnect(): Promise<void>;
    processPayment(amount: number, operationType: TEFOperationType, onProgress: PinpadCallback): Promise<{
        success: boolean;
        nsu?: string;
        authCode?: string;
        brand?: string;
        lastDigits?: string;
        acquirer?: string;
        errorMessage?: string;
    }>;
    confirm(nsu: string): Promise<boolean>;
    reverse(nsu: string): Promise<boolean>;
}
/**
 * Gerenciador de Transações TEF com garantia de Two-Phase Commit e Desfazimento
 */
export declare class TEFManager {
    private driver;
    private pendingTransactions;
    constructor(driver?: IPinpadDriver);
    /**
     * Fase 1: Autorização da Transação com Pinpad
     */
    startPayment(orderId: string, amount: number, operationType: TEFOperationType, onProgress?: PinpadCallback): Promise<TEFTransaction>;
    /**
     * Fase 2: Confirmação definitiva da transação após emissão da NFC-e e impressão
     */
    confirmPayment(transactionId: string): Promise<boolean>;
    /**
     * Desfazimento / Estorno automático em caso de erro na impressão ou cancelamento
     */
    reversePayment(transactionId: string): Promise<boolean>;
    /**
     * Varredura na inicialização do Kiosk para desfazer transações que ficaram órfãs (ex: queda de luz)
     */
    resolveOrphanPendencies(): Promise<number>;
}
