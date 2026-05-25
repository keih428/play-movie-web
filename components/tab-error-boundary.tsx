"use client";

import type { ReactNode } from "react";
import { Component } from "react";

type TabErrorBoundaryProps = {
  tabLabel: string;
  children: ReactNode;
};

type TabErrorBoundaryState = {
  hasError: boolean;
};

export class TabErrorBoundary extends Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  state: TabErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): TabErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[tab-error-boundary]", this.props.tabLabel, error);
  }

  componentDidUpdate(prevProps: TabErrorBoundaryProps) {
    if (prevProps.tabLabel !== this.props.tabLabel && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="panel">
          <div className="panel-inner stack">
            <div>
              <h2>{this.props.tabLabel}タブの表示に失敗しました</h2>
              <p className="muted">
                一度タブを切り替え直してください。問題が続く場合はブラウザコンソールのエラーを確認します。
              </p>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
