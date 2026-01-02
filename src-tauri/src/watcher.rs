use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;
use tauri::Manager;
use chrono::Local;
use walkdir::WalkDir;
use notify_rust::Notification;

use crate::database;
use crate::media_manager::{self, MediaParseType};
use crate::AppState;

/// How often to scan for changes (in seconds)
/// 5 seconds provides near-instant detection with minimal CPU impact
const SCAN_INTERVAL_SECS: u64 = 5;

/// Video file extensions to track
const VIDEO_EXTENSIONS: &[&str] = &["mkv", "mp4", "avi", "mov", "webm", "m4v", "wmv", "flv", "ts", "m2ts"];

/// Normalize a path string for consistent comparison on Windows
/// Converts to lowercase and uses forward slashes
fn normalize_path(path: &str) -> String {
    path.to_lowercase().replace('\\', "/")
}

/// Helper macro for timestamped logging
macro_rules! watcher_log {
    ($level:expr, $($arg:tt)*) => {{
        println!("[WATCHER {} {}] {}", $level, Local::now().format("%H:%M:%S%.3f"), format!($($arg)*))
    }};
}

macro_rules! log_info {
    ($($arg:tt)*) => {{ watcher_log!("INFO ", $($arg)*) }};
}

macro_rules! log_action {
    ($($arg:tt)*) => {{ watcher_log!("ACTION", $($arg)*) }};
}

macro_rules! log_error {
    ($($arg:tt)*) => {{ watcher_log!("ERROR", $($arg)*) }};
}

/// Start the media folder tracker in a background thread.
/// Uses a simple polling approach: scan folders, compare with DB, sync differences.
pub fn start_watcher(app_handle: tauri::AppHandle) {
    println!("\n");
    log_info!("╔══════════════════════════════════════════════╗");
    log_info!("║     STARTING MEDIA FOLDER TRACKER            ║");
    log_info!("╚══════════════════════════════════════════════╝");

    // Get media folders from config
    let state = app_handle.state::<AppState>();
    let media_folders: Vec<String> = match state.config.lock() {
        Ok(c) => {
            log_info!("Config loaded successfully");
            c.media_folders.clone()
        }
        Err(e) => {
            log_error!("Failed to lock config: {}", e);
            return;
        }
    };

    if media_folders.is_empty() {
        log_info!("No media folders configured");
        log_info!("Add folders in Settings to enable tracking");
        return;
    }

    log_info!("Tracking {} folder(s):", media_folders.len());
    for (i, folder) in media_folders.iter().enumerate() {
        log_info!("  {}. {}", i + 1, folder);
    }

    // Spawn the tracker thread
    let handle = thread::Builder::new()
        .name("folder-tracker".into())
        .spawn(move || {
            log_info!("Tracker thread started");
            run_tracker_loop(app_handle, media_folders);
        });

    match handle {
        Ok(_) => log_info!("Tracker thread spawned successfully"),
        Err(e) => log_error!("Failed to spawn tracker thread: {}", e),
    }
}

fn run_tracker_loop(app_handle: tauri::AppHandle, media_folders: Vec<String>) {
    // Initial scan after short delay (let app fully initialize)
    thread::sleep(Duration::from_secs(3));

    println!("\n");
    log_info!("╔══════════════════════════════════════════════╗");
    log_info!("║     FOLDER TRACKER ACTIVE                    ║");
    log_info!("╠══════════════════════════════════════════════╣");
    log_info!("║  Scan interval: {}s (near-instant)            ║", SCAN_INTERVAL_SECS);
    log_info!("║  Formats: mkv,mp4,avi,mov,webm,m4v,wmv,flv   ║");
    log_info!("╚══════════════════════════════════════════════╝");
    println!("\n");

    let mut scan_count: u64 = 0;

    loop {
        scan_count += 1;
        log_info!("━━━ Scan #{} starting ━━━", scan_count);

        match perform_sync(&app_handle, &media_folders) {
            Ok((added, removed)) => {
                if added > 0 || removed > 0 {
                    log_info!("Scan #{} complete: {} added, {} removed", scan_count, added, removed);
                } else {
                    log_info!("Scan #{} complete: no changes", scan_count);
                }
            }
            Err(e) => {
                log_error!("Scan #{} failed: {}", scan_count, e);
            }
        }

        // Wait before next scan
        thread::sleep(Duration::from_secs(SCAN_INTERVAL_SECS));
    }
}

/// Perform a full sync between disk and database
fn perform_sync(app_handle: &tauri::AppHandle, media_folders: &[String]) -> Result<(usize, usize), String> {
    let db_path = database::get_database_path();
    let image_cache_dir = database::get_image_cache_dir();

    // Get fresh DB connection
    let db = database::Database::new(&db_path)
        .map_err(|e| format!("DB connection failed: {}", e))?;

    // Step 1: Get all video files currently on disk
    let files_on_disk = scan_all_video_files(media_folders);
    log_info!("Found {} video files on disk", files_on_disk.len());

    // Step 2: Get all file paths currently in database
    let files_in_db = db.get_all_file_paths()
        .map_err(|e| format!("Failed to get DB files: {}", e))?;
    log_info!("Found {} files tracked in database", files_in_db.len());

    // Create normalized sets for comparison (handles Windows path inconsistencies)
    let files_in_db_normalized: HashSet<String> = files_in_db
        .iter()
        .map(|p| normalize_path(p))
        .collect();

    // Map: normalized path -> original PathBuf (for disk files)
    let disk_paths_map: std::collections::HashMap<String, &PathBuf> = files_on_disk
        .iter()
        .map(|p| (normalize_path(&p.to_string_lossy()), p))
        .collect();

    // Map: normalized path -> original String (for DB files)
    let db_paths_map: std::collections::HashMap<String, &String> = files_in_db
        .iter()
        .map(|p| (normalize_path(p), p))
        .collect();

    // Step 3: Find new files (on disk but not in DB) - compare normalized paths
    let new_files: Vec<&PathBuf> = disk_paths_map
        .iter()
        .filter(|(normalized, _)| !files_in_db_normalized.contains(*normalized))
        .map(|(_, path)| *path)
        .collect();

    // Step 4: Find removed files (in DB but not on disk)
    let disk_normalized_set: HashSet<String> = disk_paths_map.keys().cloned().collect();

    let removed_files: Vec<&String> = db_paths_map
        .iter()
        .filter(|(normalized, _)| !disk_normalized_set.contains(*normalized))
        .map(|(_, path)| *path)
        .collect();

    log_info!("Changes: {} new, {} removed", new_files.len(), removed_files.len());

    let mut added_count = 0;
    let mut removed_count = 0;

    // Get config for API key
    let state = app_handle.state::<AppState>();
    let api_key = match state.config.lock() {
        Ok(c) => c.tmdb_api_key.clone().unwrap_or_default(),
        Err(_) => String::new(),
    };

    // Step 5: Index new files
    for path in &new_files {
        let filename = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        log_action!("+ NEW: {}", filename);

        if index_file(&db, path, &api_key, &image_cache_dir) {
            added_count += 1;

            // Notify frontend
            notify_frontend(app_handle, "added", filename);
        }
    }

    // Step 6: Remove deleted files
    for file_path in &removed_files {
        let filename = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        log_action!("- REMOVED: {}", filename);

        if remove_file(&db, file_path, &image_cache_dir) {
            removed_count += 1;

            // Notify frontend
            notify_frontend(app_handle, "removed", filename);
        }
    }

    // Step 7: Cleanup empty TV series
    if removed_count > 0 {
        if let Ok(removed_series) = db.cleanup_empty_series() {
            for (series_id, series_poster) in &removed_series {
                log_action!("- Removed empty series (ID: {})", series_id);
                cleanup_image(&image_cache_dir, series_poster);
            }
        }
    }

    Ok((added_count, removed_count))
}

/// Scan all media folders and return all video file paths
fn scan_all_video_files(media_folders: &[String]) -> Vec<PathBuf> {
    let mut video_files = Vec::new();

    for folder in media_folders {
        let path = Path::new(folder);
        if !path.exists() || !path.is_dir() {
            log_error!("Folder not accessible: {}", folder);
            continue;
        }

        for entry in WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let file_path = entry.path();
            if is_video_file(file_path) {
                video_files.push(file_path.to_path_buf());
            }
        }
    }

    video_files
}

/// Check if a path is a video file
fn is_video_file(path: &Path) -> bool {
    if path.is_dir() {
        return false;
    }

    let extension = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    VIDEO_EXTENSIONS.contains(&extension.as_str())
}

/// Index a new video file
fn index_file(db: &database::Database, path: &PathBuf, api_key: &str, image_cache_dir: &str) -> bool {
    let file_path = path.to_string_lossy().to_string();

    // Parse filename to extract title/year/season/episode
    let parsed = media_manager::parse_filename(path);
    if parsed.title.is_empty() {
        log_error!("Could not parse filename: {:?}", path.file_name());
        return false;
    }

    let media_type_str = if parsed.media_type == MediaParseType::TvEpisode {
        format!("TV S{:02}E{:02}",
            parsed.season.unwrap_or(1),
            parsed.episode.unwrap_or(1))
    } else {
        "Movie".to_string()
    };

    log_info!("  Indexing: \"{}\" ({})", parsed.title, media_type_str);

    // Process based on type
    if parsed.media_type == MediaParseType::TvEpisode {
        media_manager::process_tv_episode(db, &file_path, &parsed, api_key, image_cache_dir, 0.0);
    } else {
        media_manager::process_movie(db, &file_path, &parsed, api_key, image_cache_dir, 0.0);
    }

    true
}

/// Remove a file from database and cleanup images
fn remove_file(db: &database::Database, file_path: &str, image_cache_dir: &str) -> bool {
    match db.remove_media_by_file_path(file_path) {
        Ok(Some((_id, title, poster_path, still_path))) => {
            log_info!("  Removed from DB: \"{}\"", title);

            // Cleanup images
            cleanup_image(image_cache_dir, &poster_path);
            cleanup_image(image_cache_dir, &still_path);

            true
        }
        Ok(None) => {
            // Not in database, that's fine
            true
        }
        Err(e) => {
            log_error!("  Failed to remove from DB: {}", e);
            false
        }
    }
}

/// Notify frontend of changes and send Windows toast notification
fn notify_frontend(app_handle: &tauri::AppHandle, change_type: &str, title: &str) {
    // Send Windows toast notification
    let notification_title = if change_type == "added" { "Media Added" } else { "Media Removed" };
    let notification_body = if change_type == "added" {
        format!("Indexed: {}", title)
    } else {
        format!("Removed: {}", title)
    };

    // Send Windows notification
    if let Err(e) = Notification::new()
        .summary(notification_title)
        .body(&notification_body)
        .appname("Slasshy Media Indexer")
        .timeout(notify_rust::Timeout::Milliseconds(5000))
        .show()
    {
        log_error!("Failed to send Windows notification: {}", e);
    } else {
        log_info!("Windows notification sent: {}", notification_body);
    }

    // Also notify frontend (in-app notification)
    if let Some(window) = app_handle.get_window("main") {
        let _ = window.emit("library-updated", serde_json::json!({
            "type": change_type,
            "title": title,
        }));

        let notification_type = if change_type == "added" { "success" } else { "info" };

        let _ = window.emit("notification", serde_json::json!({
            "type": notification_type,
            "title": notification_title,
            "message": notification_body
        }));
    }
}

/// Cleanup cached image file
fn cleanup_image(image_cache_dir: &str, image_path: &Option<String>) {
    if let Some(path) = image_path {
        let full_path = if path.starts_with("image_cache/") {
            let filename = path.strip_prefix("image_cache/").unwrap_or(path);
            Path::new(image_cache_dir).join(filename)
        } else if path.starts_with("image_cache\\") {
            let filename = path.strip_prefix("image_cache\\").unwrap_or(path);
            Path::new(image_cache_dir).join(filename)
        } else {
            Path::new(image_cache_dir).join(path)
        };

        if full_path.exists() {
            if let Err(e) = std::fs::remove_file(&full_path) {
                log_error!("Failed to delete image: {}", e);
            }
        }
    }
}
