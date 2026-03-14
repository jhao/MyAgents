/**
 * Global React Error Boundary — catches unhandled render errors
 * and shows a recovery UI instead of a white screen.
 *
 * Must be a class component (React limitation for error boundaries).
 * Placed in main.tsx outside all providers to catch everything.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class AppErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // frontendLogger captures console.error → unified log
        console.error('[AppErrorBoundary] Unhandled React error:', error, info.componentStack);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                backgroundColor: 'var(--paper)',
                color: 'var(--ink)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}>
                <div style={{
                    maxWidth: 420,
                    padding: 32,
                    borderRadius: 12,
                    backgroundColor: 'var(--paper-inset)',
                    textAlign: 'center',
                }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>
                        界面渲染出错
                    </h2>
                    <p style={{
                        margin: '0 0 20px',
                        fontSize: 13,
                        color: 'var(--ink-muted)',
                        lineHeight: 1.5,
                    }}>
                        {this.state.error?.message || '发生了未知错误'}
                    </p>
                    <button
                        onClick={this.handleReload}
                        style={{
                            padding: '8px 24px',
                            fontSize: 14,
                            fontWeight: 500,
                            color: 'var(--paper)',
                            backgroundColor: 'var(--accent)',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                        }}
                    >
                        重新加载
                    </button>
                </div>
            </div>
        );
    }
}
