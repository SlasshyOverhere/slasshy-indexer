import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Cloud, LogIn, LogOut, Loader2, CheckCircle2, HardDrive, User, AlertCircle, FolderPlus, Folder, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import {
    isGDriveConnected,
    getGDriveAccountInfo,
    startGDriveAuth,
    completeGDriveAuth,
    disconnectGDrive,
    formatStorageSize,
    DriveAccountInfo,
    scanCloudFolder,
    CloudFolder,
    addCloudFolder,
    removeCloudFolder,
    getCloudFolders,
    scanAllCloudFolders
} from '@/services/gdrive'
import { CloudFolderBrowser } from '@/components/CloudFolderBrowser'
import { DriveItem } from '@/services/gdrive'

// Note: Auto-scan polling is now handled globally in App.tsx
// This component only handles manual scans and folder management

export function GoogleDriveSettings() {
    const [isConnected, setIsConnected] = useState(false)
    const [accountInfo, setAccountInfo] = useState<DriveAccountInfo | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isConnecting, setIsConnecting] = useState(false)
    const [isDisconnecting, setIsDisconnecting] = useState(false)
    const [showFolderBrowser, setShowFolderBrowser] = useState(false)
    const [cloudFolders, setCloudFolders] = useState<CloudFolder[]>([])
    const [scanningFolderId, setScanningFolderId] = useState<string | null>(null)
    const { toast } = useToast()

    useEffect(() => {
        checkConnectionStatus()
        loadFolders()

        // Listen for library updates
        let unlisten: UnlistenFn | null = null
        listen('library-updated', () => {
            loadFolders()
        }).then(fn => { unlisten = fn })

        return () => {
            unlisten?.()
        }
    }, [])

    const loadFolders = async () => {
        const folders = await getCloudFolders()
        setCloudFolders(folders)
    }


    const checkConnectionStatus = async () => {
        setIsLoading(true)
        try {
            const connected = await isGDriveConnected()
            setIsConnected(connected)

            if (connected) {
                const info = await getGDriveAccountInfo()
                setAccountInfo(info)
            }
        } catch (error) {
            console.error('[GDrive] Failed to check status:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleConnect = async () => {
        setIsConnecting(true)
        try {
            // Start OAuth - this opens the browser
            await startGDriveAuth()

            toast({
                title: "Authorization Started",
                description: "Complete sign-in in your browser. You'll be redirected back automatically."
            })

            // Wait for the OAuth callback (automatic via deep link or localhost)
            const info = await completeGDriveAuth()

            setIsConnected(true)
            setAccountInfo(info)

            toast({
                title: "Connected!",
                description: `Signed in as ${info.email}`
            })

            // Reload folders
            await loadFolders()
        } catch (error) {
            console.error('[GDrive] Auth failed:', error)
            toast({
                title: "Connection Failed",
                description: String(error),
                variant: "destructive"
            })
        } finally {
            setIsConnecting(false)
        }
    }

    const handleDisconnect = async () => {
        setIsDisconnecting(true)
        try {
            await disconnectGDrive()
            setIsConnected(false)
            setAccountInfo(null)

            toast({
                title: "Disconnected",
                description: "Google Drive has been disconnected"
            })
        } catch (error) {
            console.error('[GDrive] Disconnect failed:', error)
            toast({
                title: "Error",
                description: "Failed to disconnect",
                variant: "destructive"
            })
        } finally {
            setIsDisconnecting(false)
        }
    }

    const handleAddFolder = async (folder: DriveItem) => {
        // Check if already added
        if (cloudFolders.some(f => f.id === folder.id)) {
            toast({
                title: "Already Added",
                description: "This folder is already in your cloud library",
                variant: "destructive"
            })
            return
        }

        try {
            // Add to backend database
            await addCloudFolder(folder.id, folder.name)

            // Reload folders
            await loadFolders()

            toast({
                title: "Folder Added",
                description: `"${folder.name}" added. Scanning for media...`
            })

            // Immediately scan the new folder
            setScanningFolderId(folder.id)
            try {
                const result = await scanCloudFolder(folder.id, folder.name)
                toast({
                    title: "Scan Complete",
                    description: result.message
                })
            } catch (error) {
                console.error('[GDrive] Scan failed:', error)
                toast({
                    title: "Scan Failed",
                    description: String(error),
                    variant: "destructive"
                })
            } finally {
                setScanningFolderId(null)
            }
        } catch (error) {
            console.error('[GDrive] Failed to add folder:', error)
            toast({
                title: "Error",
                description: "Failed to add folder",
                variant: "destructive"
            })
        }
    }

    const handleRemoveFolder = async (folderId: string) => {
        try {
            await removeCloudFolder(folderId)
            await loadFolders()

            toast({
                title: "Folder Removed",
                description: "Cloud folder and its indexed media removed from library"
            })
        } catch (error) {
            console.error('[GDrive] Failed to remove folder:', error)
            toast({
                title: "Error",
                description: "Failed to remove folder",
                variant: "destructive"
            })
        }
    }

    const handleScanFolder = async (folder: CloudFolder) => {
        setScanningFolderId(folder.id)
        try {
            toast({
                title: "Scanning Started",
                description: `Scanning "${folder.name}" for movies and TV shows...`
            })

            const result = await scanCloudFolder(folder.id, folder.name)

            toast({
                title: "Scan Complete",
                description: result.message
            })
        } catch (error) {
            console.error('[GDrive] Scan failed:', error)
            toast({
                title: "Scan Failed",
                description: String(error),
                variant: "destructive"
            })
        } finally {
            setScanningFolderId(null)
        }
    }

    const handleScanAllFolders = async () => {
        setScanningFolderId('all')
        try {
            toast({
                title: "Scanning All Folders",
                description: "Checking for new media in all cloud folders..."
            })

            const result = await scanAllCloudFolders()

            toast({
                title: "Scan Complete",
                description: result.message
            })
        } catch (error) {
            console.error('[GDrive] Scan all failed:', error)
            toast({
                title: "Scan Failed",
                description: String(error),
                variant: "destructive"
            })
        } finally {
            setScanningFolderId(null)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Cloud Storage</h3>
                <p className="text-sm text-muted-foreground">
                    Connect to Google Drive to stream media directly from the cloud
                </p>
            </div>

            {/* Connection Status Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 rounded-xl bg-card border border-border"
            >
                <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`p-3 rounded-xl ${isConnected ? 'bg-green-500/10' : 'bg-primary/10'}`}>
                        {isConnected ? (
                            <CheckCircle2 className="w-6 h-6 text-green-500" />
                        ) : (
                            <Cloud className="w-6 h-6 text-primary" />
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-foreground">Google Drive</h4>
                            {isConnected && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/10 text-green-500">
                                    Connected
                                </span>
                            )}
                        </div>

                        {isConnected && accountInfo ? (
                            <div className="space-y-3">
                                {/* Account Info */}
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <User className="w-4 h-4" />
                                    <span>{accountInfo.email}</span>
                                </div>

                                {/* Storage Info */}
                                {accountInfo.storage_used !== undefined && accountInfo.storage_limit !== undefined && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <HardDrive className="w-4 h-4" />
                                            <span>
                                                {formatStorageSize(accountInfo.storage_used)} of{' '}
                                                {formatStorageSize(accountInfo.storage_limit)} used
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all"
                                                style={{
                                                    width: `${Math.min(100, (accountInfo.storage_used / accountInfo.storage_limit) * 100)}%`
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Disconnect Button */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDisconnect}
                                    disabled={isDisconnecting}
                                    className="mt-2"
                                >
                                    {isDisconnecting ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <LogOut className="w-4 h-4 mr-2" />
                                    )}
                                    Disconnect
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    Connect your Google Drive to access your media library from anywhere.
                                    Stream movies and TV shows directly without downloading.
                                </p>

                                <Button
                                    onClick={handleConnect}
                                    disabled={isConnecting}
                                    className="gap-2"
                                >
                                    {isConnecting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Opening browser...
                                        </>
                                    ) : (
                                        <>
                                            <LogIn className="w-4 h-4" />
                                            Connect Google Drive
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Cloud Media Folders */}
            {isConnected && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-5 rounded-xl bg-card border border-border"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div className="min-w-0">
                            <h4 className="font-semibold text-foreground">Cloud Media Folders</h4>
                            <p className="text-sm text-muted-foreground">
                                Folders are monitored in real-time for new media
                            </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                            {cloudFolders.length > 0 && (
                                <Button
                                    onClick={handleScanAllFolders}
                                    size="sm"
                                    variant="outline"
                                    className="gap-2"
                                    disabled={scanningFolderId !== null}
                                >
                                    {scanningFolderId === 'all' ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-4 h-4" />
                                    )}
                                    Scan All
                                </Button>
                            )}
                            <Button
                                onClick={() => setShowFolderBrowser(true)}
                                size="sm"
                                className="gap-2"
                            >
                                <FolderPlus className="w-4 h-4" />
                                Add Folder
                            </Button>
                        </div>
                    </div>

                    {cloudFolders.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Folder className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No cloud folders added yet</p>
                            <p className="text-xs">Click "Add Folder" to browse your Google Drive</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {cloudFolders.map((folder) => (
                                <div
                                    key={folder.id}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 group"
                                >
                                    <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                                        <Folder className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{folder.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Auto-sync enabled • Movies & TV Shows
                                        </p>
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleScanFolder(folder)}
                                            disabled={scanningFolderId !== null}
                                            className="opacity-70 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            {scanningFolderId === folder.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <RefreshCw className="w-4 h-4" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveFolder(folder.id)}
                                            disabled={scanningFolderId !== null}
                                            className="opacity-70 sm:opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Info Note */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-blue-500 mb-1">Auto-sync enabled</p>
                    <ul className="list-disc list-inside space-y-1">
                        <li>New files in cloud folders are detected automatically</li>
                        <li>Changes are detected within 5 seconds when connected</li>
                        <li>Videos are streamed directly - no downloads needed</li>
                    </ul>
                </div>
            </div>

            {/* Folder Browser Dialog */}
            <CloudFolderBrowser
                open={showFolderBrowser}
                onOpenChange={setShowFolderBrowser}
                onSelectFolder={handleAddFolder}
            />
        </div>
    )
}
