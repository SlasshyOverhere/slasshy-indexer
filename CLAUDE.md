# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm install

# Development mode (starts both Vite dev server and Tauri)
npm run tauri dev

# Build for production
npm run tauri build

# Frontend only (Vite dev server at localhost:3000)
npm run dev

# TypeScript check and build frontend
npm run build

# Lint TypeScript/React code
npx eslint src/
```

## Architecture

Slasshy Desktop is a Tauri application with a React frontend and Rust backend for managing local media libraries.

### Tech Stack
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Radix UI, Framer Motion
- **Backend**: Rust, Tauri v1
- **Database**: SQLite (rusqlite with bundled feature)
- **Playback**: MPV via Windows named pipes IPC
- **Metadata**: TMDB API (supports both API keys and access tokens)

### Backend (src-tauri/src/)

| File | Purpose |
|------|---------|
| `main.rs` | Tauri commands (40+), app state management, system tray, event handlers |
| `database.rs` | SQLite schema and operations, app data paths (%APPDATA%/Slasshy/) |
| `media_manager.rs` | Media folder scanning, file parsing, orphan cleanup |
| `watcher.rs` | Polling-based file watcher (5-second interval), Windows notifications |
| `tmdb.rs` | TMDB API client, metadata fetching, image downloading |
| `mpv_ipc.rs` | MPV process management, progress tracking via named pipes |
| `config.rs` | Configuration loading/saving (JSON) |

### Frontend (src/)

| Path | Purpose |
|------|---------|
| `App.tsx` | Main app component, view routing, state management |
| `services/api.ts` | Tauri command invocations, TypeScript interfaces |
| `components/` | UI components (MovieCard, EpisodeBrowser, SettingsModal, etc.) |
| `components/ui/` | Radix UI primitives (shadcn/ui pattern) |

### Key Patterns

**Tauri Commands**: All backend operations are exposed as `#[tauri::command]` functions in `main.rs`. Frontend calls them via `invoke()` from `@tauri-apps/api/tauri`.

**App State**: Shared state uses `tauri::State<AppState>` with Mutex-protected fields:
- `db`: Database connection
- `config`: Runtime configuration
- `is_scanning`: Atomic scan status
- `active_mpv_sessions`: Active player sessions
- `watcher_enabled`: File watcher toggle

**Events**: Backend-to-frontend communication uses Tauri events (`scan-progress`, `scan-complete`, `mpv-playback-ended`, `library-updated`, `notification`).

**Image Caching**: Posters/stills are downloaded to `%APPDATA%/Slasshy/image_cache/` and served via Tauri's asset protocol.

### Media Types

- `movie` - Movies (single file)
- `tvshow` - TV series (container with episodes)
- `tvepisode` - Individual episode (linked to tvshow via `parent_id`)

### Data Storage

All data is stored in `%APPDATA%/Slasshy/`:
- `media_library.db` - SQLite database
- `media_config.json` - User configuration
- `image_cache/` - Downloaded posters and thumbnails

### Vite Path Alias

`@` is aliased to `src/` in vite.config.ts. Use `@/components/...` for imports.
