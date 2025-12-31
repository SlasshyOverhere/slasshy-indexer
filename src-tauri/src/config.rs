use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};

use crate::database::get_config_path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub mpv_path: Option<String>,
    #[serde(default)]
    pub ffprobe_path: Option<String>,
    #[serde(default)]
    pub media_folders: Vec<String>,
    #[serde(default)]
    pub tmdb_api_key: Option<String>,
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
