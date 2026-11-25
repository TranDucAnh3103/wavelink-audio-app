-- Migration 005: Add direct audio stream metadata columns on youtube_videos
ALTER TABLE youtube_videos
  ADD COLUMN stream_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN stream_checked_at DATETIME NULL,
  ADD COLUMN audio_mime VARCHAR(100) NULL;
