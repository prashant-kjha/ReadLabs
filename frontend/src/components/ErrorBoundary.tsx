import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // No-op if Sentry was never initialized (e.g. missing DSN).
    Sentry.captureException(error);
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught:", error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-8">
          <div className="card max-w-md text-center">
            <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              An unexpected error occurred. Try again or reload the page.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                className="btn-secondary"
                onClick={() => this.setState({ hasError: false })}
              >
                Try again
              </button>
              <button
                className="btn-primary"
                onClick={() => window.location.reload()}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
