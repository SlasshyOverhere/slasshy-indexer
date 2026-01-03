import { useState, useEffect } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Plus, Trash2, MonitorPlay, FolderOpen,
  AlertTriangle, Settings, Film, Key, Zap, Power, X, Save, RefreshCw, Sparkles, Eye, Cloud, Wrench, HardDrive
} from "lucide-react"
import {
  Config, getConfig, saveConfig, scanLibrary, clearAllAppData, cleanupMissingMetadata, repairFilePaths,
  getCloudCacheInfo, clearCloudCache, CloudCacheInfo, TabVisibility
} from "@/services/api"
import { useToast } from "@/components/ui/use-toast"
import { open as openDialog } from '@tauri-apps/api/dialog'
import { invoke } from '@tauri-apps/api/tauri'
import { Switch } from "@/components/ui/switch"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { GoogleDriveSettings } from "@/components/GoogleDriveSettings"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestartOnboarding?: () => void
  initialTab?: SettingsSection
  tabVisibility?: TabVisibility
  onTabVisibilityChange?: (visibility: TabVisibility) => void
}

type SettingsSection = 'general' | 'library' | 'cloud' | 'player' | 'api' | 'danger'

export function SettingsModal({ open, onOpenChange, onRestartOnboarding, initialTab, tabVisibility, onTabVisibilityChange }: SettingsModalProps) {
  const [config, setConfig] = useState<Config>({
    mpv_path: "",
    vlc_path: "",
    ffprobe_path: "",
    ffmpeg_path: "",
    media_folders: [],
    tmdb_api_key: "",
    file_watcher_enabled: true,
    cloud_cache_enabled: false,
    cloud_cache_dir: "",
    cloud_cache_max_mb: 1024,
    cloud_cache_expiry_hours: 24
  })
  const [loading, setLoading] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [cacheInfo, setCacheInfo] = useState<CloudCacheInfo | null>(null)
  const [clearingCache, setClearingCache] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      loadConfig()
      checkAutoStart()
      loadCacheInfo()
      setActiveSection(initialTab || 'general')
      setShowResetConfirm(false)
    }
  }, [open, initialTab])

  const loadCacheInfo = async () => {
    try {
      const info = await getCloudCacheInfo()
      setCacheInfo(info)
    } catch (error) {
      console.error("Failed to load cache info", error)
    }
  }

  const checkAutoStart = async () => {
    try {
      const enabled = await invoke<boolean>('plugin:autostart|is_enabled')
      setAutoStart(enabled)
    } catch (error) {
      console.error("Failed to check autostart", error)
    }
  }

  const toggleAutoStart = async (checked: boolean) => {
    try {
      if (checked) {
        await invoke('plugin:autostart|enable')
        toast({ title: "Auto Startup Enabled", description: "Slasshy will now start automatically." })
      } else {
        await invoke('plugin:autostart|disable')
        toast({ title: "Auto Startup Disabled", description: "Slasshy will not start automatically." })
      }
      setAutoStart(checked)
    } catch (error) {
      console.error("Failed to toggle autostart", error)
      toast({ title: "Error", description: "Failed to update startup settings", variant: "destructive" })
    }
  }

  const loadConfig = async () => {
    try {
      const data = await getConfig()
      setConfig({
        mpv_path: data.mpv_path || "",
        vlc_path: data.vlc_path || "",
        ffprobe_path: data.ffprobe_path || "",
        ffmpeg_path: data.ffmpeg_path || "",
        media_folders: data.media_folders || [],
        tmdb_api_key: data.tmdb_api_key || "",
        file_watcher_enabled: data.file_watcher_enabled ?? true,
        cloud_cache_enabled: data.cloud_cache_enabled ?? false,
        cloud_cache_dir: data.cloud_cache_dir || "",
        cloud_cache_max_mb: data.cloud_cache_max_mb ?? 1024,
        cloud_cache_expiry_hours: data.cloud_cache_expiry_hours ?? 24
      })
    } catch (error) {
      console.error("Failed to load config", error)
      toast({ title: "Error", description: "Failed to load configuration", variant: "destructive" })
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      await saveConfig(config)
      toast({ title: "Success", description: "Settings saved successfully" })
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to save config", error)
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleScan = async () => {
    try {
      await scanLibrary()
      toast({ title: "Scan Started", description: "Library scan has been initiated in the background." })
    } catch (error) {
      toast({ title: "Error", description: "Failed to start scan", variant: "destructive" })
    }
  }

  const handleResetApp = async () => {
    setResetting(true)
    try {
      await clearAllAppData()
      toast({
        title: "App Reset Complete",
        description: "All data has been cleared. The app is now like new."
      })
      setShowResetConfirm(false)
      onOpenChange(false)
      window.location.reload()
    } catch (error) {
      console.error("Failed to reset app", error)
      toast({
        title: "Error",
        description: "Failed to reset app data",
        variant: "destructive"
      })
    } finally {
      setResetting(false)
    }
  }

  const handleCleanupMissing = async () => {
    setCleaningUp(true)
    try {
      const result = await cleanupMissingMetadata()
      toast({
        title: "Cleanup Complete",
        description: result.message
      })
      if (result.removed_count > 0) {
        window.location.reload()
      }
    } catch (error) {
      console.error("Failed to cleanup missing metadata", error)
      toast({
        title: "Error",
        description: "Failed to cleanup missing metadata",
        variant: "destructive"
      })
    } finally {
      setCleaningUp(false)
    }
  }

  const handleRepairFilePaths = async () => {
    setRepairing(true)
    try {
      const result = await repairFilePaths()
      toast({
        title: "Repair Complete",
        description: result.message
      })
    } catch (error) {
      console.error("Failed to repair file paths", error)
      toast({
        title: "Error",
        description: String(error) || "Failed to repair file paths",
        variant: "destructive"
      })
    } finally {
      setRepairing(false)
    }
  }

  const addFolder = () => {
    setConfig({ ...config, media_folders: [...config.media_folders, ""] })
  }

  const removeFolder = (index: number) => {
    const newFolders = [...config.media_folders]
    newFolders.splice(index, 1)
    setConfig({ ...config, media_folders: newFolders })
  }

  const updateFolder = (index: number, value: string) => {
    const newFolders = [...config.media_folders]
    newFolders[index] = value
    setConfig({ ...config, media_folders: newFolders })
  }

  const browseFolder = async (index: number) => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select Media Folder'
      })
      if (selected && typeof selected === 'string') {
        updateFolder(index, selected)
      }
    } catch (error) {
      console.error("Failed to open folder dialog", error)
    }
  }

  const browseMpvPath = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Executable', extensions: ['exe'] }],
        title: 'Select MPV Executable'
      })
      if (selected && typeof selected === 'string') {
        setConfig({ ...config, mpv_path: selected })
      }
    } catch (error) {
      console.error("Failed to open file dialog", error)
    }
  }

  const browseFfprobePath = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Executable', extensions: ['exe'] }],
        title: 'Select FFprobe Executable'
      })
      if (selected && typeof selected === 'string') {
        setConfig({ ...config, ffprobe_path: selected })
      }
    } catch (error) {
      console.error("Failed to open file dialog", error)
    }
  }

  const browseCacheDir = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select Cache Directory'
      })
      if (selected && typeof selected === 'string') {
        setConfig({ ...config, cloud_cache_dir: selected })
      }
    } catch (error) {
      console.error("Failed to open folder dialog", error)
    }
  }

  const handleClearCache = async () => {
    setClearingCache(true)
    try {
      const result = await clearCloudCache()
      toast({ title: "Cache Cleared", description: result.message })
      loadCacheInfo()
    } catch (error) {
      console.error("Failed to clear cache", error)
      toast({ title: "Error", description: "Failed to clear cache", variant: "destructive" })
    } finally {
      setClearingCache(false)
    }
  }

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Settings className="w-4 h-4" /> },
    { id: 'library', label: 'Library', icon: <Film className="w-4 h-4" /> },
    { id: 'cloud', label: 'Cloud Storage', icon: <Cloud className="w-4 h-4" /> },
    { id: 'player', label: 'Player', icon: <MonitorPlay className="w-4 h-4" /> },
    { id: 'api', label: 'API Keys', icon: <Key className="w-4 h-4" /> },
    { id: 'danger', label: 'Advanced', icon: <AlertTriangle className="w-4 h-4" /> },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-w-4xl max-h-[85vh] p-0 gap-0 flex-col overflow-hidden">
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-40 sm:w-48 md:w-56 flex-shrink-0 bg-card/50 border-r border-border p-3 sm:p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Settings</h2>
              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl transition-all duration-200 text-left",
                    activeSection === section.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {section.icon}
                  <span className="text-xs sm:text-sm font-medium truncate">{section.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
              <AnimatePresence mode="wait">
                {/* General Section */}
                {activeSection === 'general' && (
                  <motion.div
                    key="general"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">General Settings</h3>
                      <p className="text-sm text-muted-foreground">Configure general app behavior</p>
                    </div>

                    {/* Auto Start */}
                    <div className="p-4 rounded-xl bg-card border border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Power className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <Label className="text-base font-medium">Run on Startup</Label>
                            <p className="text-sm text-muted-foreground">
                              Automatically start Slasshy when you log in
                            </p>
                          </div>
                        </div>
                        <Switch checked={autoStart} onCheckedChange={toggleAutoStart} />
                      </div>
                    </div>

                    {/* File Watcher Toggle */}
                    <div className="p-4 rounded-xl bg-card border border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-green-500/10">
                            <Eye className="w-5 h-5 text-green-500" />
                          </div>
                          <div>
                            <Label className="text-base font-medium">Auto-detect New Files</Label>
                            <p className="text-sm text-muted-foreground">
                              Automatically scan for new media files in your folders
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={config.file_watcher_enabled ?? true}
                          onCheckedChange={(checked) => setConfig({ ...config, file_watcher_enabled: checked })}
                        />
                      </div>
                    </div>

                    {/* Onboarding Overview */}
                    <div className="p-4 rounded-xl bg-card border border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-accent/10">
                            <Sparkles className="w-5 h-5 text-accent" />
                          </div>
                          <div>
                            <Label className="text-base font-medium">Onboarding Overview</Label>
                            <p className="text-sm text-muted-foreground">
                              Experience the full app introduction again
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onOpenChange(false)
                            onRestartOnboarding?.()
                          }}
                          className="gap-2"
                        >
                          <Sparkles className="w-4 h-4" />
                          Start Tour
                        </Button>
                      </div>
                    </div>

                    {/* Tab Visibility */}
                    <div className="p-4 rounded-xl bg-card border border-border space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-violet-500/10">
                          <Eye className="w-5 h-5 text-violet-500" />
                        </div>
                        <div>
                          <Label className="text-base font-medium">Navigation Tabs</Label>
                          <p className="text-sm text-muted-foreground">
                            Show or hide tabs in the sidebar
                          </p>
                        </div>
                      </div>

                      {/* Local Tab Toggle */}
                      <div className="flex items-center justify-between pl-12">
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-pink-500" />
                          <span className="text-sm font-medium">Local Library</span>
                        </div>
                        <Switch
                          checked={tabVisibility?.showLocal ?? true}
                          onCheckedChange={(checked) => {
                            if (onTabVisibilityChange && tabVisibility) {
                              onTabVisibilityChange({ ...tabVisibility, showLocal: checked })
                            }
                          }}
                        />
                      </div>

                      {/* Cloud Tab Toggle */}
                      <div className="flex items-center justify-between pl-12">
                        <div className="flex items-center gap-2">
                          <Cloud className="w-4 h-4 text-cyan-500" />
                          <span className="text-sm font-medium">Google Drive</span>
                        </div>
                        <Switch
                          checked={tabVisibility?.showCloud ?? true}
                          onCheckedChange={(checked) => {
                            if (onTabVisibilityChange && tabVisibility) {
                              onTabVisibilityChange({ ...tabVisibility, showCloud: checked })
                            }
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Library Section */}
                {activeSection === 'library' && (
                  <motion.div
                    key="library"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">Media Library</h3>
                      <p className="text-sm text-muted-foreground">Configure folders to scan for media</p>
                    </div>

                    {/* Media Folders */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Media Folders</Label>
                      {config.media_folders.length === 0 && (
                        <div className="p-8 rounded-xl border border-dashed border-border text-center">
                          <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground mb-3">No media folders configured</p>
                          <Button variant="outline" size="sm" onClick={addFolder}>
                            <Plus className="w-4 h-4 mr-2" /> Add Folder
                          </Button>
                        </div>
                      )}

                      {config.media_folders.map((folder, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={folder}
                            onChange={(e) => updateFolder(index, e.target.value)}
                            placeholder="Path to media folder"
                            className="flex-1"
                          />
                          <Button variant="outline" size="icon" onClick={() => browseFolder(index)}>
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="icon" onClick={() => removeFolder(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}

                      {config.media_folders.length > 0 && (
                        <Button variant="outline" size="sm" onClick={addFolder} className="mt-2">
                          <Plus className="mr-2 h-4 w-4" /> Add Another Folder
                        </Button>
                      )}
                    </div>

                    {/* Scan Button */}
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-foreground">Scan Library</h4>
                          <p className="text-sm text-muted-foreground">Scan folders for new media files</p>
                        </div>
                        <Button onClick={handleScan} className="gap-2">
                          <RefreshCw className="w-4 h-4" />
                          Scan Now
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Cloud Storage Section */}
                {activeSection === 'cloud' && (
                  <motion.div
                    key="cloud"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <GoogleDriveSettings />

                    {/* Cloud Cache Settings - Always visible */}
                    <div className="pt-4 border-t border-border">
                      <div className="mb-3 sm:mb-4">
                        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1">Cloud Streaming Cache</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground">Cache cloud videos for smoother playback</p>
                      </div>

                      {/* Enable Cache Toggle */}
                      <div className="p-3 sm:p-4 rounded-xl bg-card border border-border">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <div className="p-1.5 sm:p-2 rounded-lg bg-blue-500/10 flex-shrink-0">
                              <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                            </div>
                            <div className="min-w-0">
                              <Label className="text-sm sm:text-base font-medium">Enable Disk Cache</Label>
                              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                                Cache streams for smoother playback
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={config.cloud_cache_enabled ?? false}
                            onCheckedChange={(checked) => setConfig({ ...config, cloud_cache_enabled: checked })}
                            className="flex-shrink-0"
                          />
                        </div>
                      </div>

                      {/* Cache Directory - Show when enabled */}
                      {config.cloud_cache_enabled && (
                        <div className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
                          <div className="space-y-2">
                            <Label className="text-xs sm:text-sm font-medium">Cache Directory</Label>
                            <div className="flex gap-2">
                              <Input
                                value={config.cloud_cache_dir || ""}
                                onChange={(e) => setConfig({ ...config, cloud_cache_dir: e.target.value })}
                                placeholder="Select folder..."
                                className="flex-1 min-w-0 text-sm"
                              />
                              <Button variant="outline" size="icon" onClick={browseCacheDir} className="flex-shrink-0">
                                <FolderOpen className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Cache Size & Expiry - Responsive grid */}
                          <div className="grid grid-cols-2 gap-2 sm:gap-3">
                            <div className="space-y-1 sm:space-y-2">
                              <Label className="text-xs sm:text-sm font-medium">Max Size (MB)</Label>
                              <Input
                                type="number"
                                value={config.cloud_cache_max_mb || 1024}
                                onChange={(e) => setConfig({ ...config, cloud_cache_max_mb: parseInt(e.target.value) || 1024 })}
                                min={100}
                                max={10240}
                                className="text-sm"
                              />
                            </div>
                            <div className="space-y-1 sm:space-y-2">
                              <Label className="text-xs sm:text-sm font-medium">Cleanup (Hours)</Label>
                              <Input
                                type="number"
                                value={config.cloud_cache_expiry_hours || 24}
                                onChange={(e) => setConfig({ ...config, cloud_cache_expiry_hours: parseInt(e.target.value) || 24 })}
                                min={1}
                                max={168}
                                className="text-sm"
                              />
                            </div>
                          </div>

                          {/* Cache Stats */}
                          {cacheInfo && cacheInfo.cache_dir && (
                            <div className="p-2 sm:p-3 rounded-xl bg-muted/50 border border-border">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                                <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm">
                                  <span>
                                    <span className="text-muted-foreground">Used: </span>
                                    <span className="font-medium">{cacheInfo.total_size_mb.toFixed(1)} MB</span>
                                  </span>
                                  <span>
                                    <span className="text-muted-foreground">Files: </span>
                                    <span className="font-medium">{cacheInfo.file_count}</span>
                                  </span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleClearCache}
                                  disabled={clearingCache || cacheInfo.file_count === 0}
                                  className="gap-2 w-full sm:w-auto text-xs sm:text-sm"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  {clearingCache ? "Clearing..." : "Clear"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Player Section */}
                {activeSection === 'player' && (
                  <motion.div
                    key="player"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">Player Settings</h3>
                      <p className="text-sm text-muted-foreground">Configure video playback preferences</p>
                    </div>

                    {/* MPV Path */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">MPV Executable Path</Label>
                      <div className="flex gap-2">
                        <Input
                          value={config.mpv_path || ""}
                          onChange={(e) => setConfig({ ...config, mpv_path: e.target.value })}
                          placeholder="C:\path\to\mpv.exe"
                          className="flex-1"
                        />
                        <Button variant="outline" size="icon" onClick={browseMpvPath}>
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Required for video playback. Download MPV from mpv.io</p>
                    </div>

                    {/* FFprobe Path */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">FFprobe Path (Optional)</Label>
                      <div className="flex gap-2">
                        <Input
                          value={config.ffprobe_path || ""}
                          onChange={(e) => setConfig({ ...config, ffprobe_path: e.target.value })}
                          placeholder="C:\path\to\ffprobe.exe"
                          className="flex-1"
                        />
                        <Button variant="outline" size="icon" onClick={browseFfprobePath}>
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Used for generating accurate progress bars</p>
                    </div>
                  </motion.div>
                )}

                {/* API Section */}
                {activeSection === 'api' && (
                  <motion.div
                    key="api"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">API Configuration</h3>
                      <p className="text-sm text-muted-foreground">Configure external service API keys</p>
                    </div>

                    {/* TMDB API Key/Token */}
                    <div className="p-4 rounded-xl bg-card border border-border space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                          <Zap className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                          <Label className="text-base font-medium">TMDB API Key / Access Token</Label>
                          <p className="text-sm text-muted-foreground">Required for metadata, posters, and streaming search</p>
                        </div>
                      </div>
                      <Input
                        type="password"
                        value={config.tmdb_api_key || ""}
                        onChange={(e) => setConfig({ ...config, tmdb_api_key: e.target.value })}
                        placeholder="Enter your TMDB API key or Access Token"
                      />
                      <p className="text-xs text-muted-foreground">
                        You can use either an <strong>API Key</strong> (v3 auth) or <strong>Access Token</strong> (v4 auth / Bearer token).{" "}
                        Get yours at{" "}
                        <a
                          href="https://www.themoviedb.org/settings/api"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          themoviedb.org
                        </a>
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Danger Section */}
                {activeSection === 'danger' && (
                  <motion.div
                    key="danger"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1">Advanced Settings</h3>
                      <p className="text-sm text-muted-foreground">Danger zone - proceed with caution</p>
                    </div>

                    {/* Repair File Paths */}
                    <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/20">
                          <Wrench className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                          <Label className="text-base font-medium text-blue-500">Repair File Paths</Label>
                          <p className="text-sm text-muted-foreground">
                            Fix broken database entries
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        If videos show "file not found" errors, this will search your media folders
                        and repair broken file paths in the database. Run this before rescanning.
                      </p>
                      <Button
                        variant="outline"
                        onClick={handleRepairFilePaths}
                        className="w-full border-blue-500/30 hover:bg-blue-500/10"
                        disabled={repairing}
                      >
                        <Wrench className="mr-2 h-4 w-4" />
                        {repairing ? "Repairing..." : "Repair File Paths"}
                      </Button>
                    </div>

                    {/* Cleanup Missing Metadata */}
                    <div className="p-4 rounded-xl border border-orange-500/30 bg-orange-500/5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-orange-500/20">
                          <Trash2 className="w-5 h-5 text-orange-500" />
                        </div>
                        <div>
                          <Label className="text-base font-medium text-orange-500">Clean Up Missing Titles</Label>
                          <p className="text-sm text-muted-foreground">
                            Remove orphaned metadata and posters
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        This will remove database entries and cached posters for movies and TV shows
                        that no longer exist on disk. Useful for cleaning up after deleting files externally.
                      </p>
                      <Button
                        variant="outline"
                        onClick={handleCleanupMissing}
                        className="w-full border-orange-500/30 hover:bg-orange-500/10"
                        disabled={cleaningUp}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {cleaningUp ? "Cleaning up..." : "Clean Up Missing Titles"}
                      </Button>
                    </div>

                    {/* Reset App */}
                    <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-destructive/20">
                          <AlertTriangle className="w-5 h-5 text-destructive" />
                        </div>
                        <div>
                          <Label className="text-base font-medium text-destructive">Reset Application</Label>
                          <p className="text-sm text-muted-foreground">
                            Delete all data and start fresh
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        This will permanently delete your library data, watch history, streaming history,
                        cached posters, and all settings. This action cannot be undone.
                      </p>

                      {!showResetConfirm ? (
                        <Button
                          variant="destructive"
                          onClick={() => setShowResetConfirm(true)}
                          className="w-full"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Reset App to Factory State
                        </Button>
                      ) : (
                        <div className="space-y-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                          <p className="text-sm font-medium text-destructive text-center">
                            Are you absolutely sure? This will delete everything!
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setShowResetConfirm(false)}
                              className="flex-1"
                              disabled={resetting}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={handleResetApp}
                              className="flex-1"
                              disabled={resetting}
                            >
                              {resetting ? "Resetting..." : "Yes, Delete Everything"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Footer - Always visible at bottom */}
        <div className="flex-shrink-0 p-3 sm:p-4 border-t border-border bg-card/50">
          <div className="flex justify-end gap-2 sm:gap-3">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading} className="gap-2">
              <Save className="w-4 h-4" />
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
