import { useState, useCallback } from 'react';
import { Search, Film, Tv, Loader2, Play, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/shell';
import { EpisodeSelector } from './EpisodeSelector';
import { useToast } from './ui/use-toast';
import { saveStreamingProgress } from '@/services/api';

// Videasy player base URL - opens directly in browser
const VIDEASY_PLAYER_BASE = 'https://player.videasy.net';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const SLASSHY_COLOR = '8B5CF6'; // Slasshy brand purple

// Build Videasy player URL with all features
// IMPORTANT: Videasy requires parameters in a specific order to work correctly
function buildVideasyUrl(
    mediaType: 'movie' | 'tv',
    tmdbId: number,
    season?: number,
    episode?: number
): string {
    let baseUrl: string;
    let queryString: string;

    if (mediaType === 'movie') {
        baseUrl = `${VIDEASY_PLAYER_BASE}/movie/${tmdbId}`;
        // Movie params: overlay first, then color
        queryString = `overlay=true&color=${SLASSHY_COLOR}`;
    } else {
        const s = season || 1;
        const ep = episode || 1;
        baseUrl = `${VIDEASY_PLAYER_BASE}/tv/${tmdbId}/${s}/${ep}`;
        // TV params in required order: nextEpisode, autoplayNextEpisode, episodeSelector, overlay, color
        queryString = `nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=${SLASSHY_COLOR}`;
    }

    return `${baseUrl}?${queryString}`;
}

interface TmdbSearchResult {
    id: number;
    title?: string;
    name?: string;
    media_type: 'movie' | 'tv';
    poster_path?: string;
    backdrop_path?: string;
    overview?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
}

interface TmdbSearchResponse {
    results: TmdbSearchResult[];
    total_results: number;
}

export function StreamView() {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<TmdbSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedItem, setSelectedItem] = useState<TmdbSearchResult | null>(null);
    const [isEpisodeSelectorOpen, setIsEpisodeSelectorOpen] = useState(false);
    const { toast } = useToast();

    // Open streaming URL in the default browser and save to history
    const openInBrowser = useCallback(async (
        url: string,
        title: string,
        tmdbId: string,
        mediaType: 'movie' | 'tv',
        posterPath?: string,
        season?: number,
        episode?: number
    ) => {
        try {
            // Save to streaming history
            await saveStreamingProgress(
                tmdbId,
                mediaType,
                title,
                posterPath ? `${TMDB_IMAGE_BASE}/w342${posterPath}` : undefined,
                season,
                episode,
                0, // position
                0  // duration (will be updated by player)
            );

            await open(url);
            toast({
                title: "Opening in Browser",
                description: `Streaming "${title}" in your default browser`,
            });
        } catch (error) {
            console.error('Failed to open browser:', error);
            toast({
                title: "Failed to Open Browser",
                description: "Could not open the streaming URL in your browser",
                variant: "destructive"
            });
        }
    }, [toast]);

    // Handle Enter key to trigger search
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchQuery.trim()) {
            e.preventDefault();
            searchTmdb(searchQuery);
        }
    };

    // Handle search button click
    const handleSearchClick = () => {
        if (searchQuery.trim()) {
            searchTmdb(searchQuery);
        }
    };

    const searchTmdb = async (query: string) => {
        setIsSearching(true);
        try {
            // Use the backend to search TMDB (it has the API key)
            const response = await invoke<TmdbSearchResponse>('search_tmdb', { query });
            setResults(response.results.filter((r: TmdbSearchResult) => r.media_type === 'movie' || r.media_type === 'tv'));
        } catch (error: any) {
            console.error('TMDB search failed:', error);
            const errorMessage = typeof error === 'string' ? error : (error?.message || 'Unknown error');
            toast({
                title: "Search Failed",
                description: errorMessage.includes('API key')
                    ? "TMDB API key not configured. Please add it in Settings."
                    : `Search error: ${errorMessage}`,
                variant: "destructive"
            });
        } finally {
            setIsSearching(false);
        }
    };

    const handlePlayClick = useCallback((item: TmdbSearchResult) => {
        setSelectedItem(item);

        if (item.media_type === 'tv') {
            // For TV shows, open the episode selector first
            setIsEpisodeSelectorOpen(true);
        } else {
            // For movies, open directly in Videasy player with all features
            const title = item.title || item.name || 'Unknown';
            const url = buildVideasyUrl('movie', item.id);
            openInBrowser(url, title, item.id.toString(), 'movie', item.poster_path);
        }
    }, [openInBrowser]);

    const handleEpisodeSelect = useCallback((season: number, episode: number) => {
        if (selectedItem) {
            // Open TV show episode directly in Videasy player with all features
            const title = selectedItem.name || selectedItem.title || 'Unknown';
            const displayTitle = `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
            const url = buildVideasyUrl('tv', selectedItem.id, season, episode);
            openInBrowser(url, displayTitle, selectedItem.id.toString(), 'tv', selectedItem.poster_path, season, episode);
        }
        setIsEpisodeSelectorOpen(false);
        setSelectedItem(null);
    }, [selectedItem, openInBrowser]);

    const handleEpisodeSelectorClose = useCallback(() => {
        setIsEpisodeSelectorOpen(false);
        setSelectedItem(null);
    }, []);

    const getTitle = (item: TmdbSearchResult) => item.title || item.name || 'Unknown';
    const getYear = (item: TmdbSearchResult) => {
        const date = item.release_date || item.first_air_date;
        return date ? new Date(date).getFullYear() : null;
    };

    return (
        <>
            <div className="h-full flex flex-col gap-6">
                {/* Header */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-[0_4px_20px_rgba(139,92,246,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]">
                            <Play className="h-6 w-6 text-white fill-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Stream Online</h1>
                            <p className="text-sm text-muted-foreground">Search and stream movies & TV shows instantly</p>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="relative max-w-2xl flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search for movies or TV shows... (Press Enter)"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full pl-12 pr-4 py-3 bg-[#0a0a1a]/70 border border-white/10 rounded-xl text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
                            />
                        </div>
                        <button
                            onClick={handleSearchClick}
                            disabled={!searchQuery.trim() || isSearching}
                            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-all flex items-center gap-2 shadow-[0_4px_16px_rgba(139,92,246,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_6px_24px_rgba(139,92,246,0.4)]"
                        >
                            {isSearching ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <Search className="h-5 w-5" />
                            )}
                            <span className="hidden sm:inline">Search</span>
                        </button>
                    </div>
                </div>

                {/* Results Grid */}
                <div className="flex-1 overflow-auto">
                    {!searchQuery && (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                            <div className="p-4 rounded-full bg-primary/10 mb-4">
                                <Search className="h-12 w-12 text-primary/50" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">Search for Content</h3>
                            <p className="text-sm text-muted-foreground max-w-md">
                                Enter a movie or TV show title above to search TMDB and start streaming via Videasy
                            </p>
                        </div>
                    )}

                    {searchQuery && results.length === 0 && !isSearching && (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                            <p className="text-muted-foreground">No results found for "{searchQuery}"</p>
                        </div>
                    )}

                    <AnimatePresence mode="popLayout">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {results.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ delay: index * 0.03 }}
                                    className="group relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer bg-gradient-to-b from-[#0f0d1a]/90 to-[#080610] border border-white/[0.06] hover:border-violet-500/40 transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_30px_rgba(139,92,246,0.15),0_20px_40px_rgba(0,0,0,0.4)]"
                                    onClick={() => handlePlayClick(item)}
                                >
                                    {/* Poster */}
                                    {item.poster_path ? (
                                        <img
                                            src={`${TMDB_IMAGE_BASE}/w342${item.poster_path}`}
                                            alt={getTitle(item)}
                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-secondary/50">
                                            {item.media_type === 'movie' ? (
                                                <Film className="h-12 w-12 text-muted-foreground/50" />
                                            ) : (
                                                <Tv className="h-12 w-12 text-muted-foreground/50" />
                                            )}
                                        </div>
                                    )}

                                    {/* Hover Overlay with matching colors */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a1a] via-[#0a0a1a]/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${item.media_type === 'movie'
                                                ? 'bg-blue-500/80 text-white'
                                                : 'bg-purple-500/80 text-white'
                                                }`}>
                                                {item.media_type}
                                            </div>
                                            {item.vote_average && item.vote_average > 0 && (
                                                <div className="flex items-center gap-1 text-xs text-yellow-400">
                                                    <Star className="h-3 w-3 fill-yellow-400" />
                                                    {item.vote_average.toFixed(1)}
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="text-sm font-semibold text-white line-clamp-2">{getTitle(item)}</h3>
                                        {getYear(item) && (
                                            <p className="text-xs text-white/70">{getYear(item)}</p>
                                        )}
                                    </div>

                                    {/* Play button on hover with 3D depth */}
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <div className="relative">
                                            <div className="absolute inset-0 rounded-full bg-violet-500/50 blur-xl scale-150" />
                                            <div className="absolute inset-0 rounded-full bg-black/50 translate-y-2 blur-lg scale-95" />
                                            <div className="relative p-4 rounded-full bg-gradient-to-br from-violet-400 via-violet-500 to-purple-600 shadow-[0_4px_20px_rgba(139,92,246,0.5),inset_0_1px_0_rgba(255,255,255,0.3)] transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                                <Play className="h-8 w-8 text-white fill-white drop-shadow-lg" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Media type badge (always visible) with 3D effect */}
                                    <div className="absolute top-2 right-2">
                                        <div className={`p-1.5 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.3)] ${item.media_type === 'movie'
                                            ? 'bg-gradient-to-br from-blue-400 to-blue-600'
                                            : 'bg-gradient-to-br from-violet-400 to-purple-600'
                                            }`}>
                                            {item.media_type === 'movie' ? (
                                                <Film className="h-3 w-3 text-white drop-shadow" />
                                            ) : (
                                                <Tv className="h-3 w-3 text-white drop-shadow" />
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Episode Selector for TV Shows */}
            {isEpisodeSelectorOpen && selectedItem && selectedItem.media_type === 'tv' && (
                <EpisodeSelector
                    tvId={selectedItem.id}
                    title={getTitle(selectedItem)}
                    posterPath={selectedItem.poster_path}
                    backdropPath={selectedItem.backdrop_path}
                    onSelect={handleEpisodeSelect}
                    onClose={handleEpisodeSelectorClose}
                />
            )}

        </>
    );
}
