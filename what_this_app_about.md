# Slasshy Desktop - Complete Application Overview

## Application Name
**Slasshy Media Indexer**

## Executive Summary
Slasshy Desktop is an advanced cross-platform media center application built with a modern technology stack combining Rust, React, and Tauri. It serves as a comprehensive solution for organizing, indexing, and playing personal media collections including movies and TV shows, while also providing streaming capabilities for online content.

## Core Purpose
The application functions as a unified media library manager that automatically discovers, catalogs, and presents local video files in an elegant, Netflix-like interface. It bridges the gap between traditional media players and streaming platforms by offering both local file playback and online streaming options in one cohesive application.

## Technology Stack
### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with custom animations powered by Framer Motion
- **UI Components**: Radix UI primitives for accessibility and customization
- **Icons**: Lucide React icon library
- **Routing**: React Router DOM for navigation

### Backend & Desktop Framework
- **Platform**: Tauri (Rust-based framework)
- **Backend Language**: Rust
- **Database**: SQLite with rusqlite for persistence
- **API Bridge**: Tauri's secure API layer connecting frontend and backend

### Playback System
- **Primary Player**: MPV Media Player integration (for local files)
- **Streaming Player**: Built-in Web Player and Videasy integration
- **Format Support**: Virtually all video formats (MKV, AVI, MP4, MOV, HDR, etc.)

### Data Sources
- **Metadata Provider**: The Movie Database (TMDb) API
- **External APIs**: TMDB for posters, backdrops, and detailed media information

## Key Features

### 1. Smart Media Library Management
- **Automatic Scanning**: Discovers and indexes your media directories
- **Intelligent Organization**: Sorts content into Movies and TV Shows categories
- **Metadata Fetching**: Automatically retrieves high-quality posters, backdrops, and descriptive information from TMDB
- **File Recognition**: Identifies movies and TV episodes based on filename patterns

### 2. Advanced Playback Capabilities
- **Native MPV Integration**: Leverages the power of MPV player for maximum format support
- **Built-in Web Player**: HTML5-based player for compatible formats
- **Streaming Options**: Supports online content streaming via integrated Videasy player
- **Resume Functionality**: Remembers and restores playback positions automatically
- **Progress Tracking**: Maintains watch status and viewing history

### 3. Beautiful User Interface
- **Modern Design**: Sleek, contemporary interface with dark mode optimized
- **Glassmorphism Effects**: Advanced visual effects including frosted glass panels
- **Smooth Animations**: Fluid transitions powered by Framer Motion
- **Responsive Layout**: Adapts to different screen sizes and resolutions
- **Custom Theme**: Brand-specific purple/violet color scheme

### 4. Media Discovery & Organization
- **Search Functionality**: Real-time filtering of your media library
- **Smart Cataloging**: Groups TV episodes under their respective seasons
- **Metadata Correction**: "Fix Match" feature to manually associate files with correct TMDb entries
- **Visual Presentation**: Movie/TV card-based layout with cover art previews

### 5. Comprehensive History Systems
- **Local Watch History**: Tracks watched status for locally stored media
- **Streaming History**: Maintains records for online content viewed
- **Progress Tracking**: Detailed position tracking for both local and streaming content
- **History Management**: Clear individual or all history entries

### 6. Media Management Tools
- **File Deletion**: Safe removal of media files from disk via contextual menus
- **Episode Selection**: Granular control for deleting specific TV episodes
- **Library Maintenance**: Tools for managing and cleaning up media collections

### 7. Streaming Integration
- **Direct Stream Access**: Integrated access to online streaming sources
- **Videasy Player**: Embedded support for premium streaming content
- **Cross-platform Streaming**: Consistent streaming experience across devices
- **Episode Navigation**: Built-in episode selectors for TV series

## Architecture & Design Philosophy

### Cross-Platform Compatibility
Built with Tauri, the application compiles to native executables for Windows, macOS, and Linux, ensuring optimal performance and system integration on each platform.

### Security Model
- Sandboxed communication between frontend and backend
- Limited permissions with granular filesystem access controls
- Secure external protocol handling for streaming services

### Performance Optimization
- Efficient SQLite database queries for fast library access
- Image caching mechanisms for rapid poster display
- Asynchronous scanning to maintain UI responsiveness
- Memory-efficient streaming architecture

## User Experience Flow

### Onboarding Process
1. **Initial Setup**: Configure media library directories via Settings
2. **Library Scan**: Automatic discovery and indexing of media files
3. **Metadata Enhancement**: Bulk fetching of artwork and information from TMDB
4. **Ready for Consumption**: Browse and enjoy organized media collection

### Core Usage Patterns
1. **Browse**: Navigate movies and TV shows via intuitive category views
2. **Discover**: Use search and filter functions to find specific content
3. **Watch**: Select items to begin playback with resume position consideration
4. **Track**: Automatically maintained watch history and progress saving
5. **Manage**: Organize and maintain library via deletion and correction tools

### Playback Decision Logic
- **Automatically selects** the most appropriate player based on file format
- **Prioritizes** MPV for complex formats (MKV, AVI, HDR)
- **Fallback** to built-in player for standard web formats
- **Prompting** user when multiple playback options exist

## Technical Requirements

### System Dependencies
- **Node.js**: Version 18 or higher for development
- **Rust**: Latest stable release for building desktop backend
- **MPV Media Player**: Required for full format compatibility
- **Operating System**: Windows, macOS, or Linux with GUI support

### Development Environment
- **Package Manager**: npm for frontend dependencies
- **Build Tool**: Vite for development server and production builds
- **Compiler**: TypeScript transpiler for type checking
- **GUI Toolkit**: Tauri CLI for desktop packaging

### Runtime Permissions
- **File System Access**: Read/write access to configured media directories
- **Network Access**: Connection to TMDB API and streaming services
- **External App Integration**: MPV player launching capability
- **Protocol Handling**: URI scheme support for streaming services

## Unique Value Propositions

### Unified Experience
Combines local media management with streaming capabilities in a single interface, eliminating the need to switch between different applications.

### Maximum Compatibility
Supports virtually all video formats through intelligent player selection, ensuring that users can play their entire collection without conversion.

### Professional Quality UI
Features a premium, modern interface comparable to commercial streaming platforms, with attention to visual design and user experience.

### Local-first Design
Prioritizes local file access and privacy while optionally extending to streaming services, giving users control over their media consumption.

### Extensible Architecture
Built with modularity in mind, allowing for easy addition of new features, playback systems, and media sources.

## Target Audience
- Home theater enthusiasts seeking a Netflix-like experience for personal collections
- Media file collectors with diverse format libraries
- Users wanting to consolidate multiple media applications into one
- Privacy-conscious individuals preferring local-first solutions
- Tech-savvy users who appreciate open-source alternatives to proprietary software

## Future Potential
- Plugin architecture for additional media sources
- Multi-user support with profile isolation
- Enhanced streaming integrations
- Advanced library management features
- Cloud synchronization capabilities

## Conclusion
Slasshy Desktop represents a comprehensive, professionally-built solution for personal media management that combines the best aspects of modern streaming platforms with the control and flexibility of local file access. Its thoughtful design, robust technical foundation, and extensive feature set position it as a compelling alternative to commercial media center software while maintaining the benefits of open-source development.