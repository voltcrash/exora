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
          action="RELOAD OBSERVATORY"
          detail="The interface encountered an unexpected fault. Your destination remains in the address bar."
          heading="INTERFACE OFFLINE"
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
