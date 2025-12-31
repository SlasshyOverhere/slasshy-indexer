import { useState, useEffect, useRef } from "react"
import { PlayCircle, MoreVertical, Edit, X, Trash2, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCachedImageUrl, MediaItem } from "@/services/api"
import { motion } from "framer-motion"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator
} from "@/components/ui/context-menu"


interface MovieCardProps {
    item: MediaItem
    onClick: (item: MediaItem) => void
    onFixMatch: (item: MediaItem) => void
    onRemoveFromHistory?: (item: MediaItem) => void
    onDelete?: (item: MediaItem) => void
    aspectRatio?: "portrait" | "square"
    width?: number
    height?: number
    className?: string
}

export function MovieCard({
    item,
    onClick,
    onFixMatch,
    onRemoveFromHistory,
    onDelete,
    aspectRatio = "portrait",
    width: _width,
    height: _height,
    className,
}: MovieCardProps) {
    const [posterUrl, setPosterUrl] = useState<string | null>(null)
    const [isHovered, setIsHovered] = useState(false)
    const [tiltStyle, setTiltStyle] = useState({ transform: '', filter: '' })
    const cardRef = useRef<HTMLDivElement>(null)

    const progress = item.progress_percent || (item.resume_position_seconds && item.duration_seconds ? (item.resume_position_seconds / item.duration_seconds) * 100 : 0);
    const isFinished = progress >= 95;

    useEffect(() => {
        const loadPoster = async () => {
            if (item.poster_path) {
                // Extract just the filename
                const filename = item.poster_path.replace('image_cache/', '');
                const url = await getCachedImageUrl(filename);
                if (url) {
                    setPosterUrl(url);
                }
            }
        };
        loadPoster();
    }, [item.poster_path]);

    // 3D Tilt effect
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = (y - centerY) / 20;
        const rotateY = (centerX - x) / 20;

        setTiltStyle({
            transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`,
            filter: `brightness(1.05)`
        });
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        setTiltStyle({ transform: '', filter: '' });
    };

    const imageSrc = posterUrl || `https://placehold.co/500x750/111827/4b5563?text=${encodeURIComponent(item.title)}`;

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <motion.div
                    ref={cardRef}
                    className={cn("group relative cursor-pointer", className)}
                    onClick={() => onClick(item)}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    style={isHovered ? tiltStyle : {}}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                    {/* Main Card Container with 3D border glow */}
                    <div className={cn(
                        "relative overflow-hidden rounded-2xl transition-all duration-500",
                        "bg-gradient-to-b from-[#0f0d1a]/90 to-[#080610]/95",
                        "border border-white/[0.08]",
                        "shadow-[0_4px_20px_rgba(0,0,0,0.4)]",
                        isHovered && "border-violet-500/40 shadow-[0_0_30px_rgba(139,92,246,0.2),0_0_60px_rgba(139,92,246,0.08),0_20px_40px_rgba(0,0,0,0.5)]"
                    )}>
                        {/* Gradient border effect on hover */}
                        {isHovered && (
                            <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-violet-500/30 via-purple-500/20 to-cyan-500/30 -z-10" />
                        )}

                        {/* Poster Image Container */}
                        <div className={cn("relative overflow-hidden", aspectRatio === "portrait" ? "aspect-[2/3]" : "aspect-square")}>
                            <img
                                src={imageSrc}
                                alt={item.title}
                                loading="lazy"
                                className={cn(
                                    "h-full w-full object-cover transition-all duration-700 will-change-transform",
                                    isHovered ? "scale-110 saturate-110" : "scale-100 saturate-100"
                                )}
                            />

                            {/* Multi-layer gradient overlay with depth */}
                            <div className={cn(
                                "absolute inset-0 transition-all duration-500",
                                isHovered
                                    ? "bg-gradient-to-t from-[#0a0a1a] via-[#0a0a1a]/70 to-transparent opacity-95"
                                    : "bg-gradient-to-t from-[#0a0a1a]/90 via-[#0a0a1a]/40 to-transparent opacity-80"
                            )} />

                            {/* Subtle vignette with depth */}
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,5,16,0.4)_100%)]" />

                            {/* Play Button with 3D effect */}
                            <div className={cn(
                                "absolute inset-0 flex items-center justify-center transition-all duration-500",
                                isHovered ? "opacity-100 scale-100" : "opacity-0 scale-50"
                            )}>
                                <motion.div
                                    className="relative"
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    {/* Outer glow ring */}
                                    <div className="absolute inset-0 rounded-full bg-violet-500/50 blur-xl scale-150" />
                                    {/* 3D Base shadow */}
                                    <div className="absolute inset-0 rounded-full bg-black/50 translate-y-2 blur-lg scale-95" />
                                    {/* Play button with 3D depth */}
                                    <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-violet-400 via-violet-500 to-purple-600 flex items-center justify-center shadow-[0_4px_20px_rgba(139,92,246,0.5),inset_0_1px_0_rgba(255,255,255,0.3)]">
                                        <Play className="w-7 h-7 text-white fill-white ml-1 drop-shadow-lg" />
                                        {/* Shine effect */}
                                        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 via-transparent to-transparent" />
                                    </div>
                                </motion.div>
                            </div>

                            {/* Resume progress badge */}
                            {progress > 0 && !isFinished && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10"
                                >
                                    <span className="text-xs font-semibold text-white">{Math.round(progress)}%</span>
                                </motion.div>
                            )}

                            {/* Finished badge */}
                            {isFinished && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/80 to-green-600/80 backdrop-blur-md"
                                >
                                    <span className="text-xs font-semibold text-white">✓ Watched</span>
                                </motion.div>
                            )}
                        </div>

                        {/* Progress Bar - 3D glowing effect */}
                        {progress > 0 && !isFinished && (
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40 backdrop-blur-sm">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-400 relative"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 1.2, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
                                >
                                    {/* Glow effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-400 blur-sm opacity-80" />
                                    {/* Shine animation */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
                                </motion.div>
                            </div>
                        )}

                        {/* Options Button - Floating 3D */}
                        <motion.button
                            onClick={(e) => { e.stopPropagation(); onFixMatch(item); }}
                            className={cn(
                                "absolute top-3 right-3 p-2.5 rounded-xl transition-all duration-300",
                                "bg-black/40 backdrop-blur-md text-white/70",
                                "border border-white/10 hover:border-violet-500/50",
                                "hover:bg-violet-500/80 hover:text-white",
                                "shadow-lg"
                            )}
                            title="Fix Match / Edit Metadata"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: isHovered ? 1 : 0, scale: isHovered ? 1 : 0.8 }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <MoreVertical className="w-4 h-4" />
                        </motion.button>

                    </div>

                    {/* Metadata Below Card */}
                    <div className="mt-4 space-y-1.5 z-20 relative px-1">
                        <h3 className={cn(
                            "font-semibold leading-tight truncate transition-all duration-300",
                            isHovered
                                ? "text-transparent bg-gradient-to-r from-white via-violet-200 to-white bg-clip-text"
                                : "text-white/90"
                        )}>
                            {item.title}
                        </h3>
                        <div className="flex items-center justify-between text-xs font-medium">
                            <span className="text-white/40">
                                {item.year || (item.season_number && item.episode_number ? `S${String(item.season_number).padStart(2, '0')}E${String(item.episode_number).padStart(2, '0')}` : 'Unknown')}
                            </span>
                            {isHovered && (
                                <motion.span
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="text-violet-400 font-semibold flex items-center gap-1"
                                >
                                    <Play className="w-3 h-3 fill-violet-400" />
                                    Play
                                </motion.span>
                            )}
                        </div>
                    </div>
                </motion.div>
            </ContextMenuTrigger>
            <ContextMenuContent className="bg-[#0c0a1a]/95 backdrop-blur-xl border-white/10 text-white rounded-xl min-w-[180px]">
                <ContextMenuItem onClick={() => onClick(item)} className="focus:bg-violet-500/20 focus:text-violet-200 cursor-pointer rounded-lg">
                    <PlayCircle className="mr-2 h-4 w-4" /> Play
                </ContextMenuItem>
                <ContextMenuSeparator className="bg-white/10" />
                <ContextMenuItem onClick={() => onFixMatch(item)} className="focus:bg-violet-500/20 focus:text-violet-200 cursor-pointer rounded-lg">
                    <Edit className="mr-2 h-4 w-4" /> Fix Match...
                </ContextMenuItem>
                {/* Remove from History option - only shown when callback is provided */}
                {onRemoveFromHistory && (
                    <>
                        <ContextMenuSeparator className="bg-white/10" />
                        <ContextMenuItem
                            onClick={() => onRemoveFromHistory(item)}
                            className="focus:bg-white/10 focus:text-white/80 cursor-pointer rounded-lg text-white/60"
                        >
                            <X className="mr-2 h-4 w-4" /> Remove from History
                        </ContextMenuItem>
                    </>
                )}
                {/* Delete from drive option */}
                {onDelete && (
                    <>
                        <ContextMenuSeparator className="bg-white/10" />
                        <ContextMenuItem
                            onClick={() => onDelete(item)}
                            className="focus:bg-red-500/20 focus:text-red-400 cursor-pointer rounded-lg text-red-400"
                        >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete from Drive
                        </ContextMenuItem>
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    )
}

