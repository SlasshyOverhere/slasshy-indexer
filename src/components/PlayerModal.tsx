import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MonitorPlay, ExternalLink, Globe, AlertCircle } from 'lucide-react'

interface PlayerModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelectPlayer: (player: 'mpv' | 'builtin' | 'stream') => void
    title: string
    hasTmdbId?: boolean
}

export function PlayerModal({ open, onOpenChange, onSelectPlayer, title, hasTmdbId = false }: PlayerModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-border/50">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        Choose Player
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Select how you want to watch <span className="font-medium text-foreground">{title}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Stream Online Option - NEW */}
                    <Button
                        variant="outline"
                        className={`h-auto p-4 flex flex-col items-start gap-2 transition-all duration-300 group ${hasTmdbId
                                ? 'hover:bg-primary/10 hover:border-primary/50'
                                : 'opacity-50 cursor-not-allowed'
                            }`}
                        onClick={() => {
                            if (hasTmdbId) {
                                onSelectPlayer('stream')
                                onOpenChange(false)
                            }
                        }}
                        disabled={!hasTmdbId}
                    >
                        <div className="flex items-center gap-3 w-full">
                            <div className={`p-2 rounded-lg text-white shadow-lg transition-transform ${hasTmdbId
                                    ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/20 group-hover:scale-110'
                                    : 'bg-gray-500'
                                }`}>
                                <Globe className="h-5 w-5" />
                            </div>
                            <div className="flex-1 text-left">
                                <div className={`font-semibold transition-colors ${hasTmdbId ? 'text-foreground group-hover:text-primary' : 'text-muted-foreground'
                                    }`}>
                                    Stream Online
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {hasTmdbId
                                        ? 'Online streaming • No local file needed'
                                        : 'Requires TMDB match'}
                                </div>
                            </div>
                            {!hasTmdbId && (
                                <AlertCircle className="h-4 w-4 text-yellow-500" />
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground/70 pl-12">
                            {hasTmdbId
                                ? 'Watch via Videasy streaming service'
                                : 'Use "Fix Match" to link this content to TMDB'}
                        </div>
                    </Button>

                    {/* MPV Option */}
                    <Button
                        variant="outline"
                        className="h-auto p-4 flex flex-col items-start gap-2 hover:bg-primary/10 hover:border-primary/50 transition-all duration-300 group"
                        onClick={() => {
                            onSelectPlayer('mpv')
                            onOpenChange(false)
                        }}
                    >
                        <div className="flex items-center gap-3 w-full">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/20 group-hover:scale-110 transition-transform">
                                <ExternalLink className="h-5 w-5" />
                            </div>
                            <div className="flex-1 text-left">
                                <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                    MPV Player
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    External player • Best quality • Hardware acceleration
                                </div>
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground/70 pl-12">
                            Opens in a separate window with full MPV features
                        </div>
                    </Button>

                    {/* Built-in Player Option */}
                    <Button
                        variant="outline"
                        className="h-auto p-4 flex flex-col items-start gap-2 hover:bg-primary/10 hover:border-primary/50 transition-all duration-300 group"
                        onClick={() => {
                            onSelectPlayer('builtin')
                            onOpenChange(false)
                        }}
                    >
                        <div className="flex items-center gap-3 w-full">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
                                <MonitorPlay className="h-5 w-5" />
                            </div>
                            <div className="flex-1 text-left">
                                <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                    Built-in Player
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Watch inside app • Integrated experience
                                </div>
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground/70 pl-12">
                            Stream directly within the application
                        </div>
                    </Button>
                </div>

                {/* Quick tip */}
                <div className="text-xs text-center text-muted-foreground/60 border-t border-border/50 pt-4">
                    <span className="text-primary">Tip:</span> You can set a default player in Settings
                </div>
            </DialogContent>
        </Dialog>
    )
}
