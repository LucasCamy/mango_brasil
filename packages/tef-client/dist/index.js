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
exports.TEFManager = exports.MockPinpadDriver = void 0;
const crypto = __importStar(require("crypto"));
/**
 * Driver Simulado de Pinpad para desenvolvimento e testes
 */
class MockPinpadDriver {
    async connect() {
        return true;
    }
    async disconnect() { }
    async processPayment(amount, operationType, onProgress) {
        if (operationType === 'PIX_PINPAD') {
            onProgress({ message: 'Aguardando leitura do QR Code Pix no Pinpad...', step: 'PROCESSING' });
        }
        else {
            onProgress({ message: 'Aproxime, insira ou passe o cartão', step: 'INSERT_CARD' });
            await new Promise((r) => setTimeout(r, 600));
            onProgress({ message: 'Digite a senha no teclado do Pinpad e tecle ENTER', step: 'ENTER_PIN' });
            await new Promise((r) => setTimeout(r, 800));
            onProgress({ message: 'Processando transação com a adquirente...', step: 'PROCESSING' });
            await new Promise((r) => setTimeout(r, 600));
            onProgress({ message: 'Transação autorizada! Pode retirar o cartão.', step: 'REMOVE_CARD' });
        }
        const nsu = Math.floor(100000 + Math.random() * 900000).toString();
        const authCode = Math.floor(100000 + Math.random() * 900000).toString();
        return {
            success: true,
            nsu,
            authCode,
            brand: operationType === 'CREDIT' ? 'Mastercard' : 'Visa',
            lastDigits: '4567',
            acquirer: 'Rede/SiTef'
        };
    }
    async confirm(nsu) {
        return true;
    }
    async reverse(nsu) {
        return true;
    }
}
exports.MockPinpadDriver = MockPinpadDriver;
/**
 * Gerenciador de Transações TEF com garantia de Two-Phase Commit e Desfazimento
 */
class TEFManager {
    driver;
    pendingTransactions = new Map();
    constructor(driver) {
        this.driver = driver || new MockPinpadDriver();
    }
    /**
     * Fase 1: Autorização da Transação com Pinpad
     */
    async startPayment(orderId, amount, operationType, onProgress) {
        const transactionId = crypto.randomUUID();
        const now = new Date().toISOString();
        const transaction = {
            id: transactionId,
            orderId,
            operationType,
            amount,
            status: 'INITIALIZING',
            createdAt: now,
            updatedAt: now
        };
        this.pendingTransactions.set(transactionId, transaction);
        const result = await this.driver.processPayment(amount, operationType, onProgress || (() => { }));
        if (result.success && result.nsu) {
            transaction.status = 'AUTHORIZED';
            transaction.nsu = result.nsu;
            transaction.authorizationCode = result.authCode;
            transaction.cardBrand = result.brand;
            transaction.cardLastDigits = result.lastDigits;
            transaction.acquirerName = result.acquirer;
            transaction.updatedAt = new Date().toISOString();
        }
        else {
            transaction.status = 'FAILED';
            transaction.errorMessage = result.errorMessage || 'Transação recusada pela operadora.';
            transaction.updatedAt = new Date().toISOString();
            this.pendingTransactions.delete(transactionId);
        }
        return transaction;
    }
    /**
     * Fase 2: Confirmação definitiva da transação após emissão da NFC-e e impressão
     */
    async confirmPayment(transactionId) {
        const transaction = this.pendingTransactions.get(transactionId);
        if (!transaction || !transaction.nsu) {
            return false;
        }
        const confirmed = await this.driver.confirm(transaction.nsu);
        if (confirmed) {
            transaction.status = 'CONFIRMED';
            transaction.updatedAt = new Date().toISOString();
            this.pendingTransactions.delete(transactionId);
            return true;
        }
        return false;
    }
    /**
     * Desfazimento / Estorno automático em caso de erro na impressão ou cancelamento
     */
    async reversePayment(transactionId) {
        const transaction = this.pendingTransactions.get(transactionId);
        if (!transaction || !transaction.nsu) {
            return false;
        }
        const reversed = await this.driver.reverse(transaction.nsu);
        transaction.status = 'CANCELLED';
        transaction.updatedAt = new Date().toISOString();
        this.pendingTransactions.delete(transactionId);
        return reversed;
    }
    /**
     * Varredura na inicialização do Kiosk para desfazer transações que ficaram órfãs (ex: queda de luz)
     */
    async resolveOrphanPendencies() {
        let resolvedCount = 0;
        for (const [id, tx] of this.pendingTransactions.entries()) {
            if (tx.status === 'AUTHORIZED' && tx.nsu) {
                await this.driver.reverse(tx.nsu);
                tx.status = 'PENDING_REVERSAL';
                this.pendingTransactions.delete(id);
                resolvedCount++;
            }
        }
        return resolvedCount;
    }
}
exports.TEFManager = TEFManager;
