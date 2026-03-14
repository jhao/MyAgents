/**
 * CronTaskDetailPanel — Detail view for a scheduled task.
 * Design aligned with TaskCreateModal: SectionTitle dividers, consistent spacing, light borders.
 */

import { useCallback, useEffect, useState } from 'react';
import { Clock, Play, Square, Trash2, X } from 'lucide-react';

import type { CronTask } from '@/types/cronTask';
import {
    getCronStatusText,
    getCronStatusColor,
    formatScheduleDescription,
    formatNextExecution,
    checkCanResume,
} from '@/types/cronTask';
import { getFolderName } from '@/utils/taskCenterUtils';
import ConfirmDialog from './ConfirmDialog';
import TaskRunHistory from './scheduled-tasks/TaskRunHistory';

interface CronTaskDetailPanelProps {
    task: CronTask;
    botInfo?: { name: string; platform: string };
    onClose: () => void;
    onDelete: (taskId: string) => Promise<void>;
    onResume: (taskId: string) => Promise<void>;
    onStop?: (taskId: string) => Promise<void>;
}

/** Section title — 11px uppercase, matches design_guide 6.8 */
function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            {children}
        </h4>
    );
}

/** Attribute row — label left, value right */
function InfoRow({ label, value }: { label: string; value: string | undefined }) {
    if (!value) return null;
    return (
        <div className="flex items-baseline justify-between gap-4 py-2">
            <span className="shrink-0 text-[13px] text-[var(--ink-muted)]">{label}</span>
            <span className="min-w-0 truncate text-right text-[13px] text-[var(--ink-secondary)]">{value}</span>
        </div>
    );
}

export default function CronTaskDetailPanel({ task, botInfo, onClose, onDelete, onResume, onStop }: CronTaskDetailPanelProps) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showStopConfirm, setShowStopConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isResuming, setIsResuming] = useState(false);
    const [isStopping, setIsStopping] = useState(false);

    // Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleDelete = useCallback(async () => {
        setIsDeleting(true);
        try {
            await onDelete(task.id);
            onClose();
        } catch {
            // Error handling is in the caller
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    }, [task.id, onDelete, onClose]);

    const handleResume = useCallback(async () => {
        setIsResuming(true);
        try { await onResume(task.id); } finally { setIsResuming(false); }
    }, [task.id, onResume]);

    const handleStop = useCallback(async () => {
        if (!onStop) return;
        setIsStopping(true);
        try { await onStop(task.id); } catch { /* caller handles */ } finally {
            setIsStopping(false);
            setShowStopConfirm(false);
        }
    }, [task.id, onStop]);

    const resumeCheck = checkCanResume(task);
    const displayName = task.name || task.prompt.slice(0, 40) + (task.prompt.length > 40 ? '...' : '');
    const scheduleDesc = formatScheduleDescription(task);
    const nextExec = formatNextExecution(task.nextExecutionAt, task.status);
    const runModeLabel = task.runMode === 'single_session' ? '保持上下文' : '每次新建';

    // Source label
    const sourceLabel = botInfo
        ? `${botInfo.name} (${botInfo.platform})`
        : task.tabId ? 'Chat 创建' : '手动创建';

    return (
        <>
            {showDeleteConfirm && (
                <ConfirmDialog
                    title="删除定时任务"
                    message={`确定要删除「${displayName}」吗？此操作不可撤销。`}
                    confirmText="删除"
                    cancelText="取消"
                    confirmVariant="danger"
                    loading={isDeleting}
                    onConfirm={handleDelete}
                    onCancel={() => setShowDeleteConfirm(false)}
                />
            )}

            {showStopConfirm && (
                <ConfirmDialog
                    title="停止定时任务"
                    message={`确定要停止「${displayName}」吗？停止后可以重新恢复。`}
                    confirmText="停止"
                    cancelText="取消"
                    confirmVariant="danger"
                    loading={isStopping}
                    onConfirm={handleStop}
                    onCancel={() => setShowStopConfirm(false)}
                />
            )}

            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
                style={{ animation: 'overlayFadeIn 200ms ease-out' }}
                onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
                {/* Panel — fixed height, same structure as TaskCreateModal */}
                <div
                    className="flex h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-[var(--paper-elevated)] shadow-lg"
                    style={{ animation: 'overlayPanelIn 250ms ease-out' }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* ── Header ── */}
                    <div className="flex shrink-0 items-center justify-between px-6 py-4">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <Clock className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                            <h3 className="min-w-0 truncate text-[15px] font-semibold text-[var(--ink)]">
                                {displayName}
                            </h3>
                            <span className={`shrink-0 text-[12px] font-medium ${getCronStatusColor(task.status)}`}>
                                {getCronStatusText(task.status)}
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            className="ml-2 shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-inset)] hover:text-[var(--ink)]"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* ── Body (scrollable) ── */}
                    <div className="flex-1 overflow-y-auto px-6 pb-6">

                        {/* Section: 基本信息 */}
                        <div className="space-y-3">
                            <SectionTitle>基本信息</SectionTitle>

                            {/* Schedule card */}
                            <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--line)] px-3.5 py-3">
                                <span className="text-[13px] font-semibold text-[var(--ink)]">
                                    {scheduleDesc}
                                </span>
                                <span className={`text-[12px] ${task.status === 'running' ? 'text-[var(--ink-secondary)]' : 'text-[var(--ink-muted)]/50'}`}>
                                    {task.status === 'running' ? `下次: ${nextExec}` : '已停止'}
                                </span>
                            </div>

                            {/* Attributes */}
                            <div>
                                <InfoRow label="工作区" value={getFolderName(task.workspacePath)} />
                                <InfoRow label="运行模式" value={runModeLabel} />
                                {task.model && <InfoRow label="模型" value={task.model} />}
                                <InfoRow label="来源" value={sourceLabel} />
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="my-5 border-t border-[var(--line-subtle)]" />

                        {/* Section: AI 指令 */}
                        {task.prompt && (
                            <>
                                <div className="space-y-3">
                                    <SectionTitle>AI 指令</SectionTitle>
                                    <div className="rounded-[var(--radius-sm)] border border-[var(--line)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--ink-secondary)] whitespace-pre-wrap break-words">
                                        {task.prompt}
                                    </div>
                                </div>

                                <div className="my-5 border-t border-[var(--line-subtle)]" />
                            </>
                        )}

                        {/* Section: 运行统计 */}
                        <div className="space-y-1">
                            <SectionTitle>运行统计</SectionTitle>
                            <div>
                                <InfoRow
                                    label="执行次数"
                                    value={task.endConditions.maxExecutions
                                        ? `${task.executionCount} / ${task.endConditions.maxExecutions}`
                                        : `${task.executionCount} 次`
                                    }
                                />
                                <InfoRow
                                    label="上次执行"
                                    value={task.lastExecutedAt ? new Date(task.lastExecutedAt).toLocaleString('zh-CN') : '尚未执行'}
                                />
                                {task.exitReason && <InfoRow label="退出原因" value={task.exitReason} />}
                            </div>
                            {task.lastError && (
                                <p className="text-[12px] text-[var(--error)]">{task.lastError}</p>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="my-5 border-t border-[var(--line-subtle)]" />

                        {/* Section: 结束条件 */}
                        <div className="space-y-1">
                            <SectionTitle>结束条件</SectionTitle>
                            <div>
                                <InfoRow
                                    label="截止时间"
                                    value={task.endConditions.deadline
                                        ? new Date(task.endConditions.deadline).toLocaleString('zh-CN')
                                        : '无'
                                    }
                                />
                                <InfoRow
                                    label="最大次数"
                                    value={task.endConditions.maxExecutions ? `${task.endConditions.maxExecutions} 次` : '无限次'}
                                />
                                <InfoRow
                                    label="AI 退出"
                                    value={task.endConditions.aiCanExit ? '允许' : '不允许'}
                                />
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="my-5 border-t border-[var(--line-subtle)]" />

                        {/* Section: 执行历史 */}
                        <div>
                            <SectionTitle>执行历史</SectionTitle>
                            <div className="mt-2">
                                <TaskRunHistory taskId={task.id} />
                            </div>
                        </div>
                    </div>

                    {/* ── Footer ── */}
                    <div className="flex shrink-0 items-center justify-between border-t border-[var(--line)] px-6 py-3.5">
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-[13px] font-medium text-[var(--error)] transition-colors hover:bg-[var(--error-bg)]"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除任务
                        </button>
                        {task.status === 'running' && onStop && (
                            <button
                                onClick={() => setShowStopConfirm(true)}
                                disabled={isStopping}
                                className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--error)]/30 px-5 py-2 text-[13px] font-medium text-[var(--error)] transition-colors hover:bg-[var(--error-bg)] disabled:opacity-50"
                            >
                                <Square className="h-3.5 w-3.5" />
                                {isStopping ? '停止中...' : '停止任务'}
                            </button>
                        )}
                        {task.status === 'stopped' && (
                            resumeCheck.canResume ? (
                                <button
                                    onClick={handleResume}
                                    disabled={isResuming}
                                    className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--button-primary-bg)] px-5 py-2 text-[13px] font-medium text-[var(--button-primary-text)] transition-colors hover:bg-[var(--button-primary-bg-hover)] disabled:opacity-50"
                                >
                                    <Play className="h-3.5 w-3.5" />
                                    {isResuming ? '恢复中...' : '恢复任务'}
                                </button>
                            ) : (
                                <span className="text-[12px] text-[var(--ink-muted)]/50">
                                    {resumeCheck.reason}
                                </span>
                            )
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
