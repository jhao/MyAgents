// Hook: Build delivery channel options for cron task UI
// Groups channels by current workspace vs other workspaces

import { useCallback, useMemo } from 'react';
import { useAgentStatuses } from './useAgentStatuses';
import { useConfig } from './useConfig';
import type { SelectOption } from '@/components/CustomSelect';
import type { CronDelivery } from '@/types/cronTask';

/** Sentinel value: Rust deliver_cron_result_to_bot uses the bot's router to auto-determine chat target */
const AUTO_CHAT_ID = '_auto_';

export interface DeliveryChannelInfo {
  botId: string;
  chatId: string;
  platform: string;
  name: string;
  agentName: string;
  status: string;
}

/**
 * Build grouped SelectOption[] for delivery channel picker.
 *
 * Ordering:
 * 1. "桌面通知（默认）" — value = ''
 * 2. Separator: current workspace agent name
 * 3. Channels from current workspace's agent
 * 4. Separator: other agent names
 * 5. Channels from other agents
 */
export function useDeliveryChannels(currentWorkspacePath?: string) {
  const { statuses, loading } = useAgentStatuses();
  const { config } = useConfig();
  const agents = useMemo(() => config.agents ?? [], [config.agents]);

  const { options, channelMap } = useMemo(() => {
    const map = new Map<string, DeliveryChannelInfo>();
    const result: SelectOption[] = [
      { value: '', label: '桌面通知（默认）' },
    ];

    // Build workspace -> agentId mapping
    const wsToAgent = new Map<string, string>();
    for (const a of agents) {
      wsToAgent.set(a.workspacePath, a.id);
    }

    // Collect channels grouped by current vs other
    const currentAgentId = currentWorkspacePath ? wsToAgent.get(currentWorkspacePath) : undefined;

    interface ChannelGroup {
      agentId: string;
      agentName: string;
      channels: SelectOption[];
    }

    const currentGroup: ChannelGroup = { agentId: '', agentName: '', channels: [] };
    const otherGroups: ChannelGroup[] = [];

    for (const [agentKey, agentStatus] of Object.entries(statuses)) {
      if (!agentStatus.enabled || agentStatus.channels.length === 0) continue;

      const agentId = agentStatus.agentId || agentKey;
      const agentName = agentStatus.agentName || agentKey;
      const isCurrent = agentId === currentAgentId;

      const channelOptions: SelectOption[] = [];
      for (const ch of agentStatus.channels) {
        const displayName = ch.name || ch.channelId;
        const statusText = ch.status === 'online' ? '在线' : ch.status === 'connecting' ? '连接中' : ch.status === 'error' ? '异常' : '离线';
        const statusColor = ch.status === 'online' ? 'text-[var(--success)]' : 'text-[var(--ink-muted)]';

        map.set(ch.channelId, {
          botId: ch.channelId,
          chatId: AUTO_CHAT_ID,
          platform: ch.channelType,
          name: displayName,
          agentName,
          status: ch.status,
        });

        channelOptions.push({
          value: ch.channelId,
          label: `${displayName} (${ch.channelType})`,
          suffix: <span className={`text-[10px] ${statusColor}`}>{statusText}</span>,
        });
      }

      if (isCurrent) {
        currentGroup.agentId = agentId;
        currentGroup.agentName = agentName;
        currentGroup.channels = channelOptions;
      } else if (channelOptions.length > 0) {
        otherGroups.push({ agentId, agentName, channels: channelOptions });
      }
    }

    // Add current workspace channels first
    if (currentGroup.channels.length > 0) {
      result.push({ value: '__sep_current__', label: currentGroup.agentName, isSeparator: true });
      result.push(...currentGroup.channels);
    }

    // Add other workspace channels
    for (const group of otherGroups) {
      result.push({ value: `__sep_${group.agentId}__`, label: group.agentName, isSeparator: true });
      result.push(...group.channels);
    }

    return { options: result, channelMap: map };
  }, [statuses, agents, currentWorkspacePath]);

  const hasChannels = options.length > 1; // More than just "桌面通知"

  /** Resolve a botId to CronDelivery (for creating/updating tasks) */
  const resolveDelivery = useCallback((botId: string): CronDelivery | undefined => {
    const info = channelMap.get(botId);
    if (!info) return undefined;
    return { botId: info.botId, chatId: info.chatId, platform: info.platform };
  }, [channelMap]);

  /** Get display info for a delivery target (for read-only display) */
  const getChannelInfo = useCallback((botId: string): DeliveryChannelInfo | undefined => {
    return channelMap.get(botId);
  }, [channelMap]);

  return { options, hasChannels, loading, resolveDelivery, getChannelInfo };
}
