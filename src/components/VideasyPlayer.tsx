import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface VideasyPlayerProps {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    title: string;
    season?: number;
    episode?: number;
    initialProgress?: number;
    onClose: () => void;
    onProgress?: (timestamp: number, duration: number, progress: number) => void;
}

interface VideasyProgressEvent {
    id: string;
    type: 'movie' | 'tv' | 'anime';
    progress: number;
    timestamp: number;
    duration: number;
    season?: number;
    episode?: number;
}

const VIDEASY_BASE_URL = 'https://player.videasy.net';
const SLASSHY_COLOR = '8B5CF6'; // Slasshy brand purple

export function VideasyPlayer({
    tmdbId,
    mediaType,
    title,
    season,
    episode,
    onClose,
    onProgress
}: VideasyPlayerProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Construct the Videasy player URL with all features
    const playerUrl = useMemo(() => {
        let baseUrl: string | null = null;
        const params = new URLSearchParams();

        // Add Slasshy brand color and Netflix-style overlay for all content
        params.set('color', SLASSHY_COLOR);
        params.set('overlay', 'true');

        if (mediaType === 'movie') {
            // Format: https://player.videasy.net/movie/{tmdb_id}
            baseUrl = `${VIDEASY_BASE_URL}/movie/${tmdbId}`;
        } else if (mediaType === 'tv') {
            // Format: https://player.videasy.net/tv/{tmdb_id}/{season}/{episode}
            const s = season ?? 1;
            const e = episode ?? 1;
            baseUrl = `${VIDEASY_BASE_URL}/tv/${tmdbId}/${s}/${e}`;

            // Add TV show specific features
            params.set('nextEpisode', 'true');
            params.set('autoplayNextEpisode', 'true');
            params.set('episodeSelector', 'true');
        }

        if (!baseUrl) return null;

        const url = `${baseUrl}?${params.toString()}`;
        console.log('[VideasyPlayer] URL:', url);
        return url;
    }, [tmdbId, mediaType, season, episode]);

    // Listen for progress messages from the Videasy iframe
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Only accept messages from Videasy
            if (!event.origin.includes('videasy.net')) return;

            try {
                const data: VideasyProgressEvent = typeof event.data === 'string'
                    ? JSON.parse(event.data)
                    : event.data;

                if (data && typeof data.timestamp === 'number' && typeof data.duration === 'number') {
                    console.log('[Videasy] Progress update:', data);
                    onProgress?.(data.timestamp, data.duration, data.progress);
                }
            } catch (e) {
                // Ignore non-JSON messages
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onProgress]);

    // Handle iframe load
    const handleIframeLoad = useCallback(() => {
        // Give the player some time to initialize
        loadingTimeoutRef.current = setTimeout(() => {
            setIsLoading(false);
        }, 1500);
    }, []);

    // Initialize ad blocker - now handled globally in App.tsx
    // Keeping this effect as a placeholder for any player-specific blocking if needed
    useEffect(() => {
        // Ad blocker is initialized globally at app start
        // This effect can be used for player-specific blocking in the future
        console.log('[VideasyPlayer] Player mounted, global ad blocker is active');
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
            }
        };
    }, []);

    // Toggle fullscreen using Tauri window API for reliability
    const toggleFullscreen = useCallback(async () => {
        try {
            // Try to use Tauri window API first (more reliable)
            const { appWindow } = await import('@tauri-apps/api/window');
            const currentFullscreen = await appWindow.isFullscreen();

            await appWindow.setFullscreen(!currentFullscreen);
            setIsFullscreen(!currentFullscreen);
            console.log('[VideasyPlayer] Tauri fullscreen:', !currentFullscreen);
        } catch (err) {
            // Fallback to standard fullscreen API
            console.log('[VideasyPlayer] Falling back to standard fullscreen API');
            const containerElement = containerRef.current;

            if (!document.fullscreenElement) {
                try {
                    if (containerElement) {
                        await containerElement.requestFullscreen();
                    }
                    setIsFullscreen(true);
                } catch (fsErr) {
                    console.error('[VideasyPlayer] Fullscreen error:', fsErr);
                }
            } else {
                document.exitFullscreen();
                setIsFullscreen(false);
            }
        }
    }, []);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isFullscreen) {
                    // Try Tauri fullscreen exit first
                    try {
                        const { appWindow } = await import('@tauri-apps/api/window');
                        await appWindow.setFullscreen(false);
                        setIsFullscreen(false);
                    } catch {
                        // Fallback to document fullscreen
                        if (document.fullscreenElement) {
                            document.exitFullscreen();
                        }
                    }
                } else {
                    onClose();
                }
            } else if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                toggleFullscreen();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen, onClose, toggleFullscreen]);

    // Fullscreen change listener (also monitors Tauri window state)
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        // Set up interval to check Tauri fullscreen state
        const checkTauriFullscreen = async () => {
            try {
                const { appWindow } = await import('@tauri-apps/api/window');
                const fs = await appWindow.isFullscreen();
                setIsFullscreen(fs);
            } catch {
                // Not in Tauri or API not available
            }
        };

        const interval = setInterval(checkTauriFullscreen, 1000);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            clearInterval(interval);
        };
    }, []);

    if (!playerUrl) {
        return (
            <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center">
                <div className="text-center text-white">
                    <p className="text-xl text-red-400">Invalid media information</p>
                    <p className="text-sm text-gray-400 mt-2">Unable to construct streaming URL</p>
                    <button
                        onClick={onClose}
                        className="mt-4 px-4 py-2 bg-primary rounded-lg hover:bg-primary/80 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    // Use portal to render at document body level (covers sidebar completely)
    const playerContent = (
        <AnimatePresence>
            <motion.div
                ref={containerRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] bg-black flex flex-col"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    width: '100vw',
                    height: '100vh',
                    zIndex: 9999,
                }}
            >
                {/* Top bar with title and controls */}
                <motion.div
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <h1 className="text-white text-lg font-semibold truncate max-w-md">
                            {title}
                            {mediaType === 'tv' && season !== undefined && episode !== undefined && (
                                <span className="text-white/60 ml-2">
                                    S{String(season).padStart(2, '0')}E{String(episode).padStart(2, '0')}
                                </span>
                            )}
                        </h1>
                        <span className="text-xs text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                            STREAMING
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
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
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X className="h-6 w-6 text-white" />
                        </button>
                    </div>
                </motion.div>

                {/* Loading overlay */}
                <AnimatePresence>
                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20"
                        >
                            <div className="relative">
                                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                                <div className="absolute inset-0 h-16 w-16 rounded-full border-2 border-primary/20 animate-ping" />
                            </div>
                            <p className="mt-4 text-white/60 text-sm">Loading stream...</p>
                            <p className="mt-1 text-white/40 text-xs">{title}</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Videasy iframe - popups blocked at Tauri webview level */}
                <iframe
                    ref={iframeRef}
                    src={playerUrl}
                    className="flex-1 w-full h-full border-0"
                    // Note: sandbox attribute removed - it breaks Videasy player detection
                    // Popups are blocked at the Tauri webview level via on_page_load
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    onLoad={handleIframeLoad}
                    style={{
                        backgroundColor: 'black',
                        opacity: isLoading ? 0 : 1,
                        transition: 'opacity 0.3s ease-in-out'
                    }}
                />
            </motion.div>
        </AnimatePresence>
    );

    // Render as portal to document.body to ensure it covers everything
    return createPortal(playerContent, document.body);
}
