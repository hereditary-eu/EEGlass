import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Route-level workspace error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="shell-status">
          <h2>Workspace failed to load</h2>
          <p>{this.state.message || "An unexpected rendering error occurred."}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
