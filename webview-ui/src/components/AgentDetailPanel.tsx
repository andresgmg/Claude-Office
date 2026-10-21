import { useEffect, useState } from 'react';

import {
  CONTEXT_GAUGE_BG,
  CONTEXT_GAUGE_HEIGHT_PX,
  CONTEXT_GAUGE_WIDTH_PX,
  TEAM_LEAD_COLOR,
  TEAM_ROLE_COLOR,
} from '../constants.js';
import type { AgentDetails } from '../hooks/useExtensionMessages.js';
import { getActivityText, getFuelColor } from '../office/activityLabel.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { formatTimeAgo } from './formatTimeAgo.js';
import { Button } from './ui/Button.js';

/** Refresh cadence of the relative times ("12s ago") while the panel is open. */
const CLOCK_TICK_MS = 1000;

interface AgentDetailPanelProps {
  /** The agent shown. A selected sub-agent resolves to its parent before this. */
  agentId: number;
  officeState: OfficeState;
  details: AgentDetails | undefined;
  tools: ToolActivity[];
  onClose: () => void;
  onCloseAgent: (id: number) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-8 items-baseline">
      <span className="w-84 shrink-0 text-2xs text-text-muted uppercase leading-none">{label}</span>
      <span className="text-sm min-w-0 break-words leading-tight">{children}</span>
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-2xs text-text-muted uppercase leading-none">{label}</span>
      <div className="text-xs leading-tight whitespace-pre-wrap break-words bg-bg-dark border-2 border-border px-8 py-6 max-h-220 overflow-y-auto">
        {text}
      </div>
    </div>
  );
}

/**
 * Side panel with everything the office knows about one agent: where it runs
 * (project folder, branch, path), what it is doing (activity, newest tool and
 * its input), how full its context is, and what it last said or was asked.
 * Opens on character click (selection) and closes with the selection.
 */
export function AgentDetailPanel({
  agentId,
  officeState,
  details,
  tools,
  onClose,
  onCloseAgent,
}: AgentDetailPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const ch = officeState.characters.get(agentId);
  if (!ch) return null;

  const activity = getActivityText(
    agentId,
    { [agentId]: tools },
    ch.isActive,
    ch.bubbleType,
    ch.waitingAwaitingInput ?? false,
  );
  const hasPermission = tools.some((t) => t.permissionWait && !t.done);
  const hasActiveTools = tools.some((t) => !t.done);
  const dotColor =
    hasPermission || ch.bubbleType === 'waiting'
      ? 'var(--color-status-permission)'
      : ch.isActive && hasActiveTools
        ? 'var(--color-status-active)'
        : 'var(--color-text-muted)';

  const teamRoleLabel = ch.isTeamLead ? 'LEAD' : ch.agentName || null;
  const contextRatio = ch.maxContextTokens > 0 ? ch.contextTokens / ch.maxContextTokens : 0;
  const lastTool = details?.lastTool;
  const lastActivityAt = details?.lastActivityAt ?? lastTool?.at;

  return (
    <div
      className="absolute top-8 right-8 bottom-60 w-360 z-30 pixel-panel flex flex-col text-text"
      data-testid="agent-detail-panel"
      data-agent-id={agentId}
    >
      <div className="flex items-center justify-between gap-8 px-12 py-8 border-b-2 border-border">
        <div className="flex items-center gap-8 min-w-0">
          <span className="text-lg leading-none whitespace-nowrap">Agent #{agentId}</span>
          {teamRoleLabel && (
            <span
              className="text-xs leading-none overflow-hidden text-ellipsis whitespace-nowrap"
              style={{
                color: ch.isTeamLead ? TEAM_LEAD_COLOR : TEAM_ROLE_COLOR,
                fontWeight: ch.isTeamLead ? 'bold' : undefined,
              }}
            >
              {teamRoleLabel}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} title="Close panel">
          ×
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-12 py-10 flex flex-col gap-10">
        <div className="flex items-center gap-6">
          <span
            className={`w-6 h-6 rounded-full shrink-0 ${ch.isActive && !hasPermission && ch.bubbleType !== 'waiting' ? 'pixel-pulse' : ''}`}
            style={{ background: dotColor }}
          />
          <span className="text-base leading-none overflow-hidden text-ellipsis whitespace-nowrap">
            {activity}
          </span>
        </div>

        <Row label="Project">{ch.folderName ?? '—'}</Row>
        <Row label="Branch">{details?.gitBranch ?? '—'}</Row>
        {details?.cwd && (
          <Row label="Path">
            <span className="text-2xs text-text-muted break-all">{details.cwd}</span>
          </Row>
        )}
        {details?.model && <Row label="Model">{details.model}</Row>}

        {ch.contextTokens > 0 && (
          <Row label="Context">
            <span className="flex items-center gap-8">
              <span
                style={{
                  width: CONTEXT_GAUGE_WIDTH_PX,
                  height: CONTEXT_GAUGE_HEIGHT_PX,
                  background: CONTEXT_GAUGE_BG,
                  display: 'inline-block',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: `${Math.min(contextRatio * 100, 100)}%`,
                    height: '100%',
                    background: getFuelColor(contextRatio),
                  }}
                />
              </span>
              <span className="text-xs">
                {Math.round(contextRatio * 100)}% · {(ch.contextTokens / 1000).toFixed(0)}k /{' '}
                {(ch.maxContextTokens / 1000).toFixed(0)}k
              </span>
            </span>
          </Row>
        )}

        <Row label="Last tool">
          {lastTool ? (
            <span className="flex flex-col gap-2">
              <span>
                {lastTool.name}
                <span className="text-text-muted text-2xs">
                  {' '}
                  · {formatTimeAgo(lastTool.at, now)}
                </span>
              </span>
              {lastTool.summary && (
                <span className="text-2xs text-text-muted break-all">{lastTool.summary}</span>
              )}
            </span>
          ) : (
            '—'
          )}
        </Row>

        {details?.lastAssistantText && (
          <TextBlock label="Last message" text={details.lastAssistantText} />
        )}
        {details?.lastUserPrompt && <TextBlock label="Last prompt" text={details.lastUserPrompt} />}
        {!details?.transcriptPath && (
          <span className="text-2xs text-text-muted leading-tight">
            No transcript readable from this machine: messages come only from the session's own
            transcript.
          </span>
        )}

        <div className="flex flex-col gap-2 text-2xs text-text-muted leading-tight break-all">
          {details?.sessionId && <span>Session {details.sessionId}</span>}
          {details?.transcriptPath && <span>{details.transcriptPath}</span>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-8 px-12 py-6 border-t-2 border-border">
        <span className="text-2xs text-text-muted leading-none">
          {lastActivityAt ? `Last activity ${formatTimeAgo(lastActivityAt, now)}` : ''}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCloseAgent(agentId)}
          title="Close agent"
          className="opacity-70"
        >
          Dismiss agent
        </Button>
      </div>
    </div>
  );
}
