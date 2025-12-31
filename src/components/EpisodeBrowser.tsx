import { useEffect, useState } from "react"
import { listen, UnlistenFn } from "@tauri-apps/api/event"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Play, ChevronLeft } from "lucide-react"
import { MediaItem, getEpisodes, playMedia, getResumeInfo, getStreamUrl, updateWatchProgress, StreamInfo, getCachedImageUrl, ResumeInfo } from "@/services/api"
import { useToast } from "@/components/ui/use-toast"
import { PlayerModal } from "@/components/PlayerModal"
import { VideoPlayer } from "@/components/VideoPlayer"
import { ResumeDialog } from "@/components/ResumeDialog"

interface EpisodeBrowserProps {
    show: MediaItem
    onBack: () => void
}

export function EpisodeBrowser({ show, onBack }: EpisodeBrowserProps) {
    const [episodes, setEpisodes] = useState<MediaItem[]>([])
    const [loading, setLoading] = useState(true)
    const [posterUrl, setPosterUrl] = useState<string | null>(null)
    const { toast } = useToast()

    // Player selection state
    const [playerModalOpen, setPlayerModalOpen] = useState(false)
    const [pendingPlayEpisode, setPendingPlayEpisode] = useState<MediaItem | null>(null)
    const [pendingResumeTime, setPendingResumeTime] = useState(0)

    // Built-in player state
    const [isPlayerOpen, setIsPlayerOpen] = useState(false)
    const [currentStreamInfo, setCurrentStreamInfo] = useState<StreamInfo | null>(null)
    const [currentPlayingId, setCurrentPlayingId] = useState<number | null>(null)

    // Resume dialog state
    const [resumeDialogOpen, setResumeDialogOpen] = useState(false)
    const [resumeDialogData, setResumeDialogData] = useState<{
        episode: MediaItem;
        resumeInfo: ResumeInfo;
    } | null>(null)

    useEffect(() => {
        loadEpisodes()
        loadPoster()

        // Listen for MPV playback ended to refresh progress
        let unlistenMpvEnded: UnlistenFn | undefined;

        const setupListener = async () => {
            unlistenMpvEnded = await listen('mpv-playback-ended', () => {
                loadEpisodes();
            });
        };

        setupListener();

        return () => {
            unlistenMpvEnded?.();
        };
    }, [show.id])

    const loadEpisodes = async () => {
        try {
            const data = await getEpisodes(show.id)
            setEpisodes(data)
        } catch (error) {
            console.error("Failed to load episodes", error)
            toast({ title: "Error", description: "Failed to load episodes", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const loadPoster = async () => {
        if (show.poster_path) {
            const filename = show.poster_path.replace('image_cache/', '');
            const url = await getCachedImageUrl(filename);
            if (url) {
                setPosterUrl(url);
            }
        }
    }

    const handlePlay = async (episode: MediaItem) => {
        try {
            const resumeInfo = await getResumeInfo(episode.id);

            if (resumeInfo.has_progress && resumeInfo.progress_percent < 95) {
                // Show the resume dialog
                setResumeDialogData({
                    episode,
                    resumeInfo,
                });
                setResumeDialogOpen(true);
            } else {
                // No resume needed - play from start
                await startPlayback(episode, 0);
            }
        } catch (e) {
            toast({ title: "Error", description: "Failed to start playback", variant: "destructive" })
        }
    }

    // Handle resume or start over from the dialog
    const handleResumeChoice = async (resume: boolean) => {
        if (!resumeDialogData) return;

        const { episode, resumeInfo } = resumeDialogData;
        const resumeTime = resume ? resumeInfo.position : 0;

        await startPlayback(episode, resumeTime);
    }

    // Start playback with a specific player
    const startPlayback = async (episode: MediaItem, resumeTime: number) => {
        try {
            // Direct Play via MPV (as per user request to remove internal player popup)
            await playMedia(episode.id, resumeTime > 0);
            toast({ title: "Playing", description: `Now playing S${String(episode.season_number).padStart(2, '0')}E${String(episode.episode_number).padStart(2, '0')}` })
        } catch (e) {
            toast({ title: "Error", description: "Failed to start playback", variant: "destructive" })
        }
    }

    const playWithBuiltinPlayer = async (episode: MediaItem, resumeTime: number) => {
        try {
            const streamInfo = await getStreamUrl(episode.id);
            setCurrentStreamInfo({
                ...streamInfo,
                resume_position_seconds: resumeTime || streamInfo.resume_position_seconds
            });
            setCurrentPlayingId(episode.id);
            setIsPlayerOpen(true);
            toast({
                title: "Playing",
                description: `Now playing S${String(episode.season_number).padStart(2, '0')}E${String(episode.episode_number).padStart(2, '0')}`
            });
        } catch (e) {
            toast({ title: "Error", description: "Failed to get stream URL. Make sure the file is accessible.", variant: "destructive" });
        }
    }

    const handlePlayerSelect = async (player: 'mpv' | 'builtin' | 'stream') => {
        if (!pendingPlayEpisode) return;

        if (player === 'mpv') {
            try {
                await playMedia(pendingPlayEpisode.id, pendingResumeTime > 0);
                toast({
                    title: "Playing",
                    description: `Now playing S${String(pendingPlayEpisode.season_number).padStart(2, '0')}E${String(pendingPlayEpisode.episode_number).padStart(2, '0')}`
                })
            } catch (e) {
                toast({ title: "Error", description: "Failed to start playback", variant: "destructive" })
            }
        } else if (player === 'stream') {
            // TODO: Handler for Videasy streaming will be added here
            toast({ title: "Stream", description: "Videasy streaming coming soon" })
        } else {
            await playWithBuiltinPlayer(pendingPlayEpisode, pendingResumeTime);
        }

        setPendingPlayEpisode(null);
        setPendingResumeTime(0);
    }

    const handlePlayerClose = () => {
        setIsPlayerOpen(false);
        setCurrentStreamInfo(null);
        setCurrentPlayingId(null);
        // Refresh episodes to update progress
        loadEpisodes();
    }

    const handlePlayerProgress = async (currentTime: number, duration: number) => {
        if (currentPlayingId) {
            try {
                await updateWatchProgress(currentPlayingId, currentTime, duration);
            } catch (e) {
                console.error("Failed to update progress", e);
            }
        }
    }

    const imageSrc = posterUrl || `https://placehold.co/500x750/374151/d1d5db?text=${encodeURIComponent(show.title)}`;

    return (
        <>
            <div className="h-full flex flex-col animate-in slide-in-from-right-10 duration-300">
                <Button variant="ghost" onClick={onBack} className="w-fit mb-4 pl-0 hover:bg-transparent hover:text-primary">
                    <ChevronLeft className="mr-2 h-4 w-4" /> Back to TV Shows
                </Button>

                <div className="flex flex-col md:flex-row gap-8 h-full overflow-hidden">
                    <div className="w-full md:w-1/3 flex-shrink-0">
                        <div className="rounded-lg overflow-hidden shadow-xl border">
                            <img
                                src={imageSrc}
                                alt={show.title}
                                className="w-full h-auto object-cover aspect-[2/3]"
                            />
                        </div>
                        <div className="mt-6">
                            <h1 className="text-3xl font-bold">{show.title}</h1>
                            {show.year && <p className="text-muted-foreground mt-1 text-lg">{show.year}</p>}
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{show.overview || "No overview available."}</p>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                        <h2 className="text-2xl font-semibold mb-4">Episodes</h2>
                        <div className="flex-1 border rounded-md bg-card">
                            <ScrollArea className="h-[calc(100vh-200px)]">
                                {loading ? (
                                    <div className="p-8 text-center text-muted-foreground">Loading episodes...</div>
                                ) : episodes.length === 0 ? (
                                    <div className="p-8 text-center text-muted-foreground">No episodes found.</div>
                                ) : (
                                    <div className="divide-y">
                                        {episodes.map((episode) => {
                                            const progress = episode.progress_percent || (episode.resume_position_seconds && episode.duration_seconds ? (episode.resume_position_seconds / episode.duration_seconds) * 100 : 0);
                                            return (
                                                <div key={episode.id} className="p-4 hover:bg-muted/50 transition-colors flex items-center justify-between group">
                                                    <div className="space-y-1">
                                                        <p className="font-medium">
                                                            S{String(episode.season_number).padStart(2, '0')}E{String(episode.episode_number).padStart(2, '0')}
                                                        </p>
                                                        <p className="text-sm text-muted-foreground">{episode.title}</p>
                                                        {progress > 0 && progress < 95 && (
                                                            <div className="w-24 h-1 bg-secondary rounded-full mt-2">
                                                                <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <Button size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handlePlay(episode)}>
                                                        <Play className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    </div>
                </div>
            </div>

            {/* Player Selection Modal */}
            <PlayerModal
                open={playerModalOpen}
                onOpenChange={setPlayerModalOpen}
                onSelectPlayer={handlePlayerSelect}
                title={pendingPlayEpisode ? `S${String(pendingPlayEpisode.season_number).padStart(2, '0')}E${String(pendingPlayEpisode.episode_number).padStart(2, '0')} - ${pendingPlayEpisode.title}` : ''}
                hasTmdbId={!!show.tmdb_id}
            />

            {/* Built-in Video Player */}
            {isPlayerOpen && currentStreamInfo && (
                <VideoPlayer
                    src={currentStreamInfo.stream_url}
                    title={currentStreamInfo.title}
                    poster={currentStreamInfo.poster}
                    initialTime={currentStreamInfo.resume_position_seconds}
                    onClose={handlePlayerClose}
                    onProgress={handlePlayerProgress}
                />
            )}

            {/* Resume Dialog */}
            {resumeDialogData && (
                <ResumeDialog
                    open={resumeDialogOpen}
                    onOpenChange={setResumeDialogOpen}
                    title={show.title}
                    mediaType={resumeDialogData.episode.media_type}
                    seasonEpisode={`S${String(resumeDialogData.episode.season_number).padStart(2, '0')}E${String(resumeDialogData.episode.episode_number).padStart(2, '0')}`}
                    currentPosition={resumeDialogData.resumeInfo.position}
                    duration={resumeDialogData.resumeInfo.duration}
                    posterUrl={posterUrl || undefined}
                    onResume={() => handleResumeChoice(true)}
                    onStartOver={() => handleResumeChoice(false)}
                />
            )}
        </>
    )
}
