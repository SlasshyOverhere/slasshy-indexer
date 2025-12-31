import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, MonitorPlay, ExternalLink, HelpCircle, FolderOpen, AlertTriangle } from "lucide-react"
import { Config, getConfig, saveConfig, scanLibrary, getPlayerPreference, setPlayerPreference, PlayerPreference, clearAllAppData } from "@/services/api"
import { useToast } from "@/components/ui/use-toast"
import { open as openDialog } from '@tauri-apps/api/dialog'
import { invoke } from '@tauri-apps/api/tauri'
import { Switch } from "@/components/ui/switch"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [config, setConfig] = useState<Config>({
    mpv_path: "",
    ffprobe_path: "",
    media_folders: [],
    tmdb_api_key: ""
  })
  const [playerPref, setPlayerPref] = useState<PlayerPreference>('ask')
  const [loading, setLoading] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      loadConfig()
      setPlayerPref(getPlayerPreference())
      checkAutoStart()
    }
  }, [open])

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
        ffprobe_path: data.ffprobe_path || "",
        media_folders: data.media_folders || [],
        tmdb_api_key: data.tmdb_api_key || ""
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
      setPlayerPreference(playerPref)
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
      // Reload the page to reflect the reset
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

  const playerOptions: { value: PlayerPreference; label: string; description: string; icon: React.ReactNode }[] = [
    {
      value: 'ask',
      label: 'Always Ask',
      description: 'Choose player each time',
      icon: <HelpCircle className="h-4 w-4" />
    },
    {
      value: 'mpv',
      label: 'MPV',
      description: 'External player',
      icon: <ExternalLink className="h-4 w-4" />
    },
    {
      value: 'builtin',
      label: 'Built-in',
      description: 'In-app player',
      icon: <MonitorPlay className="h-4 w-4" />
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure your media player paths and library folders.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* General Section */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Run on Startup</Label>
              <div className="text-sm text-muted-foreground">
                Automatically start Slasshy when you log in
              </div>
            </div>
            <Switch
              checked={autoStart}
              onCheckedChange={toggleAutoStart}
            />
          </div>

          <div className="h-px bg-border" />
          {/* Player Preference Section */}
          <div className="grid gap-3">
            <Label className="text-base font-semibold">Default Player</Label>
            <div className="grid grid-cols-3 gap-2">
              {playerOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPlayerPref(option.value)}
                  className={`p-3 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2 ${playerPref === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50 hover:bg-accent'
                    }`}
                >
                  <div className={`p-2 rounded-full ${playerPref === option.value ? 'bg-primary/20' : 'bg-muted'
                    }`}>
                    {option.icon}
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="grid gap-2">
            <Label htmlFor="mpv">MPV Path</Label>
            <div className="flex gap-2">
              <Input
                id="mpv"
                value={config.mpv_path || ""}
                onChange={(e) => setConfig({ ...config, mpv_path: e.target.value })}
                placeholder="C:\path\to\mpv.exe"
              />
              <Button variant="outline" size="icon" onClick={browseMpvPath}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ffprobe">FFprobe Path (Optional)</Label>
            <div className="flex gap-2">
              <Input
                id="ffprobe"
                value={config.ffprobe_path || ""}
                onChange={(e) => setConfig({ ...config, ffprobe_path: e.target.value })}
                placeholder="C:\path\to\ffprobe.exe"
              />
              <Button variant="outline" size="icon" onClick={browseFfprobePath}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[0.8rem] text-muted-foreground">Needed for generating progress bars.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tmdb">TMDB API Key</Label>
            <Input
              id="tmdb"
              type="password"
              value={config.tmdb_api_key || ""}
              onChange={(e) => setConfig({ ...config, tmdb_api_key: e.target.value })}
              placeholder="Your TMDB API Key"
            />
            <p className="text-[0.8rem] text-muted-foreground">Required for metadata and posters.</p>
          </div>

          <div className="grid gap-2">
            <Label>Media Folders</Label>
            {config.media_folders.map((folder, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={folder}
                  onChange={(e) => updateFolder(index, e.target.value)}
                  placeholder="Path to media folder"
                />
                <Button variant="outline" size="icon" onClick={() => browseFolder(index)}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
                <Button variant="destructive" size="icon" onClick={() => removeFolder(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addFolder} className="w-fit">
              <Plus className="mr-2 h-4 w-4" /> Add Folder
            </Button>
          </div>

          <div className="h-px bg-border" />

          {/* Danger Zone */}
          <div className="rounded-lg border border-destructive/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <Label className="text-base font-semibold text-destructive">Danger Zone</Label>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              This will permanently delete all your library data, watch history, streaming history, and cached posters. This action cannot be undone.
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
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">Are you sure? This will delete everything!</p>
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
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="secondary" onClick={handleScan} className="w-full sm:w-auto sm:mr-auto">
            Scan Library
          </Button>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
