import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronUp, Send } from 'lucide-react';

import { CUSTOM_EVENTS } from '../../shared/constants';
import type { Provider, ProviderVerifyStatus } from '@/config/types';

interface BugReportOverlayProps {
    onClose: () => void;
    onNavigateToProviders: () => void;
    appVersion: string;
    providers: Provider[];
    apiKeys: Record<string, string>;
    providerVerifyStatus: Record<string, ProviderVerifyStatus>;
}

/** Check if a provider is usable for bug report */
function isProviderAvailable(
    provider: Provider,
    apiKeys: Record<string, string>,
    verifyStatus: Record<string, ProviderVerifyStatus>,
): boolean {
    if (provider.type === 'subscription') {
        const status = verifyStatus[provider.id];
        return status?.status === 'valid' && !!status.accountEmail;
    }
    // api type
    const hasKey = !!apiKeys[provider.id];
    const isInvalid = verifyStatus[provider.id]?.status === 'invalid';
    return hasKey && !isInvalid;
}

export default function BugReportOverlay({
    onClose, onNavigateToProviders, appVersion, providers, apiKeys, providerVerifyStatus,
}: BugReportOverlayProps) {
    const [description, setDescription] = useState('');
    const [showModelMenu, _setShowModelMenu] = useState(false);
    const showModelMenuRef = useRef(false);
    const setShowModelMenu = useCallback((v: boolean) => {
        showModelMenuRef.current = v;
        _setShowModelMenu(v);
    }, []);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Default selection: first available provider's primaryModel (computed once at mount)
    const defaultProvider = () => providers.find(p => isProviderAvailable(p, apiKeys, providerVerifyStatus));
    const [selectedProviderId, setSelectedProviderId] = useState<string>(() => defaultProvider()?.id ?? '');
    const [selectedModel, setSelectedModel] = useState<string>(() => defaultProvider()?.primaryModel ?? '');

    const selectedProvider = providers.find(p => p.id === selectedProviderId);

    // Get display name for current model
    const modelDisplayName = useMemo(() => {
        if (!selectedProvider || !selectedModel) return '未选择模型';
        const model = selectedProvider.models.find(m => m.model === selectedModel);
        return model?.modelName || selectedModel;
    }, [selectedProvider, selectedModel]);

    const hasValidModel = !!selectedProviderId && !!selectedModel;
    const hasText = description.trim().length > 0;
    const canSubmit = hasText && hasValidModel;

    // Focus textarea on mount
    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    // Escape to close, click outside menu to close menu
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showModelMenuRef.current) {
                    setShowModelMenu(false);
                } else {
                    onCloseRef.current();
                }
            }
        };
        const handleClick = (e: MouseEvent) => {
            if (showModelMenuRef.current && menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowModelMenu(false);
            }
        };
        document.addEventListener('keydown', handleKey);
        document.addEventListener('mousedown', handleClick);
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.removeEventListener('mousedown', handleClick);
        };
    }, [setShowModelMenu]);

    const handleSubmit = useCallback(() => {
        if (!canSubmit) return;
        window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.LAUNCH_BUG_REPORT, {
            detail: {
                description: description.trim(),
                providerId: selectedProviderId,
                model: selectedModel,
                appVersion,
            },
        }));
        onClose();
    }, [canSubmit, description, selectedProviderId, selectedModel, appVersion, onClose]);

    // Ctrl/Cmd+Enter to submit
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }
    }, [handleSubmit]);

    const isMac = navigator.platform.toLowerCase().includes('mac');
    const getSubmitTitle = () => {
        if (!hasText) return '请输入问题描述';
        if (!hasValidModel) return '请先在设置中配置模型';
        return isMac ? '发送 (⌘Enter)' : '发送 (Ctrl+Enter)';
    };

    return (
        <div
            className="fixed inset-0 z-[250] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="glass-panel w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
                    <h2 className="text-[14px] font-semibold text-[var(--ink)]">报告问题</h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1 text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-contrast)] hover:text-[var(--ink)]"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Input area — matches Chat input style */}
                <div className="px-5 py-4">
                    <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-inset)]">
                        {/* Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="描述你遇到的问题..."
                            className="w-full resize-none border-0 bg-transparent px-4 py-3 text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none"
                            rows={5}
                        />

                        {/* Bottom toolbar */}
                        <div className="flex items-center justify-between border-t border-[var(--line)] px-3 py-2">
                            {/* Model selector */}
                            <div className="relative" ref={menuRef}>
                                <button
                                    type="button"
                                    onClick={() => setShowModelMenu(!showModelMenu)}
                                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-contrast)] hover:text-[var(--ink)]"
                                >
                                    <span className="max-w-[180px] truncate">{modelDisplayName}</span>
                                    <ChevronUp className="h-3 w-3" />
                                </button>

                                {/* Model dropdown menu — only available providers */}
                                {showModelMenu && (() => {
                                    const availableProviders = providers.filter(p => isProviderAvailable(p, apiKeys, providerVerifyStatus));
                                    return (
                                        <div className="absolute bottom-full left-0 mb-1 max-h-[300px] w-[260px] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--paper)] py-1 shadow-lg">
                                            {availableProviders.length === 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowModelMenu(false);
                                                        onNavigateToProviders();
                                                    }}
                                                    className="w-full px-3 py-2.5 text-left text-[12px] text-[var(--accent)] transition-colors hover:bg-[var(--paper-contrast)]"
                                                >
                                                    请先配置模型 →
                                                </button>
                                            ) : (
                                                availableProviders.map((provider, idx) => (
                                                    <div key={provider.id}>
                                                        {idx > 0 && <div className="mx-2 my-1 border-t border-[var(--line)]" />}
                                                        <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]/60">
                                                            {provider.name}
                                                        </div>
                                                        {provider.models.map(model => {
                                                            const isSelected = selectedProviderId === provider.id && selectedModel === model.model;
                                                            return (
                                                                <button
                                                                    key={model.model}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSelectedProviderId(provider.id);
                                                                        setSelectedModel(model.model);
                                                                        setShowModelMenu(false);
                                                                    }}
                                                                    className={`w-full rounded-md px-3 py-1.5 text-left text-[12px] transition-colors ${
                                                                        isSelected
                                                                            ? 'bg-[var(--accent)]/10 font-medium text-[var(--accent)]'
                                                                            : 'text-[var(--ink)] hover:bg-[var(--paper-contrast)]'
                                                                    }`}
                                                                >
                                                                    {model.modelName}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Send button */}
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={!canSubmit}
                                title={getSubmitTitle()}
                                className={`rounded-lg p-2 transition-colors ${
                                    canSubmit
                                        ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]'
                                        : 'bg-[var(--ink-muted)]/15 text-[var(--ink-muted)]/40'
                                }`}
                            >
                                <Send className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
