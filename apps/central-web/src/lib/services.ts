import type {
  AuditLog,
  CatalogDTO,
  CompanySettings,
  CompanySettingsInput,
  KioskTerminal,
  OrderDTO,
  OrderInput,
  PaymentAuthorizeInput,
  PaymentTransaction,
  Product,
  ProductInput,
  ShiftReport,
  ShiftSummary,
  SupervisorInput,
  User,
  UserInput,
} from "@totem-pdv/shared-types";
import { api, patch, post } from "./api";

export interface Collection<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}
export interface CurrentShift {
  open: boolean;
  shift: ShiftSummary | null;
}
export interface SupervisorGrant {
  token: string;
  expiresIn: number;
}

export const central = {
  me: () => api<User>("/auth/me"),
  login: (email: string, password: string) =>
    post<User>("/auth/login", { email, password }),
  logout: () => post<void>("/auth/logout", {}),
  supervisor: (input: SupervisorInput) =>
    post<SupervisorGrant>("/auth/supervisor", input),
  catalog: () => api<CatalogDTO>("/catalog"),
  authorize: (input: PaymentAuthorizeInput) =>
    post<PaymentTransaction>("/payments/authorize", input),
  reverseAuthorization: (transactionId: string, reason: string) =>
    post<PaymentTransaction>(
      `/payments/${encodeURIComponent(transactionId)}/reverse`,
      { reason },
    ),
  createOrder: (input: OrderInput) => post<OrderDTO>("/orders", input),
  orderByKey: (key: string) =>
    api<OrderDTO>(`/orders/by-key/${encodeURIComponent(key)}`),
  cancelOrder: (id: string, reason: string, token: string) =>
    post<OrderDTO>(
      `/orders/${encodeURIComponent(id)}/cancel`,
      { reason },
      token,
    ),
  printOrder: (id: string) =>
    post<unknown>(`/orders/${encodeURIComponent(id)}/print`, {}),
  products: (page = 1) =>
    api<Collection<Product>>(`/products?page=${page}&pageSize=25`),
  saveProduct: (input: ProductInput, id?: string) =>
    id
      ? patch<Product>(`/products/${encodeURIComponent(id)}`, input)
      : post<Product>("/products", input),
  users: () => api<Collection<User>>("/users?page=1&pageSize=100"),
  createUser: (input: UserInput) => post<User>("/users", input),
  terminals: () => api<KioskTerminal[]>("/terminals"),
  currentShift: (terminalId: string) =>
    api<CurrentShift>(
      `/shifts/current?terminalId=${encodeURIComponent(terminalId)}`,
    ),
  openShift: (terminalId: string, initialCashCents: number) =>
    post<ShiftSummary>("/shifts/open", { terminalId, initialCashCents }),
  printReport: (id: string) =>
    post<unknown>(`/shifts/${encodeURIComponent(id)}/print`, {}),
  report: (id: string) =>
    api<ShiftReport>(`/shifts/${encodeURIComponent(id)}/report`),
  settings: () => api<CompanySettings>("/settings"),
  saveSettings: (input: CompanySettingsInput) =>
    patch<CompanySettings>("/settings", input),
  audit: (page = 1) =>
    api<Collection<AuditLog>>(`/audit-logs?page=${page}&pageSize=25`),
};
