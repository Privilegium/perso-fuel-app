"use client";

import { Component, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

function reloadLatestShell() {
  // A full document request repairs a missing chunk; client routing would reuse
  // the broken graph. The query intentionally bypasses the offline shell cache.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/?fuel-update=" + Date.now());
}

export function FeatureLoading({ modal = false, onClose }: { modal?: boolean; onClose?: () => void }) {
  const content = <div className="loading-state"><LoaderCircle className="spin" size={20} />Завантажую…{onClose ? <button className="text-button" onClick={onClose}>Закрити</button> : null}</div>;
  return modal ? <div className="dialog-backdrop"><section className="fuel-dialog" role="dialog" aria-modal="true" aria-label="Завантаження форми">{content}</section></div> : content;
}

export class FeatureBoundary extends Component<{ children: ReactNode; onClose?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    const content = <div className="error-panel" role="alert">
      <span>Не вдалося завантажити цей розділ. Під’єднайтеся до інтернету та спробуйте знову.</span>
      <button className="text-button" onClick={reloadLatestShell}>Спробувати знову</button>
      {this.props.onClose ? <button className="text-button" onClick={this.props.onClose}>Закрити</button> : null}
    </div>;
    return this.props.onClose
      ? <div className="dialog-backdrop"><section className="fuel-dialog" role="dialog" aria-modal="true" aria-label="Форма недоступна">{content}</section></div>
      : content;
  }
}
