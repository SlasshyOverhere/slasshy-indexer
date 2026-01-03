import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Folder, ChevronRight, ChevronLeft, Home, Check, Loader2, X, FolderOpen
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { listGDriveFolders, DriveItem, isGDriveConnected } from '@/services/gdrive'

interface CloudFolderBrowserProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelectFolder: (folder: DriveItem) => void
}

interface BreadcrumbItem {
    id: string
    name: string
}

export function CloudFolderBrowser({ open, onOpenChange, onSelectFolder }: CloudFolderBrowserProps) {
    const [folders, setFolders] = useState<DriveItem[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [currentPath, setCurrentPath] = useState<BreadcrumbItem[]>([{ id: 'root', name: 'My Drive' }])
    const [selectedFolder, setSelectedFolder] = useState<DriveItem | null>(null)
    const { toast } = useToast()

    useEffect(() => {
        if (open) {
            checkConnectionAndLoad()
        }
    }, [open])

    const checkConnectionAndLoad = async () => {
        const connected = await isGDriveConnected()
        if (!connected) {
            toast({
                title: "Not Connected",
                description: "Please connect to Google Drive first in Settings > Cloud Storage",
                variant: "destructive"
            })
            onOpenChange(false)
            return
        }
        loadFolders()
    }

    const loadFolders = async (parentId?: string) => {
        setIsLoading(true)
        try {
            const items = await listGDriveFolders(parentId)
            setFolders(items)
        } catch (error) {
            console.error('[CloudBrowser] Failed to load folders:', error)
            toast({
                title: "Error",
                description: "Failed to load folders from Google Drive",
                variant: "destructive"
            })
        } finally {
            setIsLoading(false)
        }
    }

    const navigateToFolder = (folder: DriveItem) => {
        setCurrentPath([...currentPath, { id: folder.id, name: folder.name }])
        setSelectedFolder(null)
        loadFolders(folder.id)
    }

    const navigateBack = () => {
        if (currentPath.length > 1) {
            const newPath = currentPath.slice(0, -1)
            setCurrentPath(newPath)
            setSelectedFolder(null)
            const parentId = newPath[newPath.length - 1].id
            loadFolders(parentId === 'root' ? undefined : parentId)
        }
    }

    const navigateToBreadcrumb = (index: number) => {
        if (index < currentPath.length - 1) {
            const newPath = currentPath.slice(0, index + 1)
            setCurrentPath(newPath)
            setSelectedFolder(null)
            const parentId = newPath[newPath.length - 1].id
            loadFolders(parentId === 'root' ? undefined : parentId)
        }
    }

    const handleSelectFolder = (folder: DriveItem) => {
        if (selectedFolder?.id === folder.id) {
            // Double-click: navigate into folder
            navigateToFolder(folder)
        } else {
            setSelectedFolder(folder)
        }
    }

    const handleConfirmSelection = () => {
        if (selectedFolder) {
            onSelectFolder(selectedFolder)
            onOpenChange(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl h-[70vh] flex flex-col p-0 gap-0">
                {/* Header */}
                <DialogHeader className="p-4 pb-3 border-b border-border flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-lg font-semibold">
                            Select Cloud Folder
                        </DialogTitle>
                        <button
                            onClick={() => onOpenChange(false)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1 text-sm mt-2 overflow-x-auto">
                        {currentPath.map((item, index) => (
                            <div key={item.id} className="flex items-center">
                                {index > 0 && (
                                    <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />
                                )}
                                <button
                                    onClick={() => navigateToBreadcrumb(index)}
                                    className={`px-2 py-1 rounded-md transition-colors ${
                                        index === currentPath.length - 1
                                            ? 'bg-primary/10 text-primary font-medium'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                    }`}
                                >
                                    {index === 0 ? (
                                        <span className="flex items-center gap-1">
                                            <Home className="w-3 h-3" />
                                            {item.name}
                                        </span>
                                    ) : (
                                        item.name
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                </DialogHeader>

                {/* Folder List */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : folders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <FolderOpen className="w-12 h-12 mb-2 opacity-50" />
                            <p>No folders found</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <AnimatePresence>
                                {folders.map((folder) => (
                                    <motion.button
                                        key={folder.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        onClick={() => handleSelectFolder(folder)}
                                        onDoubleClick={() => navigateToFolder(folder)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                            selectedFolder?.id === folder.id
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border hover:border-primary/50 hover:bg-muted/50'
                                        }`}
                                    >
                                        <div className={`p-2 rounded-lg ${
                                            selectedFolder?.id === folder.id
                                                ? 'bg-primary/20'
                                                : 'bg-muted'
                                        }`}>
                                            <Folder className={`w-5 h-5 ${
                                                selectedFolder?.id === folder.id
                                                    ? 'text-primary'
                                                    : 'text-muted-foreground'
                                            }`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{folder.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Click to select, double-click to open
                                            </p>
                                        </div>
                                        {selectedFolder?.id === folder.id && (
                                            <Check className="w-5 h-5 text-primary flex-shrink-0" />
                                        )}
                                    </motion.button>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border flex-shrink-0">
                    <div className="flex items-center justify-between gap-4">
                        {/* Info text */}
                        <p className="text-sm text-muted-foreground">
                            Select a folder to scan for movies and TV shows
                        </p>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            {currentPath.length > 1 && (
                                <Button variant="outline" size="sm" onClick={navigateBack}>
                                    <ChevronLeft className="w-4 h-4 mr-1" />
                                    Back
                                </Button>
                            )}
                            <Button
                                onClick={handleConfirmSelection}
                                disabled={!selectedFolder}
                                size="sm"
                            >
                                <Check className="w-4 h-4 mr-1" />
                                Scan Folder
                            </Button>
                        </div>
                    </div>

                    {selectedFolder && (
                        <div className="mt-3 p-2 rounded-lg bg-muted/50 text-sm">
                            <span className="text-muted-foreground">Selected: </span>
                            <span className="font-medium">{selectedFolder.name}</span>
                            <span className="text-muted-foreground"> - will auto-detect movies and TV shows</span>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
