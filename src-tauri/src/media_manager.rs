use regex::Regex;
use std::path::Path;
use walkdir::WalkDir;
use serde::Serialize;

use crate::config::Config;
use crate::database::Database;
use crate::tmdb;

const VIDEO_EXTENSIONS: &[&str] = &[".mkv", ".mp4", ".avi", ".mov", ".webm", ".m4v", ".wmv", ".flv"];

#[derive(Debug, Clone)]
pub struct ParsedMedia {
    pub title: String,
    pub year: Option<i32>,
    pub media_type: MediaParseType,
    pub season: Option<i32>,
    pub episode: Option<i32>,
    pub episode_end: Option<i32>,  // For multi-episode files like S01E01-E03
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum MediaParseType {
    Movie,
    TvEpisode,
}

/// Folder context for smarter detection
#[derive(Debug, Clone)]
struct FolderContext {
    /// Name extracted from parent folder (e.g., "Breaking Bad" from "Breaking Bad/Season 1/")
    series_name: Option<String>,
    /// Year extracted from folder name
    series_year: Option<i32>,
    /// Season number from folder like "Season 1" or "S01"
    folder_season: Option<i32>,
    /// Whether this appears to be a TV show folder structure
    is_tv_structure: bool,
}

#[derive(Clone, Serialize)]
struct ScanProgressPayload {
    title: String,
    media_type: String,
    current: usize,
    total: usize,
}

/// Cleanup orphaned media entries (files that no longer exist on disk)
fn cleanup_orphaned_media(db: &Database, image_cache_dir: &str) {
    println!("[CLEANUP] Checking for orphaned media entries...");
    
    let all_media = match db.get_all_media() {
        Ok(items) => items,
        Err(e) => {
            println!("[CLEANUP] Error getting media list: {}", e);
            return;
        }
    };
    
    let mut removed_count = 0;
    let mut cleaned_images: std::collections::HashSet<String> = std::collections::HashSet::new();
    
    for item in all_media {
        if let Some(ref file_path) = item.file_path {
            // Check if this is a virtual path (used for consolidated TV shows)
            let is_virtual_path = file_path.starts_with("tvshow://");
            
            let should_remove = if item.media_type == "tvshow" {
                if is_virtual_path {
                    // For virtual paths, check if the TV show has any episodes left
                    // If it has no episodes, it's orphaned
                    match db.get_episodes(item.id) {
                        Ok(episodes) => episodes.is_empty(),
                        Err(_) => true, // Assume orphaned if we can't check
                    }
                } else {
                    // For real folder paths, check if the folder exists
                    let path = Path::new(file_path);
                    !path.is_dir() && !path.exists()
                }
            } else {
                // For movie/tvepisode entries, check if the file exists
                let path = Path::new(file_path);
                !path.is_file()
            };
            
            if should_remove {
                println!("[CLEANUP] Removing orphaned entry: {} ({})", item.title, file_path);
                
                // If it's a TV show, also remove its episodes
                if item.media_type == "tvshow" {
                    if let Err(e) = db.remove_series_episodes(item.id) {
                        println!("[CLEANUP] Error removing episodes: {}", e);
                    }
                }
                
                // Remove the media entry and get the poster path
                match db.remove_media(item.id) {
                    Ok(Some(poster_path)) => {
                        cleaned_images.insert(poster_path);
                    }
                    Ok(None) => {}
                    Err(e) => {
                        println!("[CLEANUP] Error removing media: {}", e);
                    }
                }
                
                removed_count += 1;
            }
        }
    }
    
    // Now clean up orphaned images (images not referenced by any media)
    if let Ok(used_posters) = db.get_all_poster_paths() {
        let used_set: std::collections::HashSet<String> = used_posters.into_iter().collect();
        
        // Read all files in image cache directory
        if let Ok(entries) = std::fs::read_dir(image_cache_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let file_name = entry.file_name().to_string_lossy().to_string();
                let poster_path = format!("image_cache/{}", file_name);
                
                // If this image is not in use by any media, delete it
                if !used_set.contains(&poster_path) {
                    println!("[CLEANUP] Removing orphaned image: {}", file_name);
                    if let Err(e) = std::fs::remove_file(entry.path()) {
                        println!("[CLEANUP] Error removing image: {}", e);
                    }
                }
            }
        }
    }
    
    if removed_count > 0 {
        println!("[CLEANUP] Removed {} orphaned entries", removed_count);
    } else {
        println!("[CLEANUP] No orphaned entries found");
    }
}

// New function with event emissions
pub fn scan_media_folders_with_events(
    db: &Database, 
    config: &Config, 
    image_cache_dir: &str, 
    window: &tauri::Window
) {
    println!("[SCAN] Starting media scan with events...");
    
    // First, cleanup orphaned media entries
    cleanup_orphaned_media(db, image_cache_dir);
    
    let api_key = config.tmdb_api_key.clone().unwrap_or_default();
    if api_key.is_empty() {
        println!("[SCAN] WARNING: TMDB API Key is empty! Metadata/posters will not be fetched.");
    } else {
        println!("[SCAN] TMDB API Key is configured.");
    }
    
    // First, count total files to scan
    let mut total_files = 0;
    for folder in &config.media_folders {
        if !Path::new(folder).exists() {
            continue;
        }
        for entry in WalkDir::new(folder)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let extension = entry.path().extension()
                .and_then(|e| e.to_str())
                .map(|e| format!(".{}", e.to_lowercase()))
                .unwrap_or_default();
            if VIDEO_EXTENSIONS.contains(&extension.as_str()) {
                total_files += 1;
            }
        }
    }
    
    println!("[SCAN] Found {} video files to process", total_files);
    
    let mut current = 0;
    
    for folder in &config.media_folders {
        if !Path::new(folder).exists() {
            println!("[SCAN] Folder does not exist: {}", folder);
            continue;
        }
        
        println!("[SCAN] Scanning folder: {}", folder);
        
        for entry in WalkDir::new(folder)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let path = entry.path();
            let extension = path.extension()
                .and_then(|e| e.to_str())
                .map(|e| format!(".{}", e.to_lowercase()))
                .unwrap_or_default();
            
            if !VIDEO_EXTENSIONS.contains(&extension.as_str()) {
                continue;
            }
            
            current += 1;
            let file_path = path.to_string_lossy().to_string();
            
            // Skip if already indexed
            if db.media_exists(&file_path).unwrap_or(false) {
                println!("[SCAN] Already indexed: {}", file_path);
                continue;
            }
            
            // Parse filename
            let parsed = parse_filename(path);
            if parsed.title.is_empty() {
                println!("[SCAN] Could not parse: {}", file_path);
                continue;
            }
            
            println!("[SCAN] Processing {}/{}: {} - Type: {:?}", current, total_files, parsed.title, parsed.media_type);
            
            // Emit progress event
            let _ = window.emit("scan-progress", ScanProgressPayload {
                title: parsed.title.clone(),
                media_type: if parsed.media_type == MediaParseType::Movie { "movie" } else { "tv" }.to_string(),
                current,
                total: total_files,
            });
            
            // Get duration (skip for now, would need ffprobe or similar)
            let duration = 0.0;
            
            // Process based on type
            if parsed.media_type == MediaParseType::TvEpisode {
                process_tv_episode(db, &file_path, &parsed, &api_key, image_cache_dir, duration);
            } else {
                process_movie(db, &file_path, &parsed, &api_key, image_cache_dir, duration);
            }
        }
    }
    
    println!("[SCAN] Media scan complete. Processed {} files.", current);
}

// Keep the original function for backward compatibility
pub fn scan_media_folders(db: &Database, config: &Config, image_cache_dir: &str) {
    println!("Starting media scan...");
    
    let api_key = config.tmdb_api_key.clone().unwrap_or_default();
    
    for folder in &config.media_folders {
        if !Path::new(folder).exists() {
            println!("Folder does not exist: {}", folder);
            continue;
        }
        
        println!("Scanning folder: {}", folder);
        
        for entry in WalkDir::new(folder)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let path = entry.path();
            let extension = path.extension()
                .and_then(|e| e.to_str())
                .map(|e| format!(".{}", e.to_lowercase()))
                .unwrap_or_default();
            
            if !VIDEO_EXTENSIONS.contains(&extension.as_str()) {
                continue;
            }
            
            let file_path = path.to_string_lossy().to_string();
            
            // Skip if already indexed
            if db.media_exists(&file_path).unwrap_or(false) {
                continue;
            }
            
            // Parse filename
            let parsed = parse_filename(path);
            if parsed.title.is_empty() {
                println!("Could not parse: {}", file_path);
                continue;
            }
            
            // Get duration (skip for now, would need ffprobe or similar)
            let duration = 0.0;
            
            // Process based on type
            if parsed.media_type == MediaParseType::TvEpisode {
                process_tv_episode(db, &file_path, &parsed, &api_key, image_cache_dir, duration);
            } else {
                process_movie(db, &file_path, &parsed, &api_key, image_cache_dir, duration);
            }
        }
    }
    
    println!("Media scan complete.");
}

pub fn process_movie(
    db: &Database,
    file_path: &str,
    parsed: &ParsedMedia,
    api_key: &str,
    image_cache_dir: &str,
    duration: f64,
) {
    let mut title = parsed.title.clone();
    let mut year = parsed.year;
    let mut overview: Option<String> = None;
    let mut poster_path: Option<String> = None;
    let mut tmdb_id: Option<String> = None;
    
    // Fetch TMDB metadata
    if !api_key.is_empty() {
        if let Ok(Some(metadata)) = tmdb::search_metadata(
            api_key,
            &parsed.title,
            "movie",
            parsed.year,
            image_cache_dir,
        ) {
            title = metadata.title;
            year = metadata.year;
            overview = metadata.overview;
            poster_path = metadata.poster_path;
            tmdb_id = metadata.tmdb_id;
        }
    }
    
    match db.insert_movie(
        &title,
        year,
        overview.as_deref(),
        poster_path.as_deref(),
        file_path,
        duration,
        tmdb_id.as_deref(),
    ) {
        Ok(_) => println!("Indexed Movie: {}", title),
        Err(e) => println!("Error indexing movie {}: {}", title, e),
    }
}

pub fn process_tv_episode(
    db: &Database,
    file_path: &str,
    parsed: &ParsedMedia,
    api_key: &str,
    image_cache_dir: &str,
    duration: f64,
) {
    println!("[TV] Processing episode: {} S{:02}E{:02} from file: {}",
             parsed.title, parsed.season.unwrap_or(0), parsed.episode.unwrap_or(0), file_path);

    // First, try to find an existing series with a matching title BEFORE searching TMDB
    // This ensures episodes group together even if TMDB search is inconsistent
    let existing_series = db.find_series_by_tmdb_or_title(None, &parsed.title, parsed.year);

    let (series_title, series_year, series_overview, series_poster_path, series_tmdb_id, series_id) =
        if let Ok(Some(existing_id)) = existing_series {
            // Found existing series - use its data
            println!("[TV] Found existing series by title match (ID: {})", existing_id);
            if let Ok(existing) = db.get_media_by_id(existing_id) {
                (
                    existing.title.clone(),
                    existing.year,
                    existing.overview.clone(),
                    existing.poster_path.clone(),
                    existing.tmdb_id.clone(),
                    Some(existing_id)
                )
            } else {
                (parsed.title.clone(), parsed.year, None, None, None, Some(existing_id))
            }
        } else {
            // No existing series - search TMDB
            let mut title = parsed.title.clone();
            let mut year = parsed.year;
            let mut overview: Option<String> = None;
            let mut poster_path: Option<String> = None;
            let mut tmdb_id: Option<String> = None;

            if !api_key.is_empty() {
                if let Ok(Some(metadata)) = tmdb::search_metadata(
                    api_key,
                    &parsed.title,
                    "tv",
                    parsed.year,
                    image_cache_dir,
                ) {
                    title = metadata.title;
                    year = metadata.year;
                    overview = metadata.overview;
                    poster_path = metadata.poster_path;
                    tmdb_id = metadata.tmdb_id;
                }
            }

            (title, year, overview, poster_path, tmdb_id, None)
        };

    // Now get or create the series
    let final_series_id = if let Some(id) = series_id {
        // Already have the series ID
        id
    } else {
        // Try to find by TMDB ID first (in case TMDB gave us an ID that matches an existing series)
        match db.find_series_by_tmdb_or_title(
            series_tmdb_id.as_deref(),
            &series_title,
            series_year
        ) {
            Ok(Some(id)) => {
                println!("[TV] Found existing series after TMDB lookup (ID: {}): {}", id, series_title);

                // Update metadata if needed
                if let Some(ref tmdb_id) = series_tmdb_id {
                    if let Ok(existing) = db.get_media_by_id(id) {
                        if existing.tmdb_id.is_none() || existing.poster_path.is_none() {
                            let metadata = tmdb::TmdbMetadata {
                                title: series_title.clone(),
                                year: series_year,
                                overview: series_overview.clone(),
                                poster_path: series_poster_path.clone(),
                                tmdb_id: Some(tmdb_id.clone()),
                            };
                            if let Err(e) = db.update_metadata(id, &metadata) {
                                println!("[TV] Warning: Failed to update series metadata: {}", e);
                            }
                        }
                    }
                }
                id
            }
            Ok(None) => {
                // Create new series
                let virtual_folder = format!("tvshow://{}/{}",
                    series_tmdb_id.as_deref().unwrap_or("unknown"),
                    series_title.to_lowercase().replace(' ', "_")
                );

                match db.insert_tvshow(
                    &series_title,
                    series_year,
                    series_overview.as_deref(),
                    series_poster_path.as_deref(),
                    &virtual_folder,
                    series_tmdb_id.as_deref(),
                ) {
                    Ok(id) => {
                        println!("[TV] Created new series (ID: {}): {}", id, series_title);
                        id
                    }
                    Err(e) => {
                        println!("[TV] Error creating series {}: {}", series_title, e);
                        return;
                    }
                }
            }
            Err(e) => {
                println!("[TV] Error finding series: {}", e);
                return;
            }
        }
    };

    // Insert episode
    let season = parsed.season.unwrap_or(1);
    let episode = parsed.episode.unwrap_or(1);
    let ep_title = format!("S{:02}E{:02}", season, episode);

    match db.insert_episode(&ep_title, file_path, final_series_id, season, episode, duration) {
        Ok(_) => println!("[TV] Indexed Episode: {} - {} (series_id: {})", series_title, ep_title, final_series_id),
        Err(e) => println!("[TV] Error indexing episode {}: {}", ep_title, e),
    }
}

pub fn parse_filename(path: &Path) -> ParsedMedia {
    let filename = path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    println!("[PARSE] Parsing filename: '{}'", filename);

    // Get folder context for smarter detection
    let folder_ctx = analyze_folder_structure(path);
    println!("[PARSE] Folder context: series_name={:?}, folder_season={:?}, is_tv={}",
             folder_ctx.series_name, folder_ctx.folder_season, folder_ctx.is_tv_structure);

    // Try to parse as TV episode first (more specific patterns)
    if let Some(parsed) = try_parse_tv_episode(filename, &folder_ctx) {
        println!("[PARSE] Detected as TV: title='{}', S{:02}E{:02}",
                 parsed.title, parsed.season.unwrap_or(0), parsed.episode.unwrap_or(0));
        return parsed;
    }

    // If folder structure suggests TV show but no episode pattern found,
    // still treat it as a potential episode using folder context
    if folder_ctx.is_tv_structure {
        if let Some(parsed) = try_parse_from_folder_context(filename, &folder_ctx) {
            println!("[PARSE] Detected as TV (from folder): title='{}', S{:02}E{:02}",
                     parsed.title, parsed.season.unwrap_or(0), parsed.episode.unwrap_or(0));
            return parsed;
        }
    }

    // Parse as movie
    let movie = parse_as_movie(filename);
    println!("[PARSE] Detected as Movie: title='{}', year={:?}", movie.title, movie.year);
    movie
}

/// Analyze the folder structure to extract series name, season, and determine if it's a TV structure
fn analyze_folder_structure(path: &Path) -> FolderContext {
    let mut ctx = FolderContext {
        series_name: None,
        series_year: None,
        folder_season: None,
        is_tv_structure: false,
    };

    let parent = match path.parent() {
        Some(p) => p,
        None => return ctx,
    };

    let parent_name = parent.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    // Check if parent is a "Season X" folder
    let season_patterns = [
        Regex::new(r"(?i)^Season\s*(\d{1,2})$").ok(),
        Regex::new(r"(?i)^S(\d{1,2})$").ok(),
        Regex::new(r"(?i)^Series\s*(\d{1,2})$").ok(),
        Regex::new(r"(?i)^Staffel\s*(\d{1,2})$").ok(),  // German
        Regex::new(r"(?i)^Saison\s*(\d{1,2})$").ok(),   // French
    ];

    for pattern in season_patterns.iter().flatten() {
        if let Some(caps) = pattern.captures(parent_name) {
            if let Some(season) = caps.get(1).and_then(|m| m.as_str().parse().ok()) {
                ctx.folder_season = Some(season);
                ctx.is_tv_structure = true;

                // The series name should be in the grandparent folder
                if let Some(grandparent) = parent.parent() {
                    if let Some(gp_name) = grandparent.file_name().and_then(|s| s.to_str()) {
                        let (name, year) = extract_series_name_from_folder(gp_name);
                        ctx.series_name = Some(name);
                        ctx.series_year = year;
                    }
                }
                break;
            }
        }
    }

    // If no season folder found, check if parent folder itself looks like a series
    if !ctx.is_tv_structure {
        // Check for patterns like "Show Name (2020)" or "Show Name"
        // that contain multiple video files (would indicate a series)
        let (name, year) = extract_series_name_from_folder(parent_name);

        // Check if the folder name contains common TV indicators
        let tv_indicators = [
            r"(?i)\bseason\b",
            r"(?i)\bseries\b",
            r"(?i)\bcomplete\b",
            r"(?i)\bs\d{1,2}$",
            r"(?i)\btvshow\b",
        ];

        for pattern in tv_indicators.iter() {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(parent_name) {
                    ctx.is_tv_structure = true;
                    ctx.series_name = Some(name.clone());
                    ctx.series_year = year;
                    break;
                }
            }
        }

        // Also check if the path contains typical TV folder patterns
        let path_str = path.to_string_lossy().to_lowercase();
        if path_str.contains("tv shows") || path_str.contains("tv series") ||
           path_str.contains("series") || path_str.contains("shows") {
            ctx.is_tv_structure = true;
            if ctx.series_name.is_none() {
                ctx.series_name = Some(name);
                ctx.series_year = year;
            }
        }
    }

    ctx
}

/// Extract series name and year from folder name like "Breaking Bad (2008)"
fn extract_series_name_from_folder(folder_name: &str) -> (String, Option<i32>) {
    // Pattern: "Name (Year)" or "Name [Year]"
    if let Ok(re) = Regex::new(r"^(.+?)\s*[\(\[]?\s*((?:19|20)\d{2})\s*[\)\]]?\s*$") {
        if let Some(caps) = re.captures(folder_name) {
            let name = caps.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
            let year = caps.get(2).and_then(|m| m.as_str().parse().ok());
            if !name.is_empty() {
                return (clean_folder_name(&name), year);
            }
        }
    }

    (clean_folder_name(folder_name), None)
}

/// Clean folder name by removing common junk
fn clean_folder_name(name: &str) -> String {
    let mut result = name.to_string();

    // Remove common tags in brackets
    let patterns = [
        r"\s*\[.*?\]\s*",
        r"\s*\((?!(?:19|20)\d{2}\)).*?\)\s*",  // Remove parentheses unless they contain a year
    ];

    for pattern in patterns.iter() {
        if let Ok(re) = Regex::new(pattern) {
            result = re.replace_all(&result, " ").to_string();
        }
    }

    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Try to parse filename as TV episode using comprehensive patterns
fn try_parse_tv_episode(filename: &str, folder_ctx: &FolderContext) -> Option<ParsedMedia> {
    // First, check if filename contains codec indicators that might be confused with episode numbers
    // These should NOT be treated as episode numbers
    let codec_pattern = Regex::new(r"(?i)[xh]\.?26[45]").ok()?;
    let has_codec = codec_pattern.is_match(filename);

    // Comprehensive TV episode patterns (ordered by specificity)
    // Only use strict patterns that have clear season/episode markers
    let strict_patterns: Vec<Regex> = vec![
        // Standard SxxExx patterns (most reliable)
        Regex::new(r"(?i)^(?P<title>.+?)[.\s_-]+S(?P<season>\d{1,2})E(?P<episode>\d{1,3})(?:-?E(?P<episode_end>\d{1,3}))?").ok()?,
        Regex::new(r"(?i)^(?P<title>.+?)[.\s_-]+S(?P<season>\d{1,2})\.E(?P<episode>\d{1,3})").ok()?,

        // Season/Episode spelled out
        Regex::new(r"(?i)^(?P<title>.+?)[.\s_-]+Season\s*(?P<season>\d{1,2})[.\s_-]+Episode\s*(?P<episode>\d{1,3})").ok()?,

        // 1x01 format
        Regex::new(r"(?i)^(?P<title>.+?)[.\s_-]+(?P<season>\d{1,2})x(?P<episode>\d{2,3})").ok()?,
    ];

    // Try strict patterns first (these are reliable)
    for pattern in &strict_patterns {
        if let Some(caps) = pattern.captures(filename) {
            let raw_title = caps.name("title").map(|m| m.as_str()).unwrap_or("");
            let title = clean_title(raw_title);
            let (title, year) = extract_year_from_title(&title);
            let title = clean_junk_from_title(&title);

            if title.len() < 2 {
                continue;
            }

            let season = caps.name("season").and_then(|m| m.as_str().parse().ok());
            let episode = caps.name("episode").and_then(|m| m.as_str().parse().ok());
            let episode_end = caps.name("episode_end").and_then(|m| m.as_str().parse().ok());

            if let Some(ep) = episode {
                // Sanity check: episode numbers above 100 are rare
                if ep > 100 {
                    println!("[PARSE] Skipping suspicious episode number: {}", ep);
                    continue;
                }

                let final_title = get_best_title(&title, folder_ctx);
                let final_year = year.or(folder_ctx.series_year);

                return Some(ParsedMedia {
                    title: final_title,
                    year: final_year,
                    media_type: MediaParseType::TvEpisode,
                    season,
                    episode: Some(ep),
                    episode_end,
                });
            }
        }
    }

    // Only use looser patterns if folder structure suggests TV AND no codec in filename
    if folder_ctx.is_tv_structure && !has_codec {
        let loose_patterns: Vec<Regex> = vec![
            // Episode patterns without season (e.g., "Show E01")
            Regex::new(r"(?i)^(?P<title>.+?)[.\s_-]+E(?P<episode>\d{1,3})(?:[.\s_-]|$)").ok()?,
            Regex::new(r"(?i)^(?P<title>.+?)[.\s_-]+Ep\.?\s*(?P<episode>\d{1,3})").ok()?,
        ];

        for pattern in &loose_patterns {
            if let Some(caps) = pattern.captures(filename) {
                let raw_title = caps.name("title").map(|m| m.as_str()).unwrap_or("");
                let title = clean_title(raw_title);
                let (title, year) = extract_year_from_title(&title);
                let title = clean_junk_from_title(&title);

                if title.len() < 2 {
                    continue;
                }

                let episode: Option<i32> = caps.name("episode").and_then(|m| m.as_str().parse().ok());

                if let Some(ep) = episode {
                    // Stricter sanity check for loose patterns
                    if ep > 50 || ep == 0 {
                        continue;
                    }

                    let final_title = get_best_title(&title, folder_ctx);
                    let final_year = year.or(folder_ctx.series_year);

                    return Some(ParsedMedia {
                        title: final_title,
                        year: final_year,
                        media_type: MediaParseType::TvEpisode,
                        season: folder_ctx.folder_season.or(Some(1)),
                        episode: Some(ep),
                        episode_end: None,
                    });
                }
            }
        }
    }

    None
}

/// Get the best title from parsed title and folder context
fn get_best_title(title: &str, folder_ctx: &FolderContext) -> String {
    if let Some(ref series_name) = folder_ctx.series_name {
        if title.len() < 3 || is_generic_title(title) {
            series_name.clone()
        } else if series_name.to_lowercase().contains(&title.to_lowercase()) {
            series_name.clone()
        } else {
            title.to_string()
        }
    } else {
        title.to_string()
    }
}

/// Check if a title is too generic
fn is_generic_title(title: &str) -> bool {
    let generic = ["episode", "ep", "part", "chapter", "vol", "volume"];
    let lower = title.to_lowercase();
    generic.iter().any(|g| lower == *g || lower.starts_with(&format!("{} ", g)))
}

/// Try to parse using folder context when filename doesn't have clear episode pattern
fn try_parse_from_folder_context(filename: &str, folder_ctx: &FolderContext) -> Option<ParsedMedia> {
    if folder_ctx.series_name.is_none() {
        return None;
    }

    // Try to extract just an episode number from filename
    let episode_patterns = [
        Regex::new(r"(?i)E?(?P<episode>\d{1,3})").ok(),
        Regex::new(r"(?i)-\s*(?P<episode>\d{1,3})\s*-").ok(),
        Regex::new(r"(?i)(?P<episode>\d{2,3})").ok(),
    ];

    for pattern in episode_patterns.iter().flatten() {
        if let Some(caps) = pattern.captures(filename) {
            if let Some(ep) = caps.name("episode").and_then(|m| m.as_str().parse().ok()) {
                // Sanity check - episode number should be reasonable
                if ep > 0 && ep < 1000 {
                    return Some(ParsedMedia {
                        title: folder_ctx.series_name.clone().unwrap(),
                        year: folder_ctx.series_year,
                        media_type: MediaParseType::TvEpisode,
                        season: folder_ctx.folder_season.or(Some(1)),
                        episode: Some(ep),
                        episode_end: None,
                    });
                }
            }
        }
    }

    None
}

/// Parse filename as a movie
fn parse_as_movie(filename: &str) -> ParsedMedia {
    let clean_name = filename.replace('.', " ").replace('_', " ");
    let (title, year) = extract_year_from_title(&clean_name);
    let title = clean_junk_from_title(&title);

    ParsedMedia {
        title,
        year,
        media_type: MediaParseType::Movie,
        season: None,
        episode: None,
        episode_end: None,
    }
}

fn clean_title(title: &str) -> String {
    title.replace('.', " ").replace('_', " ").trim().to_string()
}

fn extract_year_from_title(title: &str) -> (String, Option<i32>) {
    // Special case: if the entire title is just a year (like "1899"), keep it
    let trimmed = title.trim();
    if let Ok(re) = Regex::new(r"^(19[3-9]\d|20\d{2})$") {
        if re.is_match(trimmed) {
            // Title is just a year - this IS the title (e.g., "1899" the show)
            return (trimmed.to_string(), None);
        }
    }
    
    let year_regex = Regex::new(r"\b(19[3-9]\d|20\d{2})\b").unwrap();
    
    if let Some(caps) = year_regex.captures(title) {
        if let Some(year_match) = caps.get(1) {
            let year_str = year_match.as_str();
            if let Ok(year) = year_str.parse::<i32>() {
                // Split at year position  
                let parts: Vec<&str> = title.splitn(2, year_str).collect();
                let cleaned_title = parts.first()
                    .map(|s| s.trim().to_string())
                    .unwrap_or_else(|| title.to_string());
                
                // Only use the year-less title if it's substantial
                if !cleaned_title.is_empty() && cleaned_title.len() >= 2 {
                    return (cleaned_title, Some(year));
                }
            }
        }
    }
    
    (title.to_string(), None)
}

fn clean_junk_from_title(title: &str) -> String {
    // Comprehensive list of patterns to remove from filenames
    let junk_patterns = [
        // Resolution/quality
        r"(?i)\b1080p\b", r"(?i)\b720p\b", r"(?i)\b2160p\b", r"(?i)\b4k\b", r"(?i)\buhd\b",
        r"(?i)\b480p\b", r"(?i)\b576p\b", r"(?i)\bhd\b", r"(?i)\bsd\b", r"(?i)\bfhd\b",
        
        // Source
        r"(?i)\bbluray\b", r"(?i)\bblu-ray\b", r"(?i)\bbdrip\b", r"(?i)\bbrip\b",
        r"(?i)\bremux\b", r"(?i)\bweb-?dl\b", r"(?i)\bweb-?rip\b", r"(?i)\bwebrip\b",
        r"(?i)\bhdrip\b", r"(?i)\bdvdrip\b", r"(?i)\bdvdscr\b", r"(?i)\bhdtv\b",
        r"(?i)\bpdtv\b", r"(?i)\bdsr\b", r"(?i)\bhdcam\b", r"(?i)\bcam\b",
        r"(?i)\bts\b", r"(?i)\btelesync\b", r"(?i)\bscreener\b", r"(?i)\br5\b",
        r"(?i)\bbdrip\b", r"(?i)\bamzn\b", r"(?i)\bnf\b", r"(?i)\bnetflix\b",
        r"(?i)\batvp\b", r"(?i)\bdsnp\b", r"(?i)\bhmax\b", r"(?i)\bhulu\b",
        
        // HDR/Video
        r"(?i)\bimax\b", r"(?i)\bsdr\b", r"(?i)\bhdr\b", r"(?i)\bhdr10\b", 
        r"(?i)\bhdr10\+\b", r"(?i)\bdolby\s?vision\b", r"(?i)\bdv\b",
        r"(?i)\b10bit\b", r"(?i)\b8bit\b", r"(?i)\bhi10p\b",
        
        // Codec
        r"(?i)\bavc\b", r"(?i)\bhevc\b", r"(?i)\bx264\b", r"(?i)\bx265\b",
        r"(?i)\bh\.?264\b", r"(?i)\bh\.?265\b", r"(?i)\bxvid\b", r"(?i)\bdivx\b",
        r"(?i)\bvc-?1\b", r"(?i)\bav1\b", r"(?i)\bmpeg\d?\b",
        
        // Audio
        r"(?i)\bdts-?hd(\.?ma)?\b", r"(?i)\bdts\b", r"(?i)\btruehd\b", r"(?i)\batmos\b",
        r"(?i)\bddp?\d*\.?\d*\b", r"(?i)\bdd\d*\.?\d*\b", r"(?i)\bflac\b", r"(?i)\baac\b",
        r"(?i)\bac3\b", r"(?i)\beac3\b", r"(?i)\bmp3\b", r"(?i)\blpcm\b",
        r"(?i)\b5[\s.]1\b", r"(?i)\b7[\s.]1\b", r"(?i)\b2[\s.]0\b", r"(?i)\bstereo\b",
        r"(?i)\bmono\b", r"(?i)\bsurround\b",
        
        // Subtitles
        r"(?i)\besub\b", r"(?i)\bsub(bed|s)?\b", r"(?i)\bsrt\b",
        r"(?i)\bforced\b", r"(?i)\bcc\b", r"(?i)\bsdh\b",
        
        // Language
        r"(?i)\bmulti\b", r"(?i)\bhindi\b", r"(?i)\benglish\b", r"(?i)\bdual\s?audio\b",
        r"(?i)\btamil\b", r"(?i)\btelugu\b", r"(?i)\bspanish\b", r"(?i)\bfrench\b",
        r"(?i)\bgerman\b", r"(?i)\bitalian\b", r"(?i)\bjapanese\b", r"(?i)\bkorean\b",
        r"(?i)\bchinese\b", r"(?i)\brussian\b", r"(?i)\barabic\b", r"(?i)\bportuguese\b",
        r"(?i)\beng\b", r"(?i)\bhin\b", r"(?i)\bjpn\b", r"(?i)\bkor\b",
        
        // Release info
        r"(?i)\brepack\b", r"(?i)\bproper\b", r"(?i)\breal\b", r"(?i)\brip\b",
        r"(?i)\bopen\s?matte\b", r"(?i)\bextended\b", r"(?i)\bunrated\b",
        r"(?i)\bdc\b", r"(?i)\bdirector'?s?\s?cut\b", r"(?i)\btheatrical\b",
        r"(?i)\buncut\b", r"(?i)\bspecial\s?edition\b", r"(?i)\bcomplete\b",
        r"(?i)\bfinal\s?cut\b", r"(?i)\bcriterion\b", r"(?i)\bremastered\b",
        r"(?i)\brestored\b", r"(?i)\banniversary\b", r"(?i)\bultimate\b",
        
        // Scene/group tags
        r"\[.*?\]",           // [Anything]
        r"\(.*?\)",           // (Anything) - but be careful with years
        r"(?i)\b-\s*\w+$",    // Trailing -GROUP 
        r"(?i)^\w+\s*-\s*",   // Leading GROUP -
        
        // Common release groups (partial list)
        r"(?i)\byify\b", r"(?i)\byts\b", r"(?i)\brarbg\b", r"(?i)\bettv\b",
        r"(?i)\beztv\b", r"(?i)\btigole\b", r"(?i)\bqxr\b", r"(?i)\bsparks\b",
        r"(?i)\bgalaxy\s?rg\b", r"(?i)\bpahe\b", r"(?i)\bpsa\b",
        r"(?i)\bMeGusta\b", r"(?i)\bfgt\b", r"(?i)\blol\b", r"(?i)\baxxo\b",
        
        // Misc
        r"(?i)\bwww\.\w+\.\w+\b",  // Website URLs
        r"(?i)\b@\w+\b",           // @handles
        r"\bBT4G\b",
        r"\bMkvCinemas\b",
    ];
    
    let mut result = title.to_string();
    
    for pattern in &junk_patterns {
        if let Ok(re) = Regex::new(pattern) {
            result = re.replace_all(&result, " ").to_string();
        }
    }
    
    // Remove years in parentheses but keep the year for extraction later
    // Actually, we want to keep years, so skip this
    
    // Clean up multiple dashes, underscores
    if let Ok(re) = Regex::new(r"[-_]{2,}") {
        result = re.replace_all(&result, " ").to_string();
    }
    
    // Clean up extra whitespace
    if let Ok(re) = Regex::new(r"\s{2,}") {
        result = re.replace_all(&result, " ").to_string();
    }
    
    // Remove leading/trailing dashes and dots
    result = result.trim_matches(|c| c == '-' || c == '.' || c == '_' || c == ' ')
        .to_string();
    
    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    
    #[test]
    fn test_parse_movie() {
        let path = PathBuf::from("Inception.2010.1080p.BluRay.x264.mkv");
        let parsed = parse_filename(&path);
        assert_eq!(parsed.title, "Inception");
        assert_eq!(parsed.year, Some(2010));
        assert_eq!(parsed.media_type, MediaParseType::Movie);
    }
    
    #[test]
    fn test_parse_tv_episode() {
        let path = PathBuf::from("Breaking.Bad.S01E01.Pilot.720p.mkv");
        let parsed = parse_filename(&path);
        assert_eq!(parsed.title, "Breaking Bad");
        assert_eq!(parsed.media_type, MediaParseType::TvEpisode);
        assert_eq!(parsed.season, Some(1));
        assert_eq!(parsed.episode, Some(1));
    }
}
