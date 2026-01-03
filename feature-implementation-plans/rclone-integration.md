# Google Drive Integration Plan (Updated)

## Overview

Direct Google Drive integration into Slasshy Desktop to allow users to access cloud storage directly within the app. Users can browse, index, and stream media from Google Drive without external dependencies.

**Note**: This replaces the original rclone-based plan with a lighter, native integration.

---

## Implementation Status

### Completed:
- [x] Backend: `gdrive.rs` module with OAuth2 and Drive API
- [x] Backend: Tauri commands for all Drive operations
- [x] Frontend: `gdrive.ts` service layer
- [x] Frontend: `GoogleDriveSettings.tsx` component
- [x] Settings integration: Cloud Storage section added

### In Progress:
- [ ] Google OAuth credentials setup
- [ ] Cloud folder browser UI

### Pending:
- [ ] Cloud media indexing into library
- [ ] Direct streaming integration with player
- [ ] Database schema for cloud media

---

## Architecture Decision

### Option A: Embedded Rclone Binary (Recommended)
- Bundle `rclone.exe` with the app (in resources or sidecar)
- App manages rclone processes directly
- Full control over rclone operations
- **Pros**: No user installation required, consistent behavior
- **Cons**: Larger app size (~15-20MB), need to update rclone periodically

### Option B: Use rclone library via Rust bindings
- Use `librclone` (rclone's C library)
- Compile rclone as a library and link to Rust
- **Pros**: No subprocess management, tighter integration
- **Cons**: Complex build setup, harder to maintain

### Option C: System rclone + Optional embedded fallback
- Check for system rclone first, use embedded if not found
- **Pros**: Smaller app for users who have rclone
- **Cons**: Version inconsistency issues

**Recommendation**: Option A - Embedded rclone binary as Tauri sidecar

---

## Implementation Phases

### Phase 1: Rclone Binary Integration

**Goal**: Embed rclone and expose basic operations to Rust backend

#### Tasks:
1. **Add rclone as Tauri sidecar**
   - Download rclone for Windows (x64)
   - Add to `src-tauri/binaries/rclone-x86_64-pc-windows-msvc.exe`
   - Update `tauri.conf.json` to include sidecar:
     ```json
     "bundle": {
       "externalBin": ["binaries/rclone"]
     }
     ```

2. **Create `src-tauri/src/rclone.rs` module**
   - Struct `RcloneManager` to manage rclone operations
   - Functions:
     - `get_rclone_path()` - Get sidecar binary path
     - `run_command(args: &[&str])` - Execute rclone with args
     - `get_version()` - Verify rclone is working
     - `list_remotes()` - Get configured remotes
     - `list_files(remote: &str, path: &str)` - List directory contents

3. **Rclone config location**
   - Store rclone config at `%APPDATA%/Slasshy/rclone.conf`
   - Pass `--config` flag to all rclone commands

---

### Phase 2: Remote Configuration UI

**Goal**: Allow users to add cloud remotes via OAuth flow

#### Backend Tasks:

1. **OAuth flow commands in `main.rs`**
   ```rust
   #[tauri::command]
   async fn rclone_start_oauth(remote_type: String, remote_name: String) -> Result<OAuthInfo, String>

   #[tauri::command]
   async fn rclone_check_oauth_status(remote_name: String) -> Result<bool, String>

   #[tauri::command]
   async fn rclone_list_remotes() -> Result<Vec<RemoteInfo>, String>

   #[tauri::command]
   async fn rclone_delete_remote(remote_name: String) -> Result<(), String>
   ```

2. **OAuth implementation**
   - Run `rclone config create <name> drive --drive-client-id=<id> --drive-client-secret=<secret>`
   - For OAuth: use `rclone authorize "drive"` which opens browser
   - Alternative: Use rclone's built-in web server for OAuth callback
     ```
     rclone authorize "drive" --auth-no-open-browser
     ```
   - Parse the token from stdout and save to config

3. **Supported remote types (initial)**
   - Google Drive (`drive`)
   - OneDrive (`onedrive`)
   - Dropbox (`dropbox`)
   - Future: S3, SFTP, WebDAV, etc.

#### Frontend Tasks:

1. **New Settings section: "Cloud Storage"**
   - List of configured remotes with status
   - "Add Remote" button

2. **Add Remote Modal/Wizard**
   - Step 1: Choose provider (Google Drive, OneDrive, Dropbox)
   - Step 2: Enter remote name (e.g., "My Google Drive")
   - Step 3: OAuth flow
     - Show "Authorize" button
     - Open OAuth URL in system browser
     - Show "Waiting for authorization..." with spinner
     - Auto-detect completion or manual "Done" button
   - Step 4: Success confirmation

3. **Remote management**
   - View remote details
   - Test connection
   - Delete remote

---

### Phase 3: Cloud Media Browsing

**Goal**: Browse and select media folders from cloud storage

#### Backend Tasks:

1. **Directory listing commands**
   ```rust
   #[tauri::command]
   async fn rclone_list_directory(
       remote: String,
       path: String
   ) -> Result<Vec<RcloneItem>, String>

   struct RcloneItem {
       name: String,
       path: String,
       is_dir: bool,
       size: u64,
       mod_time: String,
   }
   ```

2. **Use `rclone lsjson` for efficient listing**
   ```
   rclone lsjson remote:path --files-only --dirs-only
   ```

#### Frontend Tasks:

1. **Cloud folder browser component**
   - Tree view or breadcrumb navigation
   - Show folders and video files
   - "Add as Media Folder" action for folders

2. **Integrate with existing media folder management**
   - New folder type: cloud remote
   - Store as `remote:path` format in config
   - Visual indicator for cloud vs local folders

---

### Phase 4: Cloud Media Indexing

**Goal**: Index cloud media into the library (metadata only, no download)

#### Backend Tasks:

1. **Update `media_manager.rs` to support cloud paths**
   - Detect `remote:path` format
   - Use rclone to list files instead of `walkdir`
   - Parse filenames same as local files

2. **Store remote info in database**
   - Add `is_remote` column to media table
   - Add `remote_name` column
   - Store full remote path in `file_path`

3. **Thumbnail/poster handling**
   - For cloud files, rely on TMDB posters (already implemented)
   - No local thumbnail extraction for cloud files

4. **Incremental indexing for cloud**
   - Cache file listings to avoid repeated API calls
   - Use rclone's `--fast-list` where supported
   - Compare mod times for change detection

---

### Phase 5: Cloud Media Streaming

**Goal**: Play cloud media files directly without full download

#### Option A: Rclone Mount (Windows)
- Use `rclone mount remote:path X:` to create virtual drive
- MPV plays from mounted path
- **Pros**: Seamless, works with any player
- **Cons**: Requires WinFsp, admin rights for first install

#### Option B: Rclone Serve HTTP (SELECTED)
- Run rclone serve with optimized caching:
  ```bash
  rclone serve http remote: --addr 127.0.0.1:8765 --read-only \
    --vfs-cache-mode full \
    --vfs-cache-max-size 200G \
    --vfs-cache-max-age 24h \
    --buffer-size 256M \
    --vfs-read-ahead 256M \
    --vfs-read-chunk-size 64M \
    --vfs-read-chunk-size-limit off \
    --dir-cache-time 72h \
    --poll-interval 15s \
    --log-level INFO
  ```
- Stream files via `http://localhost:8765/path/to/file.mkv`
- MPV supports HTTP streams natively
- VFS cache stored in `%APPDATA%/Slasshy/rclone-cache/`
- **Pros**: No driver needed, works out of box, excellent buffering
- **Cons**: Need to manage serve process lifecycle

#### Option C: Rclone Cat + Pipe
- Stream directly: `rclone cat remote:file.mkv | mpv -`
- **Pros**: Simplest
- **Cons**: No seeking support, not ideal for large files

**Recommendation**: Option B - Rclone HTTP Server with VFS caching

#### Backend Tasks:

1. **Rclone serve management**
   ```rust
   struct RcloneServeState {
       process: Option<Child>,
       port: u16,
       remote: String,
   }

   #[tauri::command]
   async fn start_rclone_serve(remote: String) -> Result<u16, String>

   #[tauri::command]
   async fn stop_rclone_serve() -> Result<(), String>

   #[tauri::command]
   async fn get_stream_url(remote: String, path: String) -> Result<String, String>

   #[tauri::command]
   async fn get_rclone_cache_size() -> Result<String, String>

   #[tauri::command]
   async fn clear_rclone_cache() -> Result<(), String>
   ```

2. **Serve command builder**
   ```rust
   fn build_serve_args(remote: &str, port: u16) -> Vec<String> {
       let cache_dir = get_app_data_dir().join("rclone-cache");
       vec![
           "serve", "http", remote,
           "--addr", &format!("127.0.0.1:{}", port),
           "--read-only",
           "--vfs-cache-mode", "full",
           "--vfs-cache-max-size", "200G",
           "--vfs-cache-max-age", "24h",
           "--buffer-size", "256M",
           "--vfs-read-ahead", "256M",
           "--vfs-read-chunk-size", "64M",
           "--vfs-read-chunk-size-limit", "off",
           "--dir-cache-time", "72h",
           "--poll-interval", "15s",
           "--cache-dir", &cache_dir.to_string_lossy(),
           "--log-level", "INFO",
       ]
   }
   ```

3. **Auto-start serve when playing cloud media**
   - Start `rclone serve http` on first cloud play
   - Keep running during app session
   - Cleanup on app exit

3. **Update MPV playback for cloud files**
   - Detect cloud file by `remote:` prefix
   - Get HTTP URL from rclone serve
   - Pass HTTP URL to MPV instead of file path

#### Frontend Tasks:

1. **Seamless playback experience**
   - Same play button for local and cloud
   - Show buffering indicator if needed
   - Handle stream errors gracefully

---

### Phase 6: Cloud-Aware File Watcher

**Goal**: Detect changes in cloud storage

#### Implementation:
- Polling-based (like current local watcher)
- Configurable interval (default: 5 minutes for cloud vs 5 seconds for local)
- Use `rclone lsjson` with caching
- Emit same `library-updated` events

---

## Database Schema Changes

```sql
-- Add columns to media table
ALTER TABLE media ADD COLUMN is_remote INTEGER DEFAULT 0;
ALTER TABLE media ADD COLUMN remote_name TEXT;

-- New table for remotes
CREATE TABLE IF NOT EXISTS cloud_remotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    remote_type TEXT NOT NULL,  -- 'drive', 'onedrive', 'dropbox'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_scanned TEXT
);

-- New table for cloud media folders
CREATE TABLE IF NOT EXISTS cloud_media_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remote_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    folder_type TEXT NOT NULL,  -- 'movies', 'tv'
    FOREIGN KEY (remote_id) REFERENCES cloud_remotes(id)
);
```

---

## Config Changes

```json
{
  "media_folders": ["D:/Movies", "gdrive:Media/Movies"],
  "cloud_remotes": [
    {
      "name": "gdrive",
      "type": "drive",
      "display_name": "My Google Drive"
    }
  ],
  "rclone_serve_port": 8765,
  "rclone_cache_max_size": "200G",
  "rclone_cache_max_age": "24h",
  "cloud_scan_interval_minutes": 5
}
```

## Data Storage Updates

All data stored in `%APPDATA%/Slasshy/`:
- `media_library.db` - SQLite database
- `media_config.json` - User configuration
- `image_cache/` - Downloaded posters and thumbnails
- `rclone.conf` - Rclone remote configurations (OAuth tokens)
- `rclone-cache/` - VFS cache for streaming (up to 200GB)

---

## New Files to Create

### Backend (src-tauri/src/)
- `rclone.rs` - Rclone binary management, command execution
- `rclone_serve.rs` - HTTP server management for streaming
- `cloud_storage.rs` - Remote configuration, OAuth flow

### Frontend (src/)
- `components/CloudStorageSettings.tsx` - Cloud remote management UI
- `components/AddRemoteModal.tsx` - OAuth wizard for adding remotes
- `components/CloudFolderBrowser.tsx` - Browse cloud directories
- `services/rclone.ts` - Frontend API for rclone commands

---

## UI/UX Flow

### Adding Google Drive Remote

1. User opens Settings > Cloud Storage
2. Clicks "Add Cloud Storage"
3. Modal appears with provider options (Google Drive highlighted)
4. User clicks "Google Drive"
5. User enters a name (e.g., "My Drive")
6. User clicks "Connect"
7. System browser opens with Google OAuth page
8. User logs in and grants permissions
9. App detects success, shows "Connected!" message
10. User sees new remote in Cloud Storage list

### Playing Cloud Media

1. User browses Movies library (mixed local + cloud)
2. Cloud movies show small cloud icon badge
3. User clicks Play on cloud movie
4. App starts rclone serve if not running
5. MPV opens with HTTP stream URL
6. Progress saves normally to database

---

## Security Considerations

1. **OAuth tokens** - Stored in rclone config, encrypted by rclone
2. **Rclone config** - Stored in user's AppData, not accessible to other users
3. **HTTP serve** - Bound to localhost only, not exposed to network
4. **No credentials in logs** - Sanitize rclone output before logging

---

## Estimated Scope

| Phase | Complexity | New Files | Lines of Code (Est.) |
|-------|------------|-----------|---------------------|
| Phase 1: Binary Integration | Medium | 1 | 200-300 |
| Phase 2: Remote Config UI | High | 3 | 600-800 |
| Phase 3: Cloud Browsing | Medium | 2 | 400-500 |
| Phase 4: Cloud Indexing | High | 0 (modify existing) | 300-400 |
| Phase 5: Streaming | High | 1 | 400-500 |
| Phase 6: Cloud Watcher | Medium | 0 (modify existing) | 200-300 |

**Total estimate**: ~2000-2800 lines of new/modified code

---

## Decisions (Finalized)

1. **Rclone binary size** - YES, ~15MB acceptable

2. **OAuth credentials** - Use rclone's built-in OAuth credentials

3. **Initial provider support** - Google Drive only (OneDrive/Dropbox later)

4. **Mounting** - NO WinFsp/mount. Use HTTP serve exclusively (no driver installation)

5. **Caching/Streaming flags** - Use optimized VFS caching:
   ```
   --vfs-cache-mode full
   --vfs-cache-max-size 200G
   --vfs-cache-max-age 24h
   --buffer-size 256M
   --vfs-read-ahead 256M
   --vfs-read-chunk-size 64M
   --vfs-read-chunk-size-limit off
   --dir-cache-time 72h
   --poll-interval 15s
   --log-level INFO
   ```

6. **Offline handling** - Not supported. Cloud content is streaming-only (chunks downloaded on-demand). If offline, show error message.

---

## Dependencies to Add

### Rust (Cargo.toml)
```toml
# No new dependencies needed - using process spawning
```

### Tauri (tauri.conf.json)
```json
{
  "bundle": {
    "externalBin": ["binaries/rclone"]
  }
}
```

### Download Required
- `rclone.exe` v1.65+ from https://rclone.org/downloads/

---

## Rollout Plan

1. **Alpha**: Internal testing with Google Drive only
2. **Beta**: Add OneDrive + Dropbox, gather feedback
3. **Release**: Full cloud storage support with documentation
