import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { fixMatch, MediaItem } from "@/services/api"
import { useToast } from "@/components/ui/use-toast"

interface FixMatchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: MediaItem | null
  onSuccess: () => void
}

export function FixMatchModal({ open, onOpenChange, item, onSuccess }: FixMatchModalProps) {
  const [inputVal, setInputVal] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSave = async () => {
    if (!item) return
    if (!inputVal) {
        toast({ title: "Error", description: "Please enter a value", variant: "destructive" })
        return
    }

    setLoading(true)
    try {
      const type = item.media_type === 'movie' ? 'movie' : 'tv'
      await fixMatch(item.id, inputVal, type)
      toast({ title: "Success", description: "Metadata updated successfully" })
      
      // Close modal first, then trigger refresh
      onOpenChange(false)
      setInputVal("")
      
      // Small delay to ensure DB write is committed before read
      setTimeout(() => {
          onSuccess()
      }, 1500)
      
    } catch (error) {
      console.error("Failed to fix match", error)
      toast({ title: "Error", description: "Failed to update metadata. Check the ID or URL.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Fix Match</DialogTitle>
          <DialogDescription>
            Enter the <b>TMDB ID</b>, <b>TMDB URL</b>, or <b>IMDB URL</b> to fix the metadata for this {item?.media_type === 'movie' ? 'movie' : 'show'}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="tmdbId">ID or URL</Label>
            <Input 
              id="tmdbId" 
              value={inputVal} 
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="e.g. 550, or https://www.imdb.com/title/tt0137523/"
            />
            <p className="text-xs text-muted-foreground">
                Supports direct IDs, TMDB URLs, and IMDB URLs.
            </p>
          </div>
        </div>

        <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>
                {loading ? "Updating..." : "Update Match"}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
