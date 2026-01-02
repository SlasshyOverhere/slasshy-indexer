import { GuidedTour, TourStep } from "@/components/GuidedTour"

interface MainAppTourProps {
  isActive: boolean
  onComplete: () => void
  onSkip: () => void
  setView: (view: string) => void
}

export function MainAppTour({ isActive, onComplete, onSkip, setView }: MainAppTourProps) {
  const tourSteps: TourStep[] = [
    // Sidebar Overview
    {
      id: 'sidebar-intro',
      target: '[data-tour="sidebar"]',
      title: 'Your Navigation Hub',
      description: 'This sidebar is your main navigation. Let me show you what each section does and how to get the most out of Slasshy.',
      position: 'right',
      highlight: false,
    },

    // Home Tab
    {
      id: 'nav-home',
      target: '[data-tour="nav-home"]',
      title: 'Home - Your Dashboard',
      description: 'The Home screen shows your continue watching, library stats, and a quick search across all your media. It\'s your starting point.',
      position: 'right',
      action: () => setView('home'),
    },

    // Movies Tab
    {
      id: 'nav-movies',
      target: '[data-tour="nav-movies"]',
      title: 'Movies Library',
      description: 'Browse all your movies here. Use the search bar to filter, and switch between grid/list views. Your entire movie collection in one place.',
      position: 'right',
      action: () => setView('movies'),
    },

    // TV Shows Tab
    {
      id: 'nav-tv',
      target: '[data-tour="nav-tv"]',
      title: 'TV Shows Library',
      description: 'All your TV series organized by show. Click on any series to browse seasons and episodes. Perfect for binge-watching!',
      position: 'right',
      action: () => setView('tv'),
    },

    // Discover Tab
    {
      id: 'nav-stream',
      target: '[data-tour="nav-stream"]',
      title: 'Discover & Stream',
      description: 'Search for any movie or TV show online. Stream content directly or find where to watch. Powered by TMDB and streaming providers.',
      position: 'right',
      action: () => setView('stream'),
    },

    // History Tab
    {
      id: 'nav-history',
      target: '[data-tour="nav-history"]',
      title: 'Watch History',
      description: 'Track what you\'ve watched! Switch between Local (your library) and Streaming history. Resume from where you left off anytime.',
      position: 'right',
      action: () => setView('history'),
    },

    // Scan/Update Library Button
    {
      id: 'scan-library',
      target: '[data-tour="scan-library-btn"]',
      title: 'Update Library',
      description: 'Click this to scan your media folders for new content. Slasshy will automatically fetch posters, descriptions, and organize everything.',
      position: 'right',
    },

    // Settings Button
    {
      id: 'settings-btn',
      target: '[data-tour="settings-btn"]',
      title: 'Settings',
      description: 'Configure your media folders, TMDB API key, player settings, and more. This is where you set up Slasshy to work with your library.',
      position: 'right',
    },

    // Context Menu Info (shown on movies view)
    {
      id: 'context-menu-info',
      target: '[data-tour="nav-movies"]',
      title: 'Right-Click for More Options!',
      description: 'Right-click on any movie or TV show card to access quick actions: Play, Fix Match (correct wrong metadata), Remove from History, or Delete from Drive.',
      position: 'right',
      action: () => setView('movies'),
    },

    // Fix Match Explanation
    {
      id: 'fix-match-info',
      target: '[data-tour="nav-movies"]',
      title: 'Wrong Poster or Title?',
      description: 'If a movie/show has the wrong artwork or info, right-click and select "Fix Match". You can search TMDB and pick the correct match to update all metadata.',
      position: 'right',
    },

    // Refresh Metadata Explanation
    {
      id: 'refresh-info',
      target: '[data-tour="scan-library-btn"]',
      title: 'Refresh Everything',
      description: 'To refresh all metadata, click "Update Library". This rescans your folders and updates any missing or outdated posters and information.',
      position: 'right',
    },

    // Episode Metadata Tip
    {
      id: 'episode-tip',
      target: '[data-tour="nav-tv"]',
      title: 'Missing Episode Banners?',
      description: 'Episode artwork depends on TMDB data. If episodes are missing banners, the show might have incomplete data on TMDB. You can contribute to TMDB to help!',
      position: 'right',
      action: () => setView('tv'),
    },

    // Final Step
    {
      id: 'tour-complete',
      target: '[data-tour="nav-home"]',
      title: 'You\'re Ready! 🎉',
      description: 'That\'s the basics! Now head to Settings to add your TMDB API key and media folders. Enjoy your personalized media center!',
      position: 'right',
      action: () => setView('home'),
    },
  ]

  return (
    <GuidedTour
      steps={tourSteps}
      isActive={isActive}
      onComplete={onComplete}
      onSkip={onSkip}
    />
  )
}
