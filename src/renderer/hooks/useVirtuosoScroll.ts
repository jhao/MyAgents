/**
 * useVirtuosoScroll — thin wrapper around react-virtuoso's scroll API.
 *
 * Replaces the 490-line useAutoScroll.ts:
 *  - followOutput:         managed by Virtuoso's built-in followOutput callback
 *  - scrollToBottom:       virtuosoRef.scrollToIndex({ index: 'LAST' }) + force-follow
 *  - pauseAutoScroll:      temporarily disables followOutput via ref
 *  - session switch:       Virtuoso remounts via key={sessionId}, initialTopMostItemIndex handles position
 *  - user scroll-up:       followOutput returns false when not at bottom (Virtuoso manages)
 */

import { useCallback, useEffect, useRef } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';

export interface VirtuosoScrollControls {
    virtuosoRef: React.RefObject<VirtuosoHandle | null>;
    /** Ref capturing virtuoso's internal scroll element — for QueryNavigator IntersectionObserver */
    scrollerRef: React.MutableRefObject<HTMLElement | null>;
    /**
     * Read by Virtuoso's followOutput callback.
     * - `false`: auto-follow disabled (paused or user scrolled up)
     * - `true`: follow only when already at bottom
     * - `'force'`: force-follow even when not at bottom (after scrollToBottom)
     */
    followEnabledRef: React.MutableRefObject<boolean | 'force'>;
    /** Re-enable auto-follow and smooth-scroll to bottom (user sends message) */
    scrollToBottom: () => void;
    /** Temporarily disable auto-follow (rewind/retry DOM changes) */
    pauseAutoScroll: (duration?: number) => void;
}

export function useVirtuosoScroll(
    isLoading: boolean,
    _messagesLength: number,
    _sessionId?: string | null,
): VirtuosoScrollControls {
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const scrollerRef = useRef<HTMLElement | null>(null);
    const followEnabledRef = useRef<boolean | 'force'>(true);
    const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Streaming starts: downgrade force-follow to normal follow ──
    useEffect(() => {
        if (isLoading) {
            if (followEnabledRef.current === 'force') {
                followEnabledRef.current = true;
            }
        }
    }, [isLoading]);

    // ── Public API ──

    const scrollToBottom = useCallback(() => {
        // 'force' makes followOutput return 'smooth' regardless of isAtBottom.
        // This handles the async gap: user clicks send → scrollToBottom fires →
        // SSE replay appends user message later → followOutput must keep tracking
        // even though Virtuoso doesn't yet consider us "at bottom".
        followEnabledRef.current = 'force';
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
    }, []);

    const pauseAutoScroll = useCallback((duration = 500) => {
        followEnabledRef.current = false;
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = setTimeout(() => {
            followEnabledRef.current = true;
            pauseTimerRef.current = null;
        }, duration);
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        };
    }, []);

    return { virtuosoRef, scrollerRef, followEnabledRef, scrollToBottom, pauseAutoScroll };
}
