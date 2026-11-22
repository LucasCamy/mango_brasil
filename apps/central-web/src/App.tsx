import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChefHat,
  CircleCheck,
  CircleDashed,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  Settings2,
  ShoppingBag,
  Sprout,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import type { User } from "@totem-pdv/shared-types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Field, FormError, LoadState, roles } from "@/components/common";
import {
  SupervisorDialog,
  type SupervisorRequest,
} from "@/components/supervisor";
import { AppContext } from "./context";
import { ModuleBoundary } from "./components/module-boundary";
import { central } from "./lib/services";
import { errorMessage } from "./lib/api";
import { useLiveRevision, useResource } from "./hooks/use-resource";
import type { CatalogDTO, KioskTerminal } from "@totem-pdv/shared-types";

const PdvPage = lazy(() => import("./pages/pdv"));
const CashPage = lazy(() => import("./pages/cash"));
const KdsPage = lazy(() => import("./pages/kds"));
const ProductsPage = lazy(() => import("./pages/products"));
const OrdersPage = lazy(() => import("./pages/orders"));
const TerminalsPage = lazy(() => import("./pages/terminals"));
const UsersPage = lazy(() => import("./pages/users"));
const AuditPage = lazy(() => import("./pages/audit"));
const SettingsPage = lazy(() => import("./pages/settings"));
const links = [
  { route: "pdv", label: "PDV Assistido", icon: CreditCard, operational: true },
  { route: "caixa", label: "Caixa & Turnos", icon: Wallet, operational: true },
  { route: "kds", label: "Cozinha KDS", icon: ChefHat, operational: true },
  { route: "pedidos", label: "Pedidos", icon: ShoppingBag, operational: true },
  {
    route: "produtos",
    label: "Produtos & Cardápio",
    icon: Package,
    operational: false,
  },
  {
    route: "totens",
    label: "Terminais & Totens",
    icon: Monitor,
    operational: false,
  },
  {
    route: "usuarios",
    label: "Usuários & Permissões",
    icon: Users,
    operational: false,
  },
  {
    route: "auditoria",
    label: "Auditoria",
    icon: BookOpen,
    operational: false,
  },
  {
    route: "configuracoes",
    label: "Configurações",
    icon: Settings2,
    operational: false,
  },
];
const pages: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  pdv: PdvPage,
  caixa: CashPage,
  kds: KdsPage,
  produtos: ProductsPage,
  pedidos: OrdersPage,
  totens: TerminalsPage,
  usuarios: UsersPage,
  auditoria: AuditPage,
  configuracoes: SettingsPage,
};

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="login-page">
      <div className="login-intro">
        <div className="wordmark p-0">
          <Sprout size={32} />
          <span>
            mango<small>Brasil · Central operacional</small>
          </span>
        </div>
        <div>
          <h1>Cada pedido. Cada detalhe.</h1>
          <p>
            Do primeiro atendimento ao fechamento do caixa, sua operação no
            mesmo lugar.
          </p>
        </div>
        <div className="login-intro-footer flex gap-3 items-center muted">
          <LayoutGrid size={20} />
          <span>Balcão, cozinha e autoatendimento</span>
        </div>
      </div>
      <div className="login-form-wrap">
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            void central
              .login(email, password)
              .then(onLogin)
              .catch((cause) => setError(errorMessage(cause)))
              .finally(() => setBusy(false));
          }}
        >
          <div>
            <h2>Acesse sua operação</h2>
            <p className="muted mt-2">Entre com sua conta da Central.</p>
          </div>
          <Field
            label="E-mail"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={Boolean(error)}
          />
          <Field
            label="Senha"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-invalid={Boolean(error)}
          />
          <FormError error={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Entrando..." : "Entrar na Central"}
            <ArrowRight aria-hidden="true" />
          </Button>
          <p className="muted text-xs">
            Seu acesso segue as permissões atribuídas pelo responsável da
            empresa.
          </p>
        </form>
      </div>
    </div>
  );
}
export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [route, setRoute] = useState(() => location.hash.slice(1) || "pdv");
  const [terminalId, selectTerminal] = useState(
    () => localStorage.getItem("central-terminal") ?? "",
  );
  const [theme, setTheme] = useState(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  const [supervisor, setSupervisor] = useState<SupervisorRequest | null>(null);
  useEffect(() => {
    void central
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    const change = () => setRoute(location.hash.slice(1) || "pdv");
    window.addEventListener("hashchange", change);
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  const live = useLiveRevision(Boolean(user));
  const catalog = useResource<CatalogDTO>(
    user ? "/catalog" : null,
    live.revision,
  );
  const terminals = useResource<KioskTerminal[]>(
    user ? "/terminals" : null,
    live.revision,
  );
  useEffect(() => {
    if (
      terminals.data?.length &&
      !terminals.data.some((terminal) => terminal.id === terminalId)
    )
      selectTerminal(
        terminals.data.find((terminal) => terminal.type === "PDV")?.id ??
          terminals.data[0]!.id,
      );
  }, [terminals.data, terminalId]);
  const setTerminalId = (id: string) => {
    localStorage.setItem("central-terminal", id);
    selectTerminal(id);
  };
  const navigate = (target: string) => {
    location.hash = target;
  };
  const changeTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    localStorage.setItem("central-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
  };
  if (booting)
    return (
      <div className="max-w-xl mx-auto p-8 mt-12">
        <LoadState loading retry={() => undefined} />
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  const permitted = links.filter(
    (link) =>
      user.role !== "CASHIER" || link.operational || link.route === "totens",
  );
  const actualRoute = permitted.some((link) => link.route === route)
    ? route
    : "pdv";
  const Page = pages[actualRoute] ?? PdvPage;
  const navButton = (link: (typeof links)[number]) => (
    <button
      key={link.route}
      className="nav-link"
      aria-current={actualRoute === link.route ? "page" : undefined}
      onClick={() => navigate(link.route)}
    >
      <link.icon size={20} aria-hidden="true" />
      <span>{link.label}</span>
    </button>
  );
  return (
    <TooltipProvider delayDuration={300}>
      <AppContext.Provider
        value={{
          user,
          catalog: catalog.data,
          catalogLoading: catalog.loading,
          catalogError: catalog.error,
          terminalsLoading: terminals.loading,
          terminalsError: terminals.error,
          terminals: terminals.data ?? [],
          terminalId,
          setTerminalId,
          revision: live.revision,
          invalidate: live.invalidate,
          navigate,
          authorize: (action, resourceId) =>
            new Promise((resolve, reject) =>
              setSupervisor({
                action,
                resourceId,
                returnFocus: document.activeElement as HTMLElement,
                resolve: (token) =>
                  token
                    ? resolve(token)
                    : reject(new Error("Autorização cancelada.")),
              }),
            ),
        }}
      >
        <div className="app-shell">
          <aside className="sidebar">
            <div className="wordmark">
              <Sprout size={30} />
              <span>
                mango<small>Brasil · Central</small>
              </span>
            </div>
            <nav aria-label="Navegação principal" className="nav-group">
              {permitted.filter((link) => link.operational).map(navButton)}
              {user.role !== "CASHIER" && (
                <p className="nav-caption">Gestão da operação</p>
              )}
              {permitted.filter((link) => !link.operational).map(navButton)}
            </nav>
            <div className="mt-auto px-3 muted text-xs">
              <p className="font-medium">Central operacional</p>
              <p className="mt-1">Pinpad simulado · fiscal configurável</p>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <div className="topbar-context">
                <p className="font-semibold text-sm">
                  Sua operação, em movimento
                </p>
                <p className="muted text-xs mt-1 flex gap-2 items-center">
                  {live.connected ? (
                    <CircleCheck size={14} />
                  ) : (
                    <CircleDashed size={14} />
                  )}
                  {live.connected
                    ? "Atualização em tempo real"
                    : "Reconectando à Central"}
                </p>
              </div>
              <div className="topbar-actions">
                <Select value={terminalId} onValueChange={setTerminalId}>
                  <SelectTrigger
                    className="terminal-select w-48 h-12"
                    aria-label="Terminal de operação"
                  >
                    <Monitor size={16} />
                    <SelectValue placeholder="Selecionar terminal" />
                  </SelectTrigger>
                  <SelectContent>
                    {(terminals.data ?? []).map((terminal) => (
                      <SelectItem key={terminal.id} value={terminal.id}>
                        {terminal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        theme === "light"
                          ? "Ativar tema escuro"
                          : "Ativar tema claro"
                      }
                      onClick={changeTheme}
                    >
                      {theme === "light" ? <Moon /> : <Sun />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Alternar tema</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Abrir menu da conta"
                    >
                      <span className="text-sm font-semibold">
                        {user.name
                          .split(" ")
                          .slice(0, 2)
                          .map((name) => name[0])
                          .join("")}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <div className="p-3">
                      <p className="font-semibold">{user.name}</p>
                      <p className="muted text-xs">{roles[user.role]}</p>
                    </div>
                    <DropdownMenuItem
                      onSelect={() => {
                        void central.logout().then(() => setUser(null));
                      }}
                    >
                      <LogOut size={16} />
                      Sair da Central
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <main className="main-content" id="main">
              <ModuleBoundary key={actualRoute}>
                <Suspense
                  fallback={<LoadState loading retry={() => undefined} />}
                >
                  <Page />
                </Suspense>
              </ModuleBoundary>
            </main>
          </div>
          <nav className="mobile-nav" aria-label="Navegação mobile">
            {permitted
              .filter((link) => link.operational)
              .slice(0, 4)
              .map(navButton)}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="nav-link">
                  <Menu aria-hidden="true" />
                  <span>Mais módulos</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end">
                {permitted
                  .filter((link) => !link.operational)
                  .map((link) => (
                    <DropdownMenuItem
                      key={link.route}
                      onSelect={() => navigate(link.route)}
                      className="min-h-12"
                    >
                      <link.icon size={18} />
                      {link.label}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
          <SupervisorDialog
            request={supervisor}
            close={() => setSupervisor(null)}
          />
        </div>
      </AppContext.Provider>
    </TooltipProvider>
  );
}
