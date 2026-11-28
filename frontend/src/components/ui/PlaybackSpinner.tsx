'use client';

import React from 'react';

export interface PlaybackSpinnerProps {
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  className?: string;
}

/**
 * Semantic indeterminate loading spinner built on native <progress>.
 */
export const PlaybackSpinner: React.FC<PlaybackSpinnerProps> = ({
  size = 20,
  thickness = 3,
  color = 'currentColor',
  trackColor = 'rgba(255, 255, 255, 0.25)',
  label = 'Đang tải âm thanh',
  className = '',
}) => {
  const style = {
    '--size': `${size}px`,
    '--thickness': `${thickness}px`,
    '--spinner-color': color,
    '--track-color': trackColor,
  } as React.CSSProperties;

  return (
    <progress
      aria-label={label}
      className={`loading-spinner shrink-0 ${className}`.trim()}
      style={style}
    />
  );
};
