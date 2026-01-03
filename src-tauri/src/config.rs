use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};

use crate::database::get_config_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub mpv_path: Option<String>,
    #[serde(default)]
    pub vlc_path: Option<String>,
    #[serde(default)]
    pub ffprobe_path: Option<String>,
    #[serde(default)]
    pub ffmpeg_path: Option<String>,
    #[serde(default)]
    pub media_folders: Vec<String>,
    #[serde(default)]
    pub tmdb_api_key: Option<String>,
    #[serde(default = "default_file_watcher_enabled")]
    pub file_watcher_enabled: bool,
    // Cloud cache settings
    #[serde(default)]
    pub cloud_cache_enabled: bool,
    #[serde(default)]
    pub cloud_cache_dir: Option<String>,
    #[serde(default = "default_cloud_cache_max_mb")]
    pub cloud_cache_max_mb: u32,
    #[serde(default = "default_cloud_cache_expiry_hours")]
    pub cloud_cache_expiry_hours: u32,
    // Cloud auto-scan interval in minutes (default 5 minutes)
    #[serde(default = "default_cloud_scan_interval_minutes")]
    pub cloud_scan_interval_minutes: u32,
}

fn default_file_watcher_enabled() -> bool {
    true
}

fn default_cloud_cache_max_mb() -> u32 {
    1024 // 1GB per movie
}

fn default_cloud_cache_expiry_hours() -> u32 {
    24 // Clean up after 24 hours
}

fn default_cloud_scan_interval_minutes() -> u32 {
    5 // Scan every 5 minutes by default
}

impl Default for Config {
    fn default() -> Self {
        Config {
            mpv_path: None,
            vlc_path: None,
            ffprobe_path: None,
            ffmpeg_path: None,
            media_folders: Vec::new(),
            tmdb_api_key: None,
            file_watcher_enabled: true,
            cloud_cache_enabled: false,
            cloud_cache_dir: None,
            cloud_cache_max_mb: 1024,
            cloud_cache_expiry_hours: 24,
            cloud_scan_interval_minutes: 5,
        }
    }
}

pub fn load_config() -> Result<Config, Box<dyn std::error::Error>> {
    let config_path = get_config_path();
    
    if !std::path::Path::new(&config_path).exists() {
        let default_config = Config::default();
        save_config(&default_config)?;
        return Ok(default_config);
    }
    
    let mut file = fs::File::open(&config_path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    
    let config: Config = serde_json::from_str(&contents)?;
    Ok(config)
}

pub fn save_config(config: &Config) -> Result<(), Box<dyn std::error::Error>> {
    let config_path = get_config_path();
    
    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&config_path).parent() {
        fs::create_dir_all(parent)?;
    }
    
    let json = serde_json::to_string_pretty(config)?;
    let mut file = fs::File::create(&config_path)?;
    file.write_all(json.as_bytes())?;
    
    Ok(())
}
