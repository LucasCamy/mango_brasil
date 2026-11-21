import { Component, type ReactNode } from "react";
import { EmptyState } from "./common";

/** A failed lazy module keeps navigation available and offers a recoverable action. */
export class ModuleBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="panel">
        <EmptyState
          title="Não foi possível abrir este módulo"
          description="A conexão ou o carregamento foi interrompido. Atualize a Central para tentar novamente."
          action="Recarregar Central"
          onAction={() => location.reload()}
        />
      </div>
    ) : (
      this.props.children
    );
  }
}
