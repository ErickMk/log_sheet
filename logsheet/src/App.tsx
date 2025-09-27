import { Routes, Route, Link } from 'react-router-dom'
import { LogSheetDemo } from './components/LogSheetDemo'
import { AutoLogExport } from './components/AutoLogExport'
import { PdfOverlayPage } from './components/PdfOverlayPage'
import { useState, useEffect } from 'react'

// Wrapper component to handle data fetching for PdfOverlayPage
const PdfOverlayWrapper = () => {
    const [tripData, setTripData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
  const [hasProcessed, setHasProcessed] = useState(false);

  useEffect(() => {
    // Prevent multiple runs
    if (hasProcessed) {
      console.log('PdfOverlayWrapper - Already processed, skipping');
      return;
    }

        // Check if we have trip data in localStorage (from AutoLogExport)
        const ready = localStorage.getItem('autoLogExport.ready') === 'true';
        const notice = localStorage.getItem('autoLogExport.notice') || '';
        const metaRaw = localStorage.getItem('autoLogExport.meta');
        const daysRaw = localStorage.getItem('autoLogExport.days');
        const dailyProgressRaw = localStorage.getItem('autoLogExport.dailyProgress');
        
        console.log('PdfOverlayWrapper - localStorage check:', { ready, metaRaw: !!metaRaw, daysRaw: !!daysRaw, dailyProgressRaw: !!dailyProgressRaw });
        
        if (ready && metaRaw && daysRaw) {
          try {
            const meta = JSON.parse(metaRaw);
            const days = JSON.parse(daysRaw);
            const dailyProgress = dailyProgressRaw ? JSON.parse(dailyProgressRaw) : null;
            
            console.log('PdfOverlayWrapper - Parsed data:', { meta, days, dailyProgress, notice });
            
            setTripData({
              meta,
              days,
              dailyProgress,
              notice
            });
        
            // Clean up localStorage after use
            localStorage.removeItem('autoLogExport.ready');
            localStorage.removeItem('autoLogExport.notice');
            localStorage.removeItem('autoLogExport.meta');
            localStorage.removeItem('autoLogExport.days');
            localStorage.removeItem('autoLogExport.dailyProgress');
        
        setHasProcessed(true);
      } catch (e) {
        console.error('PdfOverlayWrapper - Failed to parse trip data:', e);
        setError('Failed to parse trip data');
        setHasProcessed(true);
      }
    } else {
      console.log('PdfOverlayWrapper - No trip data found');
      setError('No trip data available. Please generate a trip first.');
      setHasProcessed(true);
    }
    setLoading(false);
  }, [hasProcessed]);

  // Always show the PdfOverlayPage, with or without trip data
  return <PdfOverlayPage tripData={tripData} />;
};

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white border-b px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
        {/* Logo Icon */}
        <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded flex items-center justify-center mr-2">
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1V8a1 1 0 00-1-1h-3z" />
          </svg>
        </div>
        
        {/* Navigation Links */}
        <div className="flex items-center space-x-1">
          <Link 
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors" 
            to="/"
          >
            Home
          </Link>
          <Link 
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors" 
            to="/auto"
          >
            Auto Log Export
          </Link>
          <Link 
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors" 
            to="/overlay"
          >
            PDF Overlay
          </Link>
      </div>
      </nav>
      <Routes>
        <Route path="/" element={<LogSheetDemo />} />
        <Route path="/auto" element={<AutoLogExport />} />
        <Route path="/overlay" element={<PdfOverlayWrapper />} />
      </Routes>
      </div>
  )
}

export default App
