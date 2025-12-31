import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, SkipBack, SkipForward, Settings, Loader2 } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { invoke } from '@tauri-apps/api/tauri'

interface VideoPlayerProps {
    src: string
    title: string
    poster?: string
    onClose: () => void
    onProgress?: (currentTime: number, duration: number) => void
    initialTime?: number
}

export function VideoPlayer({ src, title, poster, onClose, onProgress, initialTime = 0 }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const progressReportRef = useRef<number>(0)

    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [isMuted, setIsMuted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [videoSrc, setVideoSrc] = useState<string | null>(null)
    const blobUrlRef = useRef<string | null>(null)

    const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null)

    // Load video file as blob URL using Tauri commands
    useEffect(() => {
        let cancelled = false;

        async function loadVideo() {
            console.log('[VideoPlayer] Loading video from:', src);

            // If it's already a URL (http/https/blob), use it directly
            if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
                setVideoSrc(src);
                return;
            }

            try {
                // Get file size first
                const fileSize = await invoke<number>('get_video_file_size', { filePath: src });
                console.log('[VideoPlayer] File size:', fileSize);

                // Read file in chunks and create blob
                const chunkSize = 10 * 1024 * 1024; // 10MB chunks
                const chunks: Uint8Array[] = [];
                let offset = 0;

                while (offset < fileSize) {
                    if (cancelled) return;

                    const chunk = await invoke<number[]>('read_video_chunk', {
                        filePath: src,
                        offset: offset,
                        chunkSize: Math.min(chunkSize, fileSize - offset)
                    });

                    chunks.push(new Uint8Array(chunk));
                    offset += chunk.length;

                    console.log(`[VideoPlayer] Loaded ${Math.round(offset / fileSize * 100)}%`);
                }

                if (cancelled) return;

                // Determine MIME type based on file extension
                const ext = src.split('.').pop()?.toLowerCase();
                let mimeType = 'video/mp4';
                if (ext === 'mkv') mimeType = 'video/x-matroska';
                else if (ext === 'webm') mimeType = 'video/webm';
                else if (ext === 'avi') mimeType = 'video/x-msvideo';
                else if (ext === 'mov') mimeType = 'video/quicktime';

                // Create blob and URL
                const blob = new Blob(chunks as BlobPart[], { type: mimeType });
                const url = URL.createObjectURL(blob);

                // Clean up old blob URL if exists
                if (blobUrlRef.current) {
                    URL.revokeObjectURL(blobUrlRef.current);
                }
                blobUrlRef.current = url;

                console.log('[VideoPlayer] Created blob URL:', url);
                setVideoSrc(url);
            } catch (e) {
                console.error('[VideoPlayer] Failed to load video:', e);
                if (!cancelled) {
                    setError(`Failed to load video: ${e}`);
                    setIsLoading(false);
                }
            }
        }

        loadVideo();

        return () => {
            cancelled = true;
            // Cleanup blob URL on unmount
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [src]);

    // Debug logging
    console.log('[VideoPlayer] Current videoSrc:', videoSrc);

    // Format time helper
    const formatTime = (seconds: number): string => {
        const hrs = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        const secs = Math.floor(seconds % 60)
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // Start hiding controls timer
    const startHideControlsTimer = useCallback(() => {
        if (hideControlsTimeout.current) {
            clearTimeout(hideControlsTimeout.current)
        }
        hideControlsTimeout.current = setTimeout(() => {
            if (isPlaying) {
                setShowControls(false)
            }
        }, 3000)
    }, [isPlaying])

    // Show controls on mouse move
    const handleMouseMove = useCallback(() => {
        setShowControls(true)
        startHideControlsTimer()
    }, [startHideControlsTimer])

    // Toggle play/pause
    const togglePlay = useCallback(() => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause()
            } else {
                videoRef.current.play()
            }
        }
    }, [isPlaying])

    // Toggle fullscreen
    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return

        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen()
            setIsFullscreen(true)
        } else {
            document.exitFullscreen()
            setIsFullscreen(false)
        }
    }, [])

    // Toggle mute
    const toggleMute = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted
            setIsMuted(!isMuted)
        }
    }, [isMuted])

    // Seek video
    const handleSeek = useCallback((value: number[]) => {
        if (videoRef.current && duration) {
            const newTime = (value[0] / 100) * duration
            videoRef.current.currentTime = newTime
            setCurrentTime(newTime)
        }
    }, [duration])

    // Change volume
    const handleVolumeChange = useCallback((value: number[]) => {
        if (videoRef.current) {
            const newVolume = value[0] / 100
            videoRef.current.volume = newVolume
            setVolume(newVolume)
            setIsMuted(newVolume === 0)
        }
    }, [])

    // Skip forward/backward
    const skip = useCallback((seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds))
        }
    }, [duration])

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case ' ':
                case 'k':
                    e.preventDefault()
                    togglePlay()
                    break
                case 'f':
                    e.preventDefault()
                    toggleFullscreen()
                    break
                case 'm':
                    e.preventDefault()
                    toggleMute()
                    break
                case 'ArrowLeft':
                    e.preventDefault()
                    skip(-10)
                    break
                case 'ArrowRight':
                    e.preventDefault()
                    skip(10)
                    break
                case 'Escape':
                    if (isFullscreen) {
                        document.exitFullscreen()
                    } else {
                        onClose()
                    }
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [togglePlay, toggleFullscreen, toggleMute, skip, isFullscreen, onClose])

    // Report progress periodically
    useEffect(() => {
        if (onProgress && currentTime > 0) {
            const now = Date.now()
            if (now - progressReportRef.current > 5000) { // Report every 5 seconds
                progressReportRef.current = now
                onProgress(currentTime, duration)
            }
        }
    }, [currentTime, duration, onProgress])

    // Fullscreen change listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement)
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }, [])

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            onMouseMove={handleMouseMove}
            onClick={(e) => {
                if (e.target === containerRef.current) {
                    togglePlay()
                }
            }}
        >
            {/* Video element */}
            <video
                ref={videoRef}
                src={videoSrc || undefined}
                poster={poster}
                className="w-full h-full object-contain"
                onLoadedMetadata={() => {
                    if (videoRef.current) {
                        setDuration(videoRef.current.duration)
                        if (initialTime > 0) {
                            videoRef.current.currentTime = initialTime
                        }
                    }
                }}
                onCanPlay={() => setIsLoading(false)}
                onWaiting={() => setIsLoading(true)}
                onPlaying={() => {
                    setIsLoading(false)
                    setIsPlaying(true)
                }}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => {
                    if (videoRef.current) {
                        setCurrentTime(videoRef.current.currentTime)
                    }
                }}
                onError={(e) => {
                    console.error('Video load error:', e)
                    console.error('Attempted video source:', videoSrc)
                    const video = videoRef.current
                    if (video?.error) {
                        console.error('Video error code:', video.error.code, 'message:', video.error.message)
                    }
                    setError(`Failed to load video: ${video?.error?.message || 'Unknown error'}`)
                }}
                onEnded={onClose}
                autoPlay
            />

            {/* Loading spinner */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                </div>
            )}

            {/* Error display */}
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
                    <p className="text-xl text-red-400">{error}</p>
                    <button
                        onClick={onClose}
                        className="mt-4 px-4 py-2 bg-primary rounded-lg hover:bg-primary/80 transition-colors"
                    >
                        Close
                    </button>
                </div>
            )}

            {/* Controls overlay */}
            <div
                className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
            >
                {/* Top bar */}
                <div className="bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between">
                    <h1 className="text-white text-xl font-semibold truncate max-w-[80%]">{title}</h1>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X className="h-6 w-6 text-white" />
                    </button>
                </div>

                {/* Center play button */}
                <div className="flex-1 flex items-center justify-center">
                    <button
                        onClick={togglePlay}
                        className="p-6 bg-black/50 rounded-full hover:bg-black/70 transition-all transform hover:scale-110"
                    >
                        {isPlaying ? (
                            <Pause className="h-12 w-12 text-white" />
                        ) : (
                            <Play className="h-12 w-12 text-white ml-1" />
                        )}
                    </button>
                </div>

                {/* Bottom controls */}
                <div className="bg-gradient-to-t from-black/80 to-transparent p-4 space-y-3">
                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                        <span className="text-white text-sm font-mono min-w-[50px]">
                            {formatTime(currentTime)}
                        </span>
                        <Slider
                            value={[duration ? (currentTime / duration) * 100 : 0]}
                            onValueChange={handleSeek}
                            max={100}
                            step={0.1}
                            className="flex-1 cursor-pointer"
                        />
                        <span className="text-white text-sm font-mono min-w-[50px] text-right">
                            {formatTime(duration)}
                        </span>
                    </div>

                    {/* Control buttons */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {/* Play/Pause */}
                            <button
                                onClick={togglePlay}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                {isPlaying ? (
                                    <Pause className="h-5 w-5 text-white" />
                                ) : (
                                    <Play className="h-5 w-5 text-white" />
                                )}
                            </button>

                            {/* Skip backward */}
                            <button
                                onClick={() => skip(-10)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                title="Skip back 10 seconds"
                            >
                                <SkipBack className="h-5 w-5 text-white" />
                            </button>

                            {/* Skip forward */}
                            <button
                                onClick={() => skip(10)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                title="Skip forward 10 seconds"
                            >
                                <SkipForward className="h-5 w-5 text-white" />
                            </button>

                            {/* Volume */}
                            <div className="flex items-center gap-2 group">
                                <button
                                    onClick={toggleMute}
                                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                >
                                    {isMuted || volume === 0 ? (
                                        <VolumeX className="h-5 w-5 text-white" />
                                    ) : (
                                        <Volume2 className="h-5 w-5 text-white" />
                                    )}
                                </button>
                                <div className="w-0 group-hover:w-24 overflow-hidden transition-all duration-200">
                                    <Slider
                                        value={[isMuted ? 0 : volume * 100]}
                                        onValueChange={handleVolumeChange}
                                        max={100}
                                        step={1}
                                        className="cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Settings */}
                            <button
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                title="Settings"
                            >
                                <Settings className="h-5 w-5 text-white" />
                            </button>

                            {/* Fullscreen */}
                            <button
                                onClick={toggleFullscreen}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                            >
                                {isFullscreen ? (
                                    <Minimize2 className="h-5 w-5 text-white" />
                                ) : (
                                    <Maximize2 className="h-5 w-5 text-white" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
