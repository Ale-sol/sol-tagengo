import { Routes, Route } from 'react-router-dom'
import { useSettings } from './hooks/useSettings.js'
import BottomNav from './components/BottomNav.jsx'
import Browse from './pages/Browse.jsx'
import Study from './pages/Study.jsx'
import Settings from './pages/Settings.jsx'
import Stats from './pages/Stats.jsx'

export default function App() {
  const { settings, updateSetting, updateSettings, loaded } = useSettings()

  if (!loaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Browse settings={settings} />} />
          <Route path="/study/:videoId" element={<Study settings={settings} />} />
          <Route path="/stats" element={<Stats settings={settings} />} />
          <Route
            path="/settings"
            element={
              <Settings
                settings={settings}
                onUpdate={updateSetting}
                onUpdateMany={updateSettings}
              />
            }
          />
        </Routes>
      </main>

      {/* Hide bottom nav in study mode */}
      <Routes>
        <Route path="/study/:videoId" element={null} />
        <Route path="*" element={<BottomNav />} />
      </Routes>
    </div>
  )
}
