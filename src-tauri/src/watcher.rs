use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::Manager;

use crate::database;
use crate::media_manager::{self, MediaParseType};
use crate::AppState;

pub struct MediaWatcher {
    watcher: Option<RecommendedWatcher>,
    receiver: Option<Receiver<notify::Result<Event>>>,
    watched_paths: Vec<String>,
}

impl MediaWatcher {
    pub fn new() -> Self {
        MediaWatcher {
            watcher: None,
            receiver: None,
            watched_paths: Vec::new(),
        }
    }

    pub fn start(&mut self, app_handle: tauri::AppHandle) {
        let (tx, rx) = channel();
        
        // Initialize watcher
        let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
            Ok(w) => w,
            Err(e) => {
                println!("[WATCHER] Failed to create watcher: {}", e);
                return;
            }
        };

        let state = app_handle.state::<AppState>();
        let config = match state.config.lock() {
            Ok(c) => c.clone(),
            Err(_) => return,
        };

        // Watch all media folders
        for folder in &config.media_folders {
            if Path::new(folder).exists() {
                if let Err(e) = watcher.watch(Path::new(folder), RecursiveMode::Recursive) {
                    println!("[WATCHER] Failed to watch {}: {}", folder, e);
                } else {
                    println!("[WATCHER] Started monitoring: {}", folder);
                    self.watched_paths.push(folder.clone());
                }
            }
        }

        // Move watcher and rx to background thread
        let watcher = Arc::new(Mutex::new(watcher));
        let watcher_clone = watcher.clone(); // Keep alive

        thread::spawn(move || {
            // Keep the watcher alive by moving it into this thread scope if needed, 
            // but actually we just need to process the channel
            let _keep_alive = watcher_clone;
            
            println!("[WATCHER] Monitoring thread started");
            
            loop {
                match rx.recv_timeout(Duration::from_secs(1)) {
                    Ok(Ok(event)) => {
                        handle_file_event(event, &app_handle);
                    }
                    Ok(Err(e)) => {
                        println!("[WATCHER] Watch error: {}", e);
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        // Just a timeout, continue loop
                        continue;
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        println!("[WATCHER] Channel disconnected");
                        break;
                    }
                }
            }
        });
    }
}

fn handle_file_event(event: Event, app_handle: &tauri::AppHandle) {
    // Only care about Create and Modify events
    match event.kind {
        EventKind::Create(_) | EventKind::Modify(_) => {
            for path in event.paths {
                if is_video_file(&path) {
                    println!("[WATCHER] File change detected: {:?}", path);
                    
                    // Simple debounce/wait for file write to complete
                    thread::sleep(Duration::from_secs(2));
                    
                    process_file_change(path, app_handle);
                }
            }
        }
        _ => {}
    }
}

fn is_video_file(path: &Path) -> bool {
    let extension = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    
    matches!(extension.as_str(), "mkv" | "mp4" | "avi" | "mov" | "webm")
}

fn process_file_change(path: PathBuf, app_handle: &tauri::AppHandle) {
    let state = app_handle.state::<AppState>();
    let db_path = database::get_database_path();
    
    // Create a fresh DB connection
    let db = match database::Database::new(&db_path) {
        Ok(db) => db,
        Err(e) => {
            println!("[WATCHER] Failed to connect to DB: {}", e);
            return;
        }
    };
    
    let config = match state.config.lock() {
        Ok(c) => c.clone(),
        Err(_) => return,
    };
    
    let api_key = config.tmdb_api_key.unwrap_or_default();
    let image_cache_dir = database::get_image_cache_dir();
    
    let file_path = path.to_string_lossy().to_string();
    
    // Parse filename
    let parsed = media_manager::parse_filename(&path);
    if parsed.title.is_empty() {
        return;
    }
    
    println!("[WATCHER] Processing: {}", parsed.title);
    
    // Process based on type
    if parsed.media_type == MediaParseType::TvEpisode {
        media_manager::process_tv_episode(&db, &file_path, &parsed, &api_key, &image_cache_dir, 0.0);
    } else {
        media_manager::process_movie(&db, &file_path, &parsed, &api_key, &image_cache_dir, 0.0);
    }
    
    // Notify frontend
    if let Some(window) = app_handle.get_window("main") {
        let _ = window.emit("scan-complete", ()); // Refresh library
        // Send notification
        let _ = window.emit("notification", format!("Successfully indexed: {}", parsed.title));
    }
}
