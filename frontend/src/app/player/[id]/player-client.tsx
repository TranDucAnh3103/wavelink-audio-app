'use client';

import React from 'react';
import { PlayerPage } from '@/pages/PlayerPage';
import { AudioItem } from '@/types';

interface PlayerClientProps {
  initialAudio?: AudioItem | null;
}

export function PlayerClient({ initialAudio }: PlayerClientProps) {
  return <PlayerPage initialAudio={initialAudio} />;
}
