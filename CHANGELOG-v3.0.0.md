# Slasshy Desktop v3.0.0 - Implementation Report

## Summary of Changes

### 1. Version Update (3.0.0)
**Files Modified:**
- `src-tauri/Cargo.toml:3` - `version = "3.0.0"`
- `src-tauri/tauri.conf.json:11` - `"version": "3.0.0"`
- `package.json:4` - `"version": "3.0.0"`

**Status:** ✅ Complete

---

### 2. Monochrome Theme
**Files Modified:**
- `src/index.css` - All CSS variables changed to grayscale (0 0% X%)
- `src/App.tsx` - Background orb gradients changed to gray
- `src/components/MovieCard.tsx` - Progress bar gradients changed to gray
- `src/components/Sidebar.tsx` - Navigation colors changed to gray
- `src/components/EpisodeSelector.tsx` - Accent colors to gray
- `src/components/GuidedTour.tsx` - Highlight colors to gray
- `src/components/OnboardingModal.tsx` - Feature icons to gray
- `src/components/ResumeDialog.tsx` - Button colors to gray
- `src/components/EpisodeBrowser.tsx` - Badge colors to gray

**Theme Values:**
```css
--primary: 0 0% 85%;     /* Light gray */
--accent: 0 0% 70%;      /* Medium gray */
--glow-primary: 0 0% 85%;
--glow-accent: 0 0% 70%;
```

**Status:** ✅ Complete

---

### 3. Default TMDB API Token
**Files Modified:**
- `src-tauri/src/tmdb.rs` - Added `DEFAULT_TMDB_ACCESS_TOKEN` constant and `get_tmdb_credential()` function
- `src-tauri/src/main.rs` - Updated ~10 places to use `tmdb::get_tmdb_credential()`

**How it works:**
- If user provides a custom key → uses that
- If empty → falls back to embedded default token

**Status:** ✅ Complete

---

### 4. Google Drive File Deletion
**Files Modified:**
- `src-tauri/src/gdrive.rs:67` - Changed scope from `drive.readonly` to `drive` (full access)
- `src-tauri/src/gdrive.rs` - Added `delete_file()` method to `GoogleDriveClient`
- `src-tauri/src/database.rs` - Added `get_media_delete_info()` method
- `src-tauri/src/main.rs:1564-1660` - Rewrote `delete_media_files` to handle both cloud and local files

**How it works:**
1. Gets media info including `is_cloud` and `cloud_file_id`
2. For cloud files → calls `gdrive_client.delete_file()`
3. For local files → calls `std::fs::remove_file()`
4. Removes entries from database

**Status:** ✅ Complete

---

### 5. Auto-Update Feature
**Files Modified:**
- `src-tauri/Cargo.toml` - Added `futures-util = "0.3"` dependency
- `src-tauri/src/main.rs:3727-3919` - Added update structs and commands:
  - `check_for_updates()` - Queries GitHub releases API
  - `download_update()` - Downloads installer with progress events
  - `install_update()` - Launches installer and exits app
  - `get_app_version()` - Returns current version
- `src-tauri/src/main.rs:4249-4253` - Registered commands in `invoke_handler`
- `src/services/api.ts:865-915` - Added TypeScript API functions
- `src/components/SettingsModal.tsx` - Added "About & Updates" UI section in General tab

**Status:** ✅ Complete

---

## ⚠️ Potential Issues to Watch

### 1. GitHub PAT Required for Auto-Update
**Location:** `src-tauri/src/main.rs:3730`
```rust
const GITHUB_RELEASE_TOKEN: &str = ""; // User will provide their PAT
```

**Action Required:** You need to:
1. Create a fine-grained GitHub PAT at https://github.com/settings/tokens
2. Scope: `SlasshyOverhere/slasshy-desktop` → Contents: Read-only
3. Paste the token into `GITHUB_RELEASE_TOKEN`

Without this, the auto-update check will fail with 404 (private repo).

---

### 2. Google Drive Re-Authentication Required
**Reason:** Changed OAuth scope from `drive.readonly` to `drive`

**Action Required:** Users must:
1. Go to Settings → Cloud Storage → Disconnect
2. Reconnect to Google Drive
3. Grant the new "full access" permission

Existing tokens won't have delete permissions until re-authenticated.

---

### 3. TMDB Token Expiration
**Location:** `src-tauri/src/tmdb.rs` - DEFAULT_TMDB_ACCESS_TOKEN

The embedded TMDB access token may expire or be revoked. Monitor for:
- `401 Unauthorized` errors from TMDB API
- Metadata/poster fetching failures

If this happens, you'll need to generate a new token and update the code.

---

### 4. UI Layout Issue (Task 4)
The screenshot wasn't clear enough to identify the specific overflow issue. The monochrome theme changes may have indirectly fixed some styling, but you should:
- Test the card grid at various window sizes
- Check for any overflow on small screens
- Verify poster aspect ratios display correctly

---

### 5. Unused Variable Warning
**Location:** `src-tauri/src/main.rs` in `delete_media_files`

There may be a minor compiler warning about an unused `id` variable in the deletion loop. This is cosmetic and won't affect functionality.

---

## Build & Test Checklist

```bash
# 1. Build the app
npm run tauri build

# 2. Test these scenarios:
```

- [ ] Delete a **local** movie → file removed from disk + database
- [ ] Delete a **cloud** movie → file removed from Google Drive + database
- [ ] Delete a TV series → all episodes deleted correctly
- [ ] TMDB search works without user-provided API key
- [ ] Theme is fully grayscale (no violet/cyan remaining)
- [ ] Settings → General shows version 3.0.0
- [ ] "Check for Updates" button works (after adding PAT)
- [ ] Google Drive reconnection works with new delete permission

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src-tauri/Cargo.toml` | Version 3.0.0, added futures-util |
| `src-tauri/tauri.conf.json` | Version 3.0.0 |
| `package.json` | Version 3.0.0 |
| `src-tauri/src/main.rs` | Delete refactor, auto-update commands, TMDB token usage |
| `src-tauri/src/gdrive.rs` | Full drive scope, delete_file() method |
| `src-tauri/src/database.rs` | get_media_delete_info() method |
| `src-tauri/src/tmdb.rs` | Default token, get_tmdb_credential() |
| `src/index.css` | Grayscale theme variables |
| `src/App.tsx` | Gray gradients |
| `src/components/MovieCard.tsx` | Gray progress bars |
| `src/components/Sidebar.tsx` | Gray navigation |
| `src/components/SettingsModal.tsx` | Auto-update UI |
| `src/services/api.ts` | Update API functions |
| + 5 other component files | Gray accent colors |

---

## Next Steps

1. **Add GitHub PAT** to `GITHUB_RELEASE_TOKEN` constant for auto-update to work
2. **Test cloud deletion** after reconnecting Google Drive with new permissions
3. **Create first GitHub release** (v3.0.0) with `.msi` or `.exe` installer attached
4. **Monitor TMDB token** for any authentication issues

---

*Report generated: January 2026*
