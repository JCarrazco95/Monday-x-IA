import { Component, type ReactNode } from "react";

// ===========================================================================
//  Error Boundary — evita que un fallo de render en una vista deje TODA la app
//  en blanco. Muestra un mensaje y permite reintentar o volver al inicio.
// ===========================================================================

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary] fallo de render:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <div className="max-w-md rounded-2xl border border-border bg-surface p-8">
            <h2 className="text-lg font-bold text-text">Algo falló en esta vista</h2>
            <p className="mt-2 text-sm text-text-muted">
              Ocurrió un error al mostrar esta sección. El resto de la plataforma sigue funcionando.
            </p>
            <p className="mt-3 break-words rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              {this.state.error.message || String(this.state.error)}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={this.reset}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
              >
                Reintentar
              </button>
              <a
                href="/"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:text-text"
              >
                Ir al inicio
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
