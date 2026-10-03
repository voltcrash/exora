import { Component, type ErrorInfo, type ReactNode } from "react";
import { RecoveryScreen } from "./RecoveryScreen.tsx";

interface ApplicationErrorBoundaryProps {
  children: ReactNode;
}

interface ApplicationErrorBoundaryState {
  failed: boolean;
}

export class ApplicationErrorBoundary extends Component<
  ApplicationErrorBoundaryProps,
  ApplicationErrorBoundaryState
> {
  state: ApplicationErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ApplicationErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[application] unrecoverable React failure", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <RecoveryScreen
          action="Reload Exora"
          detail="Something in the interface broke. Your destination is still in the address bar, so reloading brings you back to it."
          heading="Exora hit a problem"
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
