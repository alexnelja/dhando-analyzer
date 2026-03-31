import React from 'react';

interface ScoreCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  color?: 'orange' | 'green' | 'blue' | 'gray' | 'red';
  size?: 'sm' | 'md' | 'lg';
}

const COLOR_MAP = {
  orange: { text: '#d97757', bg: 'rgba(217, 119, 87, 0.08)', border: 'rgba(217, 119, 87, 0.2)' },
  green: { text: '#788c5d', bg: 'rgba(120, 140, 93, 0.08)', border: 'rgba(120, 140, 93, 0.2)' },
  blue: { text: '#6a9bcc', bg: 'rgba(106, 155, 204, 0.08)', border: 'rgba(106, 155, 204, 0.2)' },
  gray: { text: '#b0aea5', bg: 'rgba(176, 174, 165, 0.08)', border: 'rgba(176, 174, 165, 0.2)' },
  red: { text: '#e05252', bg: 'rgba(224, 82, 82, 0.08)', border: 'rgba(224, 82, 82, 0.2)' },
};

const VALUE_SIZE = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-3xl',
};

export function ScoreCard({ label, value, subtitle, color = 'orange', size = 'md' }: ScoreCardProps) {
  const colors = COLOR_MAP[color];

  return (
    <div
      className="rounded-lg p-4 border"
      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
    >
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`${VALUE_SIZE[size]} font-bold`} style={{ color: colors.text }}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}
