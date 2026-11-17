import { FiscalConfig, KioskTerminal, Order, Product, ProductCategory, Shift } from '@totem-pdv/shared-types';
export declare class Database {
    categories: ProductCategory[];
    products: Product[];
    fiscalConfig: FiscalConfig;
    shifts: Shift[];
    totems: KioskTerminal[];
    orders: Order[];
    nextTicketSequence: number;
}
export declare const db: Database;
