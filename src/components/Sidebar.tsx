import { cn } from "@/lib/utils"
import { Play, Film, Tv, History, Settings, RefreshCw, Sun, Moon, MoreVertical, Globe, Sparkles, Home } from "lucide-react"
import { motion } from "framer-motion"
import { useState, useEffect } from "react"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  currentView: string
  setView: (view: string) => void
  onOpenSettings: () => void
  onScan: () => void
  theme: 'dark' | 'light'
  toggleTheme: () => void
}

export function Sidebar({
  className,
  currentView,
  setView,
  onOpenSettings,
  onScan,
  theme,
  toggleTheme
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Listen for window resize and collapse sidebar when window is small
  useEffect(() => {
    const handleResize = () => {
      // Collapse when window width is less than 900px
      setIsCollapsed(window.innerWidth < 900)
    }

    // Check initial size
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const menuItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'tv', label: 'TV Shows', icon: Tv },
    { id: 'stream', label: 'Stream', icon: Globe },
    { id: 'history', label: 'History', icon: History },
  ]

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1, width: isCollapsed ? 80 : 320 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "pb-12 h-screen flex flex-col relative overflow-hidden z-50",
        "bg-gradient-to-b from-[#0a0a1a]/95 via-[#050510]/95 to-[#030308]/95",
        "backdrop-blur-2xl border-r border-white/[0.08]",
        "shadow-[inset_0_0_80px_rgba(139,92,246,0.03)]",
        className
      )}
    >
      {/* Animated Glow Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            y: [0, -20, 0],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-20 -left-20 w-48 h-48 bg-gradient-to-br from-violet-600/20 to-transparent rounded-full blur-[80px]"
        />
        <motion.div
          animate={{
            y: [0, 15, 0],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute top-1/2 -right-10 w-32 h-32 bg-gradient-to-bl from-cyan-500/15 to-transparent rounded-full blur-[60px]"
        />
        <motion.div
          animate={{
            y: [0, 10, 0],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 4 }}
          className="absolute -bottom-10 left-1/4 w-40 h-40 bg-gradient-to-t from-violet-500/10 to-transparent rounded-full blur-[70px]"
        />
      </div>

      {/* Top Section */}
      <div className={cn("space-y-4 py-8 relative z-10", isCollapsed ? "px-3" : "px-6")}>
        {/* Logo */}
        <div className={cn("mb-12 flex items-center", isCollapsed ? "justify-center" : "gap-4")}>
          <motion.div
            className="relative"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            {/* 3D Logo Container */}
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-cyan-500 p-[2px] shadow-lg shadow-violet-500/30">
              <div className="w-full h-full rounded-[14px] bg-gradient-to-br from-violet-600/90 to-purple-700/90 flex items-center justify-center backdrop-blur-sm">
                <Play className="w-5 h-5 text-white fill-white drop-shadow-lg" />
              </div>
              {/* Shine effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/30 via-transparent to-transparent opacity-60" />
            </div>
            {/* Glow */}
            <div className="absolute inset-0 rounded-2xl bg-violet-500 blur-xl opacity-40" />
          </motion.div>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-2xl font-bold tracking-wider bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
                SLASSHY
              </h2>
              <div className="flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-violet-400" />
                <p className="text-[10px] uppercase tracking-[0.25em] bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent font-bold">
                  Indexer V2
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Menu Items */}
        <div className="space-y-2">
          {menuItems.map((item, index) => {
            const isActive = currentView === item.id;
            const Icon = item.icon;

            return (
              <motion.button
                key={item.id}
                onClick={() => setView(item.id)}
                title={isCollapsed ? item.label : undefined}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 + 0.2 }}
                whileHover={{ x: isCollapsed ? 0 : 4 }}
                className={cn(
                  "group relative flex items-center w-full text-sm font-medium rounded-2xl transition-all duration-300 ease-out overflow-hidden",
                  isCollapsed ? "px-0 py-4 justify-center" : "px-5 py-4",
                  isActive
                    ? "text-white"
                    : "text-white/50 hover:text-white/90"
                )}
              >
                {/* Active state background with 3D effect */}
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* Glass background */}
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 via-purple-600/15 to-transparent rounded-2xl" />
                    {/* Left accent bar */}
                    <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-gradient-to-b from-violet-400 via-purple-500 to-cyan-400 shadow-lg shadow-violet-500/50" />
                    {/* Inner glow */}
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-transparent rounded-2xl" />
                  </motion.div>
                )}

                {/* Hover effect */}
                <div className="absolute inset-0 bg-white/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />

                {/* Icon */}
                <div className={cn(
                  "relative z-10 transition-all duration-300",
                  !isCollapsed && "mr-4"
                )}>
                  <Icon className={cn(
                    "h-5 w-5 transition-all duration-300 group-hover:scale-110",
                    isActive
                      ? "text-violet-300 drop-shadow-[0_0_12px_rgba(167,139,250,0.8)]"
                      : "group-hover:text-white/80"
                  )} />
                </div>

                {/* Label */}
                {!isCollapsed && (
                  <span className="z-10 tracking-wide font-medium">{item.label}</span>
                )}

                {/* Active indicator dot (collapsed mode) */}
                {isActive && isCollapsed && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-violet-400 shadow-lg shadow-violet-400/50"
                  />
                )}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Protips Section - Only show when expanded */}
      {!isCollapsed && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.3 }}
          className="px-6 py-4 mt-auto relative z-10"
        >
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent p-5 backdrop-blur-md">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-cyan-500/5 opacity-50" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3 text-xs font-bold text-violet-400 uppercase tracking-wider">
                <div className="p-1 rounded-lg bg-violet-500/20">
                  <MoreVertical className="w-3 h-3" />
                </div>
                <span>Protips</span>
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                Missing poster? Click <span className="text-violet-300 font-medium">options</span> on a card to fix metadata match.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Bottom Actions */}
      <div className={cn("py-6 space-y-3 relative z-10", isCollapsed ? "px-3" : "px-6")}>
        {/* Scan Button with enhanced 3D */}
        <motion.button
          onClick={onScan}
          title={isCollapsed ? "Scan System" : undefined}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          className={cn(
            "relative group w-full flex items-center justify-center rounded-2xl overflow-hidden transition-all duration-300",
            "bg-gradient-to-r from-violet-600/25 via-purple-600/20 to-violet-600/25",
            "border border-violet-500/40 hover:border-violet-400/60",
            "shadow-[0_4px_16px_rgba(139,92,246,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] hover:shadow-[0_8px_24px_rgba(139,92,246,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]",
            isCollapsed ? "px-2 py-4" : "px-5 py-4"
          )}
        >
          {/* Hover gradient sweep */}
          <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-violet-600/30 via-purple-500/20 to-cyan-500/20 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500 ease-out" />

          <RefreshCw className={cn(
            "h-4 w-4 text-violet-300 group-hover:rotate-180 transition-transform duration-700 relative z-10",
            !isCollapsed && "mr-3"
          )} />
          {!isCollapsed && (
            <span className="text-sm font-semibold tracking-wide text-violet-200 relative z-10">
              SCAN SYSTEM
            </span>
          )}
        </motion.button>

        {/* Settings and Theme buttons */}
        <div className={cn(isCollapsed ? "flex flex-col gap-2" : "grid grid-cols-2 gap-2")}>
          <motion.button
            onClick={onOpenSettings}
            title="Settings"
            whileHover={{ scale: 1.05, y: -3 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center justify-center p-3 rounded-xl bg-[#0a0a1a]/60 hover:bg-[#0a0a1a]/80 text-white/40 hover:text-white/90 transition-all duration-300 border border-white/[0.08] hover:border-violet-500/30 shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.03)] hover:shadow-[0_4px_16px_rgba(139,92,246,0.15)]"
          >
            <Settings className="h-4 w-4" />
          </motion.button>
          <motion.button
            onClick={toggleTheme}
            title="Toggle Theme"
            whileHover={{ scale: 1.05, y: -3 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center justify-center p-3 rounded-xl bg-[#0a0a1a]/60 hover:bg-[#0a0a1a]/80 text-white/40 hover:text-white/90 transition-all duration-300 border border-white/[0.08] hover:border-violet-500/30 shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.03)] hover:shadow-[0_4px_16px_rgba(139,92,246,0.15)]"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}