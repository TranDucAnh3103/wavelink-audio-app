import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { YouTubeEngineHost } from './YouTubeEngineHost';

/**
 * Persistent global AudioEngine host mounted once at the application root.
 * - Always keeps a single HTML5 <audio> element mounted in stream mode so route transitions
 *   never interrupt playback.
 * - Lazily mounts YouTubeEngineHost only when engine mode is `'youtube'` or stream falls back.
 */
export const AudioEngineHost: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeEngine = usePlayerStore((s) => s.activeEngine);
  const setAudioElement = usePlayerStore((s) => s.setAudioElement);

  useEffect(() => {
    setAudioElement(audioRef.current);
    return () => {
      setAudioElement(null);
    };
  }, [setAudioElement]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __WAVELINK_ENGINE__?: string }).__WAVELINK_ENGINE__ = activeEngine;
    }
  }, [activeEngine]);

  return (
    <>
      <audio
        ref={audioRef}
        id="wavelink-html-audio"
        preload="metadata"
        playsInline
        style={{ display: 'none' }}
      />
      {activeEngine === 'youtube' && <YouTubeEngineHost />}
    </>
  );
};
