import React from 'react';
import type { InvestmentStatus } from '../lib/ipc';

const STATUS_CONFIG: Record<
  InvestmentStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  screening: {
    label: 'Screening',
    bg: 'rgba(176, 174, 165, 0.12)',
    text: '#b0aea5',
    border: 'rgba(176, 174, 165, 0.3)',
  },
  researching: {
    label: 'Researching',
    bg: 'rgba(106, 155, 204, 0.12)',
    text: '#6a9bcc',
    border: 'rgba(106, 155, 204, 0.3)',
  },
  deep_dive: {
    label: 'Deep Dive',
    bg: 'rgba(217, 119, 87, 0.12)',
    text: '#d97757',
    border: 'rgba(217, 119, 87, 0.3)',
  },
  ready_to_buy: {
    label: 'Ready to Buy',
    bg: 'rgba(120, 140, 93, 0.12)',
    text: '#788c5d',
    border: 'rgba(120, 140, 93, 0.3)',
  },
  held: {
    label: 'Held',
    bg: 'rgba(120, 140, 93, 0.2)',
    text: '#788c5d',
    border: 'rgba(120, 140, 93, 0.4)',
  },
  exited: {
    label: 'Exited',
    bg: 'rgba(176, 174, 165, 0.08)',
    text: '#b0aea5',
    border: 'rgba(176, 174, 165, 0.2)',
  },
  rejected: {
    label: 'Rejected',
    bg: 'rgba(224, 82, 82, 0.1)',
    text: '#e05252',
    border: 'rgba(224, 82, 82, 0.25)',
  },
};

interface StatusBadgeProps {
  status: InvestmentStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    bg: 'rgba(176, 174, 165, 0.12)',
    text: '#b0aea5',
    border: 'rgba(176, 174, 165, 0.3)',
  };

  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
    >
      {config.label}
    </span>
  );
}
