import { Component, type ReactNode } from 'react';

/** Shows a way out instead of a blank screen when a page crashes. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="auth-wrap" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card" style={{ maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 36 }}>😕</div>
          <h3>Щось пішло не так</h3>
          <p className="muted" style={{ fontSize: 14 }}>Оновіть сторінку — зазвичай це допомагає.</p>
          <button className="btn btn-primary btn-block" onClick={() => window.location.reload()}>Оновити</button>
          <button className="btn btn-block" style={{ marginTop: 8 }} onClick={() => { window.location.href = import.meta.env.BASE_URL; }}>На головну</button>
        </div>
      </div>
    );
  }
}
