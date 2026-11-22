import { createContext, useContext } from "react";
import type {
  CatalogDTO,
  KioskTerminal,
  SupervisorInput,
  User,
} from "@totem-pdv/shared-types";
export interface AppState {
  user: User;
  catalog?: CatalogDTO;
  terminals: KioskTerminal[];
  terminalId: string;
  catalogLoading: boolean;
  catalogError?: string;
  terminalsLoading: boolean;
  terminalsError?: string;
  setTerminalId: (id: string) => void;
  revision: number;
  invalidate: () => void;
  authorize: (
    action: SupervisorInput["action"],
    resourceId: string,
  ) => Promise<string>;
  navigate: (route: string) => void;
}
export const AppContext = createContext<AppState | null>(null);
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppContext ausente");
  return context;
}
