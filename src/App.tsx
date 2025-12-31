import { useState, useEffect } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/api/shell'
import { Sidebar } from '@/components/Sidebar'
import { MovieCard } from '@/components/MovieCard'
import { EpisodeBrowser } from '@/components/EpisodeBrowser'
import { StreamView } from '@/components/StreamView'
import { SettingsModal } from '@/components/SettingsModal'
import { FixMatchModal } from '@/components/FixMatchModal'
import { PlayerModal } from '@/components/PlayerModal'
import { VideoPlayer } from '@/components/VideoPlayer'
import { ResumeDialog } from '@/components/ResumeDialog'
import { DeleteEpisodesModal } from '@/components/DeleteEpisodesModal'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Toaster } from '@/components/ui/toaster'
import {
  getLibrary,
  getWatchHistory,
  removeFromWatchHistory,
  clearAllWatchHistory,
  deleteMediaFiles,
  MediaItem,
  playMedia,
  getResumeInfo,
  scanLibrary,
  getStreamUrl,
  updateWatchProgress,
  StreamInfo,
  ResumeInfo,
  getCachedImageUrl,
  // Streaming history
  StreamingHistoryItem,
  getStreamingHistory,
  removeFromStreamingHistory,
  clearAllStreamingHistory,
} from '@/services/api'
import { initAdBlocker } from '@/utils/adBlocker'
import { Search, Loader2, Trash2, Play, Film, Tv } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { motion, AnimatePresence } from 'framer-motion'

// Initialize ad blocker globally at app start
// This blocks popups before any component mounts
initAdBlocker();

interface ScanProgressPayload {
  title: string;
  media_type: string;
  current: number;
  total: number;
  // ... other fields
}

interface ScanCompletePayload {
  movies_count: number;
  tv_count: number;
}

interface MpvPlaybackEndedPayload {
  media_id: number;
  title: string;
  final_position?: number;
  final_duration?: number;
  completed: boolean;
}

function App() {
  const [view, setView] = useState<string>('home')
  const [items, setItems] = useState<MediaItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedShow, setSelectedShow] = useState<MediaItem | null>(null)

  // Home search state
  const [homeSearchQuery, setHomeSearchQuery] = useState('')
  const [homeSearchResults, setHomeSearchResults] = useState<MediaItem[]>([])
  const [isHomeSearching, setIsHomeSearching] = useState(false)

  // Scanning state
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; title: string } | null>(null)

  // Modals
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fixMatchOpen, setFixMatchOpen] = useState(false)
  const [itemToFix, setItemToFix] = useState<MediaItem | null>(null)

  // Player selection
  const [playerModalOpen, setPlayerModalOpen] = useState(false)
  const [pendingPlayItem, setPendingPlayItem] = useState<MediaItem | null>(null)
  const [pendingResumeTime, setPendingResumeTime] = useState(0)

  // Built-in player state
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [currentStreamInfo, setCurrentStreamInfo] = useState<StreamInfo | null>(null)
  const [currentPlayingId, setCurrentPlayingId] = useState<number | null>(null)

  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const { toast } = useToast()

  // Resume dialog state
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false)
  const [resumeDialogData, setResumeDialogData] = useState<{
    item: MediaItem;
    resumeInfo: ResumeInfo;
    posterUrl?: string;
  } | null>(null)

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteModalData, setDeleteModalData] = useState<{
    seriesId: number;
    seriesTitle: string;
  } | null>(null)

  // History tab state: 'local' for MPV/local files, 'streaming' for online streams
  const [historyTab, setHistoryTab] = useState<'local' | 'streaming'>('local')
  const [streamingHistoryItems, setStreamingHistoryItems] = useState<StreamingHistoryItem[]>([])

  // Streaming resume dialog state
  const [streamingResumeDialogOpen, setStreamingResumeDialogOpen] = useState(false)
  const [streamingResumeData, setStreamingResumeData] = useState<StreamingHistoryItem | null>(null)

  // Listen for Tauri events
  useEffect(() => {
    let unlistenProgress: UnlistenFn | undefined;
    let unlistenComplete: UnlistenFn | undefined;
    let unlistenMpvEnded: UnlistenFn | undefined;

    const setupListeners = async () => {
      // Listen for scan progress events
      unlistenProgress = await listen<ScanProgressPayload>('scan-progress', (event) => {
        const payload = event.payload;
        console.log('[SCAN] Progress:', payload);
        setScanProgress({
          current: payload.current,
          total: payload.total,
          title: payload.title
        });
      });

      // Listen for scan complete events
      unlistenComplete = await listen<ScanCompletePayload>('scan-complete', async (event) => {
        console.log('[SCAN] Complete:', event.payload);
        setIsScanning(false);
        setScanProgress(null);

        // Refresh the library data
        await fetchData();

        // Check for items without posters
        const movies = await getLibrary('movie');
        const tv = await getLibrary('tv');
        const allItems = [...movies, ...tv];
        const missingCount = allItems.filter(i => !i.poster_path).length;

        if (missingCount > 0) {
          toast({
            title: "Scan Complete",
            description: `Found ${missingCount} items without metadata. Right-click them to "Fix Match" using a TMDB/IMDB URL.`,
            duration: 8000
          });
        } else if (allItems.length > 0) {
          toast({ title: "Scan Complete", description: `Library updated successfully. Found ${allItems.length} items.` });
        } else {
          toast({ title: "Scan Complete", description: "No media files found. Check your media folders in Settings." });
        }
      });

      // Listen for MPV playback ended events
      unlistenMpvEnded = await listen<MpvPlaybackEndedPayload>('mpv-playback-ended', async (event) => {
        console.log('[MPV] Playback ended:', event.payload);

        const { title, completed, final_position, final_duration } = event.payload;

        if (completed) {
          toast({
            title: "Finished",
            description: `Finished watching: ${title}`,
            duration: 4000
          });
        } else if (final_position && final_duration && final_position > 30) {
          // Only show if watched more than 30 seconds
          const progressPercent = (final_position / final_duration) * 100;
          toast({
            title: "Progress Saved",
            description: `${title} - ${progressPercent.toFixed(0)}% watched. Your progress has been saved.`,
            duration: 4000
          });
        }

        // Refresh data to update progress indicators
        await fetchData();
      });
    };

    setupListeners();

    return () => {
      unlistenProgress?.();
      unlistenComplete?.();
      unlistenMpvEnded?.();
    };
  }, []);

  // Initialize theme - Force Dark for Futuristic Mode
  useEffect(() => {
    setTheme('dark')
    document.documentElement.classList.add('dark')
  }, [])

  const toggleTheme = () => {
    // Keep it dark for now, maybe add a 'light mode' later but futuristic works best in dark
    toast({ title: "Theme Locked", description: "Futuristic 2.0 theme is optimized for dark mode." })
  }

  useEffect(() => {
    if (view !== 'episodes' && view !== 'home') {
      const delayDebounceFn = setTimeout(() => {
        fetchData()
      }, 300)

      return () => clearTimeout(delayDebounceFn)
    }
  }, [view, searchQuery])

  // Instant home search with debounce
  useEffect(() => {
    if (view !== 'home') return

    // Clear results if search is empty
    if (!homeSearchQuery.trim()) {
      setHomeSearchResults([])
      return
    }

    const delayDebounceFn = setTimeout(() => {
      handleHomeSearch()
    }, 300) // 300ms debounce for smooth typing

    return () => clearTimeout(delayDebounceFn)
  }, [homeSearchQuery, view])

  // Handle home search
  const handleHomeSearch = async () => {
    if (!homeSearchQuery.trim()) {
      setHomeSearchResults([])
      return
    }

    setIsHomeSearching(true)
    try {
      // Search both movies and TV shows in parallel
      const [movies, tvShows] = await Promise.all([
        getLibrary('movie', homeSearchQuery),
        getLibrary('tv', homeSearchQuery)
      ])

      // Combine results, adding a type indicator for sorting/display
      const combined = [...movies, ...tvShows]

      // Sort by title relevance (exact match first, then starts with, then contains)
      const query = homeSearchQuery.toLowerCase()
      combined.sort((a, b) => {
        const aTitle = a.title.toLowerCase()
        const bTitle = b.title.toLowerCase()

        // Exact match first
        if (aTitle === query && bTitle !== query) return -1
        if (bTitle === query && aTitle !== query) return 1

        // Starts with
        if (aTitle.startsWith(query) && !bTitle.startsWith(query)) return -1
        if (bTitle.startsWith(query) && !aTitle.startsWith(query)) return 1

        // Alphabetical
        return aTitle.localeCompare(bTitle)
      })

      setHomeSearchResults(combined)
    } catch (error) {
      console.error("Failed to search", error)
    } finally {
      setIsHomeSearching(false)
    }
  }

  const fetchData = async () => {
    try {
      let data: MediaItem[] = []
      if (view === 'movies') {
        data = await getLibrary('movie', searchQuery)
      } else if (view === 'tv') {
        data = await getLibrary('tv', searchQuery)
      } else if (view === 'history') {
        // Sync streaming progress from browser localStorage first
        await syncStreamingProgressFromBrowser()

        // Fetch both local and streaming history
        data = await getWatchHistory()
        const streamingData = await getStreamingHistory(50)
        setStreamingHistoryItems(streamingData)
      }
      setItems(data)
    } catch (error) {
      console.error("Failed to fetch data", error)
    }
  }

  // Sync streaming progress from browser localStorage to database
  // NOTE: Since we now use Videasy player directly, we cannot access its localStorage
  // The Videasy player manages its own progress internally
  const syncStreamingProgressFromBrowser = async () => {
    // No-op in production since Videasy manages its own progress
    // This function is kept for potential future local player integration
    console.log('[Sync] Skipping browser localStorage sync - using direct Videasy player')
    return Promise.resolve()
  }

  const handleScan = async () => {
    if (isScanning) {
      toast({ title: "Scan In Progress", description: "A scan is already running." });
      return;
    }

    try {
      setIsScanning(true);
      setScanProgress(null);
      await scanLibrary()
      toast({ title: "Scan Started", description: "Library scan is running in the background. You'll be notified when complete." })
    } catch (error) {
      setIsScanning(false);
      toast({ title: "Error", description: "Failed to start scan", variant: "destructive" })
    }
  }

  const handleItemClick = async (item: MediaItem) => {
    if (item.media_type === 'tvshow') {
      setSelectedShow(item)
      setView('episodes')
    } else {
      // Check for resume info
      try {
        const resumeInfo = await getResumeInfo(item.id);

        if (resumeInfo.has_progress && resumeInfo.progress_percent < 95) {
          // Get poster URL for the dialog
          let posterUrl: string | undefined;
          if (item.poster_path) {
            try {
              posterUrl = await getCachedImageUrl(item.poster_path.replace('image_cache/', '')) || undefined;
            } catch {
              // Ignore poster error
            }
          }

          // Show the resume dialog
          setResumeDialogData({
            item,
            resumeInfo,
            posterUrl
          });
          setResumeDialogOpen(true);
        } else {
          // No resume needed - play from start
          await startPlayback(item, 0);
        }
      } catch (e) {
        toast({ title: "Error", description: "Failed to start playback", variant: "destructive" })
      }
    }
  }

  // Handle resume or start over from the dialog
  const handleResumeChoice = async (resume: boolean) => {
    if (!resumeDialogData) return;

    const { item, resumeInfo } = resumeDialogData;
    const resumeTime = resume ? resumeInfo.position : 0;

    await startPlayback(item, resumeTime);
  }

  // Start playback with a specific player
  const startPlayback = async (item: MediaItem, resumeTime: number) => {
    try {
      // Direct Play via MPV (as per user request to remove internal player popup)
      await playMedia(item.id, resumeTime > 0);
      toast({ title: "Playing", description: `Now playing: ${item.title}` });
    } catch (e) {
      toast({ title: "Error", description: "Failed to start playback", variant: "destructive" })
    }
  }

  const playWithBuiltinPlayer = async (item: MediaItem, resumeTime: number) => {
    try {
      const streamInfo = await getStreamUrl(item.id);

      // Check if file format is supported by browser
      const filePath = streamInfo.file_path.toLowerCase();
      const ext = filePath.split('.').pop() || '';
      const unsupportedFormats = ['mkv', 'avi', 'wmv', 'flv', 'mov', 'ts', 'm2ts'];

      if (unsupportedFormats.includes(ext)) {
        // Unsupported format - use MPV instead
        toast({
          title: "Unsupported Format",
          description: `${ext.toUpperCase()} files require MPV player. Opening with MPV...`,
          duration: 4000
        });
        try {
          await playMedia(item.id, resumeTime > 0);
          toast({ title: "Playing", description: `Now playing: ${item.title}` });
        } catch (mpvError) {
          toast({
            title: "Error",
            description: "Failed to open with MPV. Make sure MPV is installed and configured in Settings.",
            variant: "destructive"
          });
        }
        return;
      }

      setCurrentStreamInfo({
        ...streamInfo,
        resume_position_seconds: resumeTime || streamInfo.resume_position_seconds
      });
      setCurrentPlayingId(item.id);
      setIsPlayerOpen(true);
      toast({ title: "Playing", description: `Now playing: ${item.title}` });
    } catch (e) {
      toast({ title: "Error", description: "Failed to get stream URL. Make sure the file is accessible.", variant: "destructive" });
    }
  }

  const handlePlayerSelect = async (player: 'mpv' | 'builtin' | 'stream') => {
    // ... logic for player select if needed
    if (!pendingPlayItem) return;

    if (player === 'mpv') {
      try {
        await playMedia(pendingPlayItem.id, pendingResumeTime > 0);
        toast({ title: "Playing", description: `Now playing: ${pendingPlayItem.title}` })
      } catch (e) {
        toast({ title: "Error", description: "Failed to start playback", variant: "destructive" })
      }
    } else if (player === 'stream') {
      // TODO: Handler for Videasy streaming will be added here
      toast({ title: "Stream", description: "Videasy streaming coming soon" })
    } else {
      await playWithBuiltinPlayer(pendingPlayItem, pendingResumeTime);
    }

    setPendingPlayItem(null);
    setPendingResumeTime(0);
  }

  const handlePlayerClose = () => {
    setIsPlayerOpen(false);
    setCurrentStreamInfo(null);
    setCurrentPlayingId(null);
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

  const handleFixMatch = (item: MediaItem) => {
    setItemToFix(item)
    setFixMatchOpen(true)
  }

  // Handle removing a single item from watch history
  const handleRemoveFromHistory = async (item: MediaItem) => {
    try {
      await removeFromWatchHistory(item.id)
      toast({ title: "Removed", description: `"${item.title}" removed from watch history.` })
      await fetchData() // Refresh the list
    } catch {
      toast({ title: "Error", description: "Failed to remove from history", variant: "destructive" })
    }
  }

  // Handle clearing all watch history
  const handleClearAllHistory = async () => {
    if (!confirm("Are you sure you want to clear all watch history? This action cannot be undone.")) {
      return
    }
    try {
      await clearAllWatchHistory()
      toast({ title: "Cleared", description: "All watch history has been cleared." })
      await fetchData() // Refresh the list
    } catch {
      toast({ title: "Error", description: "Failed to clear watch history", variant: "destructive" })
    }
  }

  // Handle removing a single streaming history item
  const handleRemoveFromStreamingHistory = async (item: StreamingHistoryItem) => {
    try {
      await removeFromStreamingHistory(item.id)
      toast({ title: "Removed", description: `"${item.title}" removed from streaming history.` })
      await fetchData()
    } catch {
      toast({ title: "Error", description: "Failed to remove from streaming history", variant: "destructive" })
    }
  }

  // Handle clearing all streaming history
  const handleClearAllStreamingHistory = async () => {
    if (!confirm("Are you sure you want to clear all streaming history? This action cannot be undone.")) {
      return
    }
    try {
      await clearAllStreamingHistory()
      toast({ title: "Cleared", description: "All streaming history has been cleared." })
      await fetchData()
    } catch {
      toast({ title: "Error", description: "Failed to clear streaming history", variant: "destructive" })
    }
  }

  // Handle clicking on a streaming history item - always show resume dialog since they've watched before
  const handleStreamingItemClick = async (item: StreamingHistoryItem) => {
    // Always show dialog for history items - they've watched this before
    // The player.html will handle getting the actual position from browser localStorage
    setStreamingResumeData(item)
    setStreamingResumeDialogOpen(true)
  }

  // Open streaming content in browser using direct Videasy URLs with all features
  // IMPORTANT: Videasy requires parameters in a specific order to work correctly
  const openStreamingContent = async (item: StreamingHistoryItem, _resume: boolean) => {
    const VIDEASY_PLAYER_BASE = 'https://player.videasy.net'
    const SLASSHY_COLOR = '8B5CF6' // Slasshy brand purple

    let url: string
    let displayTitle = item.title

    if (item.media_type === 'movie') {
      // Movie params in order: overlay, color
      url = `${VIDEASY_PLAYER_BASE}/movie/${item.tmdb_id}?overlay=true&color=${SLASSHY_COLOR}`
    } else {
      const season = item.season || 1
      const episode = item.episode || 1
      displayTitle = `${item.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
      // TV params in required order: nextEpisode, autoplayNextEpisode, episodeSelector, overlay, color
      url = `${VIDEASY_PLAYER_BASE}/tv/${item.tmdb_id}/${season}/${episode}?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=${SLASSHY_COLOR}`
    }

    try {
      await open(url)
      toast({
        title: "Opening Stream",
        description: `Streaming "${displayTitle}" in your default browser`,
      })
    } catch (error) {
      console.error('Failed to open browser:', error)
      toast({
        title: "Failed to Open Browser",
        description: "Could not open the streaming URL in your browser",
        variant: "destructive"
      })
    }
  }

  // Handle streaming resume dialog choice
  const handleStreamingResumeChoice = async (resume: boolean) => {
    if (streamingResumeData) {
      await openStreamingContent(streamingResumeData, resume)
      setStreamingResumeDialogOpen(false)
      setStreamingResumeData(null)
    }
  }

  // Handle delete action from context menu
  const handleDelete = async (item: MediaItem) => {
    if (item.media_type === 'tvshow') {
      // For TV shows, open the episode selection modal
      setDeleteModalData({
        seriesId: item.id,
        seriesTitle: item.title
      })
      setDeleteModalOpen(true)
    } else {
      // For movies or single episodes, confirm and delete directly
      const confirmed = confirm(
        `⚠️ PERMANENT DELETE\n\nAre you sure you want to permanently delete "${item.title}"?\n\nThis will delete the file from your drive. This action CANNOT be undone!`
      )

      if (confirmed) {
        try {
          const result = await deleteMediaFiles([item.id])
          if (result.success) {
            toast({
              title: "Deleted",
              description: result.message,
            })
            await fetchData() // Refresh the list
          } else {
            toast({
              title: "Partial Delete",
              description: result.message,
              variant: "destructive"
            })
            await fetchData()
          }
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to delete file",
            variant: "destructive"
          })
        }
      }
    }
  }

  // Handle delete modal completion
  const handleDeleteComplete = async () => {
    await fetchData()
    toast({
      title: "Deleted",
      description: "Selected episodes have been permanently deleted."
    })
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/20 bg-[#030308]">
      {/* Global Animated Background - Matching Sidebar Colors */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Deep space base matching sidebar */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1a] via-[#050510] to-[#030308]" />

        {/* 3D Depth Layer - Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(139, 92, 246, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.3) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />

        {/* Animated Violet/Purple Orbs - Matching sidebar palette */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.12, 0.25, 0.12],
            x: [0, 50, 0],
            y: [0, -30, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-20 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-violet-600/25 to-purple-600/15 rounded-full blur-[150px]"
        />
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.1, 0.2, 0.1],
            x: [0, -40, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          className="absolute top-1/3 -left-20 w-[500px] h-[500px] bg-gradient-to-r from-purple-700/20 to-violet-500/10 rounded-full blur-[140px]"
        />
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.08, 0.18, 0.08],
            x: [0, -30, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute -bottom-32 left-1/3 w-[700px] h-[700px] bg-gradient-to-t from-violet-900/20 to-purple-600/10 rounded-full blur-[180px]"
        />

        {/* Cyan accent orb for subtle contrast */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.05, 0.12, 0.05],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 5 }}
          className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[120px]"
        />

        {/* 3D Floating particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-violet-400/30"
              style={{
                left: `${15 + i * 15}%`,
                top: `${20 + i * 10}%`,
              }}
              animate={{
                y: [0, -30, 0],
                opacity: [0.2, 0.5, 0.2],
                scale: [1, 1.5, 1],
              }}
              transition={{
                duration: 4 + i,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.5,
              }}
            />
          ))}
        </div>
      </div>

      <Sidebar
        currentView={view === 'episodes' ? 'tv' : view}
        setView={(v) => { setView(v); setSelectedShow(null); setSearchQuery(''); setHomeSearchQuery(''); setHomeSearchResults([]); }}
        onOpenSettings={() => setSettingsOpen(true)}
        onScan={handleScan}
        theme={theme}
        toggleTheme={toggleTheme}
        className="flex-shrink-0 z-20"
      />

      <main className="flex-1 flex flex-col min-w-0 relative z-10 bg-transparent">
        {/* Top Bar with Glassmorphism */}
        <div className="p-8 pb-4 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              key={view}
              className="text-4xl font-bold capitalize tracking-tighter text-white drop-shadow-lg"
            >
              {view === 'episodes' ? 'Episodes' : (view === 'tv' ? 'TV Shows' : (view === 'history' ? 'Watch History' : (view === 'stream' ? 'Stream' : (view === 'home' ? 'Home' : 'Movies'))))}
            </motion.h1>
            {isScanning && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20 backdrop-blur-md border border-primary/20 text-primary text-sm shadow-[0_0_15px_rgba(var(--primary),0.3)]"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                {scanProgress ? (
                  <span>Scanning: {scanProgress.current}/{scanProgress.total}</span>
                ) : (
                  <span>Starting scan...</span>
                )}
              </motion.div>
            )}
          </div>

          {view === 'history' ? (
            <div className="flex items-center gap-4">
              {/* History Tabs */}
              <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
                <button
                  onClick={() => setHistoryTab('local')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${historyTab === 'local'
                    ? 'bg-primary text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <Film className="h-4 w-4" />
                  Local ({items.length})
                </button>
                <button
                  onClick={() => setHistoryTab('streaming')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${historyTab === 'streaming'
                    ? 'bg-primary text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <Tv className="h-4 w-4" />
                  Streaming ({streamingHistoryItems.length})
                </button>
              </div>

              {/* Clear Button - context-aware */}
              {((historyTab === 'local' && items.length > 0) || (historyTab === 'streaming' && streamingHistoryItems.length > 0)) && (
                <motion.button
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={historyTab === 'local' ? handleClearAllHistory : handleClearAllStreamingHistory}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/60 hover:text-white transition-all backdrop-blur-md group"
                >
                  <Trash2 className="h-4 w-4 group-hover:text-primary transition-colors" />
                  <span className="text-sm font-medium">Clear All</span>
                </motion.button>
              )}
            </div>
          ) : view !== 'episodes' && view !== 'stream' && view !== 'home' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="relative w-96 group"
            >
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search library..."
                className="pl-11 h-12 rounded-2xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-primary/50 focus-visible:bg-black/40 transition-all shadow-inner"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </motion.div>
          )}
        </div>

        <ScrollArea className="flex-1 p-8 pt-2">
          <AnimatePresence mode='wait'>
            {view === 'episodes' && selectedShow ? (
              <motion.div
                key="episodes"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <EpisodeBrowser show={selectedShow} onBack={() => { setView('tv'); setSelectedShow(null); }} />
              </motion.div>
            ) : view === 'stream' ? (
              <motion.div
                key="stream"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <StreamView />
              </motion.div>
            ) : view === 'home' ? (
              <motion.div
                key="home"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col items-center"
              >
                {/* Home Search Section */}
                <div className="w-full max-w-2xl mx-auto mt-8 mb-12">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-center mb-8"
                  >
                    <h2 className="text-2xl font-light text-white/70 mb-2">Search Your Library</h2>
                    <p className="text-sm text-white/40">Find movies and TV shows in your collection</p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="relative group"
                  >
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30 group-focus-within:text-primary transition-colors" />
                    <Input
                      placeholder="Search movies and TV shows..."
                      className="pl-14 pr-14 h-14 rounded-2xl bg-white/5 border-white/10 text-white text-lg placeholder:text-white/30 focus-visible:ring-primary/50 focus-visible:bg-black/40 transition-all shadow-inner"
                      value={homeSearchQuery}
                      onChange={(e) => setHomeSearchQuery(e.target.value)}
                      autoFocus
                    />
                    {isHomeSearching && (
                      <div className="absolute right-5 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                  </motion.div>
                </div>

                {/* Search Results */}
                {homeSearchResults.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full"
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <h3 className="text-lg font-semibold text-white">
                        Results ({homeSearchResults.length})
                      </h3>
                      <div className="flex gap-2">
                        <span className="px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300 text-xs font-medium">
                          {homeSearchResults.filter(i => i.media_type === 'movie').length} Movies
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-medium">
                          {homeSearchResults.filter(i => i.media_type === 'tvshow').length} TV Shows
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-8 pb-32">
                      {homeSearchResults.map((item, index) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                        >
                          <MovieCard
                            item={item}
                            onClick={handleItemClick}
                            onFixMatch={handleFixMatch}
                            onRemoveFromHistory={undefined}
                            onDelete={handleDelete}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Empty State when no search yet */}
                {homeSearchResults.length === 0 && !isHomeSearching && homeSearchQuery === '' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                  >
                    <div className="p-8 rounded-full bg-white/5 border border-white/5 ring-1 ring-white/10 mb-6">
                      <Search className="h-16 w-16 opacity-20 text-white" />
                    </div>
                    <p className="text-xl font-light text-white/40 mb-2">Type to search your library</p>
                    <p className="text-sm text-white/30">Press Enter or click Search to find results</p>
                  </motion.div>
                )}

                {/* No results found */}
                {homeSearchResults.length === 0 && !isHomeSearching && homeSearchQuery !== '' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                  >
                    <div className="p-8 rounded-full bg-white/5 border border-white/5 ring-1 ring-white/10 mb-6">
                      <Search className="h-16 w-16 opacity-20 text-white" />
                    </div>
                    <p className="text-xl font-light text-white/40 mb-2">No results found</p>
                    <p className="text-sm text-white/30">Try a different search term or scan your library</p>
                  </motion.div>
                )}
              </motion.div>
            ) : view === 'history' ? (
              <motion.div
                key={`history-${historyTab}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {historyTab === 'local' ? (
                  // Local history - use MovieCard
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-8 pb-32">
                    {items.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <MovieCard
                          item={item}
                          onClick={handleItemClick}
                          onFixMatch={handleFixMatch}
                          onRemoveFromHistory={handleRemoveFromHistory}
                          onDelete={handleDelete}
                        />
                      </motion.div>
                    ))}
                    {items.length === 0 && (
                      <div className="col-span-full flex flex-col items-center justify-center py-32 text-muted-foreground space-y-4">
                        <div className="p-8 rounded-full bg-white/5 border border-white/5 ring-1 ring-white/10">
                          <Film className="h-16 w-16 opacity-30" />
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-light text-white/50">No local watch history</p>
                          <p className="text-sm opacity-50">Start watching content from your library to see it here.</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // Streaming history - custom cards for Videasy content
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-8 pb-32">
                    {streamingHistoryItems.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="group relative bg-white/5 rounded-2xl overflow-hidden border border-white/10 hover:border-primary/50 transition-all cursor-pointer"
                        onClick={() => handleStreamingItemClick(item)}
                      >
                        {/* Poster */}
                        <div className="aspect-[2/3] relative overflow-hidden">
                          {item.poster_path ? (
                            <img
                              src={item.poster_path}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-900/20">
                              <Tv className="h-16 w-16 text-white/30" />
                            </div>
                          )}

                          {/* Progress Bar */}
                          {item.progress_percent > 0 && item.progress_percent < 95 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${Math.min(item.progress_percent, 100)}%` }}
                              />
                            </div>
                          )}

                          {/* Resume Badge */}
                          {item.progress_percent > 0 && item.progress_percent < 95 && (
                            <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-primary/90 text-white text-xs font-medium">
                              {Math.round(item.progress_percent)}%
                            </div>
                          )}

                          {/* Play overlay on hover */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="p-4 rounded-full bg-primary/90 text-white">
                              <Play className="h-8 w-8 fill-current" />
                            </div>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-4">
                          <h3 className="font-semibold text-white truncate">{item.title}</h3>
                          {item.media_type === 'tv' && item.season && item.episode && (
                            <p className="text-sm text-white/60 mt-1">
                              Season {item.season}, Episode {item.episode}
                            </p>
                          )}
                          <p className="text-xs text-white/40 mt-2">
                            {new Date(item.last_watched).toLocaleDateString()}
                          </p>
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveFromStreamingHistory(item)
                          }}
                          className="absolute top-2 left-2 p-2 rounded-full bg-black/60 text-white/60 hover:text-red-400 hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-all"
                          title="Remove from history"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))}
                    {streamingHistoryItems.length === 0 && (
                      <div className="col-span-full flex flex-col items-center justify-center py-32 text-muted-foreground space-y-4">
                        <div className="p-8 rounded-full bg-white/5 border border-white/5 ring-1 ring-white/10">
                          <Tv className="h-16 w-16 opacity-30" />
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-light text-white/50">No streaming history</p>
                          <p className="text-sm opacity-50">Stream content from the Stream tab to see it here.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="grid"
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-8 pb-32"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <MovieCard
                      item={item}
                      onClick={handleItemClick}
                      onFixMatch={handleFixMatch}
                      onRemoveFromHistory={undefined}
                      onDelete={handleDelete}
                    />
                  </motion.div>
                ))}
                {items.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-32 text-muted-foreground space-y-4">
                    <div className="p-8 rounded-full bg-white/5 border border-white/5 ring-1 ring-white/10">
                      <Search className="h-16 w-16 opacity-30" />
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-light text-white/50">No items found</p>
                      <p className="text-sm opacity-50">Try adjusting your search or scan your library.</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </ScrollArea>
      </main>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <FixMatchModal
        open={fixMatchOpen}
        onOpenChange={setFixMatchOpen}
        item={itemToFix}
        onSuccess={fetchData}
      />
      <PlayerModal
        open={playerModalOpen}
        onOpenChange={setPlayerModalOpen}
        onSelectPlayer={handlePlayerSelect}
        title={pendingPlayItem?.title || ''}
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

      {/* Resume Dialog for local files */}
      {resumeDialogData && (
        <ResumeDialog
          open={resumeDialogOpen}
          onOpenChange={setResumeDialogOpen}
          title={resumeDialogData.item.title}
          mediaType={resumeDialogData.item.media_type}
          seasonEpisode={
            resumeDialogData.item.season_number !== undefined && resumeDialogData.item.episode_number !== undefined
              ? `S${String(resumeDialogData.item.season_number).padStart(2, '0')}E${String(resumeDialogData.item.episode_number).padStart(2, '0')}`
              : undefined
          }
          currentPosition={resumeDialogData.resumeInfo.position}
          duration={resumeDialogData.resumeInfo.duration}
          posterUrl={resumeDialogData.posterUrl}
          onResume={() => handleResumeChoice(true)}
          onStartOver={() => handleResumeChoice(false)}
        />
      )}

      {/* Resume Dialog for streaming content */}
      {streamingResumeData && (
        <ResumeDialog
          open={streamingResumeDialogOpen}
          onOpenChange={(open) => {
            setStreamingResumeDialogOpen(open)
            if (!open) setStreamingResumeData(null)
          }}
          title={streamingResumeData.title}
          mediaType={streamingResumeData.media_type === 'movie' ? 'movie' : 'tvepisode'}
          seasonEpisode={
            streamingResumeData.media_type === 'tv' && streamingResumeData.season && streamingResumeData.episode
              ? `S${String(streamingResumeData.season).padStart(2, '0')}E${String(streamingResumeData.episode).padStart(2, '0')}`
              : undefined
          }
          currentPosition={streamingResumeData.resume_position_seconds}
          duration={streamingResumeData.duration_seconds}
          posterUrl={streamingResumeData.poster_path || undefined}
          onResume={() => handleStreamingResumeChoice(true)}
          onStartOver={() => handleStreamingResumeChoice(false)}
          isStreaming={true}
        />
      )}

      {/* Delete Episodes Modal for TV Shows */}
      {deleteModalData && (
        <DeleteEpisodesModal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false)
            setDeleteModalData(null)
          }}
          seriesId={deleteModalData.seriesId}
          seriesTitle={deleteModalData.seriesTitle}
          onDeleteComplete={handleDeleteComplete}
        />
      )}

      <Toaster />
    </div>
  )
}

export default App
