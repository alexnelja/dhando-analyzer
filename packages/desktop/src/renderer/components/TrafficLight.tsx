import React from 'react';

export type TrafficLightStatus = 'green' | 'amber' | 'red';

interface TrafficLightProps {
  status: TrafficLightStatus;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const STATUS_COLORS: Record<TrafficLightStatus, string> = {
  green: '#788c5d',
  amber: '#d97757',
  red: '#e05252',
};

const STATUS_BG: Record<TrafficLightStatus, string> = {
  green: 'rgba(120, 140, 93, 0.12)',
  amber: 'rgba(217, 119, 87, 0.12)',
  red: 'rgba(224, 82, 82, 0.12)',
};

const SIZE_MAP = {
  sm: 8,
  md: 10,
  lg: 14,
};

export function TrafficLight({ status, size = 'md', label }: TrafficLightProps) {
  const dotSize = SIZE_MAP[size];

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="rounded-full shrink-0"
        style={{
          width: dotSize,
          height: dotSize,
          backgroundColor: STATUS_COLORS[status],
          boxShadow: `0 0 4px ${STATUS_COLORS[status]}80`,
        }}
        aria-label={`Status: ${status}`}
        role="img"
      />
      {label && (
        <span
          className="text-xs font-medium capitalize"
          style={{ color: STATUS_COLORS[status] }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

interface TrafficLightBadgeProps {
  status: TrafficLightStatus;
}

export function TrafficLightBadge({ status }: TrafficLightBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize"
      style={{
        backgroundColor: STATUS_BG[status],
        color: STATUS_COLORS[status],
        border: `1px solid ${STATUS_COLORS[status]}40`,
      }}
    >
      <span
        className="rounded-full"
        style={{ width: 6, height: 6, backgroundColor: STATUS_COLORS[status] }}
      />
      {status}
    </span>
  );
}
