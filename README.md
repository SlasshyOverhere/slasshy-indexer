# Slasshy Desktop

A modern, high-performance media indexer and player built with **Tauri**, **Rust**, and **React**. Slasshy Desktop organizes your local video library into a beautiful, browsable interface and plays your content seamlessly using the power of **MPV**.

![Slasshy Desktop Banner](https://via.placeholder.com/800x400?text=Slasshy+Desktop+Interface)

## ✨ Key Features

- **Unified Media Library:** Automatically scans your directories to organize Movies and TV Shows.
- **Smart Metadata:** Fetches high-quality metadata, posters, and backdrops from TMDB.
- **Native Playback Power:** Integrates with **MPV** to play virtually any video format (MKV, AVI, HDR, etc.) without transcoding.
- **Resume Playback:** Remembers exactly where you left off, even for local files played in MPV.
- **Watch History:** Keep track of what you've watched.
- **Modern UI:** A sleek, responsive interface featuring dark mode, glassmorphism, and smooth animations.
- **Metadata Editor:** "Fix Match" feature to manually correct incorrect associations.

## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, TailwindCSS, Radix UI
- **Backend (Desktop):** Rust (Tauri), SQLite (Rusqlite)
- **Playback Engine:** MPV (via IPC)
- **Data Source:** The Movie Database (TMDB)

## 📋 Prerequisites

Before running the application, ensure you have the following installed:

1.  **Node.js** (v18 or higher)
2.  **Rust** (latest stable)
3.  **MPV Media Player:**
    -   **Windows:** Download a build (e.g., from [non-suckless builds](https://sourceforge.net/projects/mpv-player-windows/files/)) and add the folder containing `mpv.exe` to your system `PATH`.
    -   **Linux/macOS:** Install via your package manager (e.g., `apt install mpv` or `brew install mpv`).

## 🚀 Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/SlasshyOverhere/slasshy-indexer.git
    cd slasshy-indexer/slasshy-desktop
    ```

2.  **Install Frontend Dependencies:**
    ```bash
    npm install
    ```

3.  **Run in Development Mode:**
    ```bash
    npm run tauri dev
    ```
    This will compile the Rust backend and launch the application window.

## 📦 Building for Production

To create an optimized executable for your operating system:

```bash
npm run tauri build
```

The build artifacts will be located in `src-tauri/target/release/`.

## ⚙️ Configuration

-   **Settings:** Access the settings menu from the sidebar to manage library paths and player preferences.
-   **Themes:** Toggle between Light and Dark modes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

[MIT License](LICENSE)