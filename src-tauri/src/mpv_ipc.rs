// MPV Progress Tracking Module
// Uses a watch-later style approach with a temp file that MPV updates via script

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use serde::{Deserialize, Serialize};

/// Progress info saved/loaded from temp file
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MpvProgressInfo {
    pub position: f64,
    pub duration: f64,
    pub paused: bool,
    pub eof_reached: bool,
    pub quit_time: Option<i64>,
}

/// Get the path to the progress tracking directory
fn get_progress_dir() -> PathBuf {
    let app_data = crate::database::get_app_data_dir();
    app_data.join("mpv_progress")
}

/// Get progress file path for a media item
fn get_progress_file_path(media_id: i64) -> PathBuf {
    get_progress_dir().join(format!("{}.json", media_id))
}

/// Get the Lua script content that MPV will use to save progress
fn get_lua_script_content(progress_file: &str) -> String {
    // Use forward slashes for Lua to avoid backslash escaping hell
    let clean_path = progress_file.replace("\\", "/");
    
    format!(r#"
-- Slasshy Progress Tracker for MPV
-- Saves playback position to a JSON file periodically and on quit

local progress_file = "{}"
local save_interval = 2 -- seconds

local last_duration = 0
local last_position = 0

local function get_progress_data()
    local pos = mp.get_property_number("time-pos")
    local duration = mp.get_property_number("duration")
    local paused = mp.get_property_bool("pause") or false
    local eof = mp.get_property_bool("eof-reached") or false
    
    -- Robust duration handling
    if duration and duration > 0 then
        last_duration = duration
    end
    local d_to_save = duration
    if not d_to_save or d_to_save <= 0 then d_to_save = last_duration end
    
    -- Robust position handling
    -- Update last_position only if we have a valid current position
    if pos and pos > 0 then
        last_position = pos
    end
    
    -- If current position is missing (e.g. during shutdown), use last known
    local p_to_save = pos
    if not p_to_save or p_to_save <= 0 then p_to_save = last_position end
    
    -- Sanity check: don't save position > duration
    if d_to_save > 0 and p_to_save > d_to_save then
        p_to_save = d_to_save
    end
    
    return string.format(
        '{{"position":%.3f,"duration":%.3f,"paused":%s,"eof_reached":%s,"quit_time":%d}}',
        p_to_save,
        d_to_save,
        paused and "true" or "false",
        eof and "true" or "false",
        os.time()
    )
end

local function save_progress()
    -- Get data (will use fallbacks if properties are unavailable)
    local duration = mp.get_property_number("duration") or last_duration
    
    -- Safety: never save if we don't know the duration yet
    if not duration or duration <= 0 then return end

    local data = get_progress_data()
    local file = io.open(progress_file, "w")
    if file then
        file:write(data)
        file:close()
    end
end

-- Periodic save timer
local timer = mp.add_periodic_timer(save_interval, save_progress)

-- Save on pause/unpause
mp.observe_property("pause", "bool", function(name, value)
    save_progress()
end)

-- Save on seek
mp.register_event("seek", save_progress)

-- Save on quit - most important!
mp.register_event("shutdown", function()
    -- During shutdown, properties might be unavailable, so our 
    -- get_progress_data() function will rely on last_position/last_duration
    save_progress()
end)

-- Save when file ends
mp.register_event("end-file", function(event)
    save_progress()
end)

-- Initial save
mp.register_event("file-loaded", function()
    -- Wait a bit for duration to be available
    mp.add_timeout(1, save_progress)
end)

mp.msg.info("Slasshy progress tracker loaded.")
"#, clean_path)
}

/// Create the Lua script file for MPV
fn create_lua_script(media_id: i64) -> Result<PathBuf, String> {
    let progress_dir = get_progress_dir();
    fs::create_dir_all(&progress_dir).map_err(|e| format!("Failed to create progress dir: {}", e))?;
    
    let script_path = progress_dir.join(format!("tracker_{}.lua", media_id));
    let progress_file = get_progress_file_path(media_id);
    
    let script_content = get_lua_script_content(&progress_file.to_string_lossy());
    
    let mut file = fs::File::create(&script_path)
        .map_err(|e| format!("Failed to create Lua script: {}", e))?;
    file.write_all(script_content.as_bytes())
        .map_err(|e| format!("Failed to write Lua script: {}", e))?;
    
    Ok(script_path)
}

/// Read last saved progress for a media item
pub fn read_mpv_progress(media_id: i64) -> Option<MpvProgressInfo> {
    let progress_file = get_progress_file_path(media_id);
    
    if !progress_file.exists() {
        return None;
    }
    
    let content = fs::read_to_string(&progress_file).ok()?;
    serde_json::from_str(&content).ok()
}

/// Clear saved progress for a media item
pub fn clear_mpv_progress(media_id: i64) {
    let progress_file = get_progress_file_path(media_id);
    let script_file = get_progress_dir().join(format!("tracker_{}.lua", media_id));
    
    let _ = fs::remove_file(progress_file);
    let _ = fs::remove_file(script_file);
}

/// Result of launching MPV with tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpvLaunchResult {
    pub success: bool,
    pub error: Option<String>,
    pub final_position: Option<f64>,
    pub final_duration: Option<f64>,
    pub completed: bool,
}

/// Launch MPV with progress tracking
pub fn launch_mpv_with_tracking(
    mpv_path: &str,
    file_path: &str,
    media_id: i64,
    start_position: f64,
) -> Result<u32, String> {
    println!("[MPV] Launching MPV with tracking for media ID: {}", media_id);
    println!("[MPV] File: {}", file_path);
    println!("[MPV] Start position: {:.2}s", start_position);
    
    // Create the Lua tracking script
    let script_path = create_lua_script(media_id)?;
    println!("[MPV] Created tracking script at: {:?}", script_path);
    
    // Build MPV command
    let mut cmd = std::process::Command::new(mpv_path);
    
    // Add the tracking script
    cmd.arg(format!("--script={}", script_path.to_string_lossy()));
    
    // Add start position if resuming
    if start_position > 0.0 {
        cmd.arg(format!("--start={}", start_position as i64));
    }
    
    // Add the file to play
    cmd.arg(file_path);
    
    // Options
    cmd.arg("--save-position-on-quit=no");
    cmd.arg("--keep-open=no");
    
    // Hide console window on Windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    // Capture stdout/stderr for debugging (optional)
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());

    // Spawn MPV process
    let child = cmd.spawn()
        .map_err(|e| format!("Failed to start MPV: {}", e))?;
    
    let pid = child.id();
    println!("[MPV] Started with PID: {}", pid);
    
    Ok(pid)
}

/// Check if MPV process is still running
pub fn is_mpv_running(pid: u32) -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, WAIT_TIMEOUT};
        use windows_sys::Win32::System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE};
        
        unsafe {
            let handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, pid);
            if handle == 0 {
                return false;
            }
            let result = WaitForSingleObject(handle, 0);
            CloseHandle(handle);
            result == WAIT_TIMEOUT
        }
    }
    
    #[cfg(not(windows))]
    {
        use std::process::Command;
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

/// Monitor MPV playback and update database when it exits
/// This should be called in a background thread after launching MPV
pub fn monitor_mpv_and_save_progress(
    db: &crate::database::Database,
    media_id: i64,
    pid: u32,
) -> MpvLaunchResult {
    println!("[MPV] Monitoring MPV process {} for media {}", pid, media_id);
    
    // Wait for MPV to exit
    while is_mpv_running(pid) {
        std::thread::sleep(Duration::from_millis(500));
        
        // Periodically check progress and save to database
        if let Some(progress) = read_mpv_progress(media_id) {
            if progress.duration > 0.0 {
                // Save to database silently
                let _ = db.update_progress(media_id, progress.position, progress.duration);
            }
        }
    }
    
    // MPV has exited - give it a moment to flush the final save
    std::thread::sleep(Duration::from_millis(300));
    
    // Read final progress
    let final_progress = read_mpv_progress(media_id);
    
    let result = if let Some(progress) = final_progress {
        println!("[MPV] Final progress: {:.2}s / {:.2}s (EOF: {})", 
            progress.position, progress.duration, progress.eof_reached);
        
        // Save final progress to database, but ONLY if we have a valid duration
        // This prevents overwriting valid progress with 0s if MPV crashed or didn't load the file
        if progress.duration > 0.0 {
            let _ = db.update_progress(media_id, progress.position, progress.duration);
        } else {
            println!("[MPV] Warning: Invalid duration (0.0), skipping final DB update to preserve existing data");
        }
        
        let completed = if progress.duration > 0.0 {
            (progress.position / progress.duration) >= 0.95 || progress.eof_reached
        } else {
            false
        };
        
        MpvLaunchResult {
            success: true,
            error: None,
            final_position: Some(progress.position),
            final_duration: Some(progress.duration),
            completed,
        }
    } else {
        println!("[MPV] No progress data found after MPV exit");
        MpvLaunchResult {
            success: true,
            error: None,
            final_position: None,
            final_duration: None,
            completed: false,
        }
    };
    
    // Clean up the Lua script (keep progress file for debugging)
    let script_file = get_progress_dir().join(format!("tracker_{}.lua", media_id));
    let _ = fs::remove_file(script_file);
    
    result
}

/// Poll for MPV progress (for real-time updates if needed)
pub fn poll_mpv_progress(media_id: i64) -> Option<MpvProgressInfo> {
    read_mpv_progress(media_id)
}
