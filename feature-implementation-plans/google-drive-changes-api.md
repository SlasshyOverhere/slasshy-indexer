# Google Drive Changes API Integration Report

## Overview
This report details the technical implementation and advantages of using the **Google Drive API Changes Resource** (`changes.list`) for detecting file modifications. This technology is already partially implemented in our backend (`gdrive.rs`) and offers a significantly more efficient alternative to the "polling-based" approach originally described in Phase 6 of the Rclone Integration Plan.

## The Technology: Google Drive Changes API

The Changes API allows applications to track changes to a user's Drive (including Shared Drives) efficiently. Instead of repeatedly listing all files to check for modifications (which is slow and expensive), the app requests only what has changed since a specific point in time.

### Core Mechanism: Token Exchange
1.  **Start Page Token**: The app initially calls `changes.getStartPageToken` to get a token representing the *current state* of the drive. This token does not expire.
2.  **Delta Sync**: To check for updates, the app calls `changes.list` providing the saved `page_token`.
3.  **Response**: Google returns a list of `changes` (added, modified, or deleted files) and a **new** `nextPageToken` or `newStartPageToken`.
4.  **Loop**: The app saves the new token and waits for the next poll interval.

### Key Features
-   **Efficiency**: Payload size is minimal; only changed files are returned.
-   **Persistence**: The `startPageToken` allows tracking changes across app restarts.
-   **Shared Drives**: Supported via `includeItemsFromAllDrives=true`.
-   **Deletions**: Explicitly reports when a file is `removed`, allowing for accurate database cleanup.

## Current Implementation Status

The backend module `src-tauri/src/gdrive.rs` already contains the necessary logic to interact with this API.

### Existing Functions
-   `get_changes_start_token()`: Fetches the initial token.
-   `get_changes(page_token)`: Lists raw changes since the provided token.
-   `get_video_changes(page_token)`: A specialized helper that filters the changes specifically for video MIME types (`video/mp4`, `video/x-matroska`, etc.), returning a list of new/modified video files and the next token.

### Missing Components (Action Items)
While the *API wrapper* exists, the *application logic* to use it is not yet fully hooked up to the file watcher system.
1.  **Persistence**: We need to store the `latest_change_token` in `media_config.json` or the database.
2.  **Scheduler**: A background task (in `main.rs` or `media_manager.rs`) needs to call `get_video_changes` periodically (e.g., every 60 seconds).
3.  **Event Handling**: When changes are detected:
    -   **New/Modified**: Trigger `index_file()` for the new items.
    -   **Removed**: Remove the entry from the local database.

## Comparison: Changes API vs. Rclone Polling

| Feature | Rclone Polling (Old Plan) | Changes API (New Plan) |
| :--- | :--- | :--- |
| **Method** | `rclone lsjson -R` (List ALL files) | `changes.list` (List ONLY deltas) |
| **Bandwidth** | High (scales with library size) | Very Low (scales with activity) |
| **Speed** | Slow (minutes for large drives) | Instant (< 1 sec) |
| **API Quota** | High consumption | Minimal consumption |
| **Reliability** | Good | Excellent |
| **Complexity** | Low | Medium (requires token state mgmt) |

## Implementation Plan (Revised Phase 6)

### 1. Database/Config Update
-   Add a field to store the `gdrive_change_token` (String).

### 2. Initialization Logic
-   On app start (or first Google Drive connect):
    -   If no token exists: Call `get_changes_start_token()` and save it.
    -   Perform a full initial scan (using `list_video_files`).

### 3. Background Watcher
-   Create a lightweight tokio task that runs every **60 seconds** (configurable).
-   Read `gdrive_change_token`.
-   Call `gdrive.get_video_changes(token)`.
-   **If changes found**:
    -   Process additions: Add to Library DB.
    -   Process removals: Remove from Library DB.
    -   Emit `library-updated` event to frontend.
    -   **Crucial**: Save the new `new_start_page_token` to config.

### 4. Shared Drive Support
-   Ensure `includeItemsFromAllDrives=true` and `supportsAllDrives=true` are passed in `gdrive.rs` (currently `includeRemoved=true` and `spaces=drive` are used, might need updating for specific Shared Drive support if `driveId` is required).

## Recommendation
**Adopt the Changes API immediately.** The code is 80% written. It provides a "native" feel to cloud storage sync, where files appear almost instantly after being added to Drive, without the heavy overhead of full folder scans.
