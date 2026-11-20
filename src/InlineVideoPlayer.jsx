import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import './styles.css';

const formatTime = value => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
};

export default function InlineVideoPlayer({ src, label = 'Video', className = '' }) {
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      videoRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [src]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch (error) {
      console.warn('Video playback could not start:', error);
    }
  };

  const seek = value => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(value);
    setCurrentTime(video.currentTime || 0);
  };

  const changeVolume = value => {
    const next = Math.min(1, Math.max(0, Number(value)));
    setVolume(next);
    setMuted(next === 0);
    if (videoRef.current) {
      videoRef.current.volume = next;
      videoRef.current.muted = next === 0;
    }
  };

  const toggleFullscreen = async () => {
    const player = playerRef.current;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
      } else if (player?.requestFullscreen) {
        await player.requestFullscreen();
      } else if (videoRef.current?.webkitEnterFullscreen) {
        // Older Safari only exposes native fullscreen for the video element.
        videoRef.current.webkitEnterFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen is unavailable:', error);
    }
  };

  return <div
    ref={playerRef}
    className={`inline-video-player ${className}`}
    aria-label={label}
    onDoubleClick={event => event.preventDefault()}
  >
    <video
      ref={videoRef}
      className="inline-video-element"
      src={src}
      playsInline
      webkit-playsinline="true"
      preload="metadata"
      onClick={togglePlay}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime || 0)}
      onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onVolumeChange={event => {
        setMuted(event.currentTarget.muted);
        setVolume(event.currentTarget.volume);
      }}
      onEnded={() => setPlaying(false)}
    />
    {!playing && <button type="button" className="inline-video-center-play" onClick={togglePlay} aria-label="Play video"><Play size={24} fill="currentColor"/></button>}
    <div className="inline-video-controls" onClick={event => event.stopPropagation()}>
      <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
      <span className="inline-video-time">{formatTime(currentTime)}</span>
      <input
        className="inline-video-seek"
        type="range"
        min="0"
        max={duration || 0}
        step="0.1"
        value={Math.min(currentTime, duration || 0)}
        onChange={event => seek(event.target.value)}
        aria-label="Seek video"
      />
      <span className="inline-video-time">{formatTime(duration)}</span>
      <button type="button" onClick={() => {
        const next = !muted;
        setMuted(next);
        if (videoRef.current) videoRef.current.muted = next;
      }} aria-label={muted ? 'Unmute video' : 'Mute video'}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button>
      <input
        className="inline-video-volume"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={muted ? 0 : volume}
        onChange={event => changeVolume(event.target.value)}
        aria-label="Video volume"
      />
      <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'View fullscreen'} title="Fullscreen"><Maximize2 size={16}/></button>
    </div>
  </div>;
}
