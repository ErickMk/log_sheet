import React, { useState } from 'react';
import { PdfCoordinateMapper } from './PdfCoordinateMapper';
import { AutoLogExport } from './AutoLogExport';
import { PdfOverlayPage } from './PdfOverlayPage';
import type { LogDaySheetFields } from '../types/logsheet';
import { exportTemplateBasedPDF, previewPdfTemplate } from '../utils/templatePdfExport';

// Sample data for demonstration
const sampleLogData: LogDaySheetFields = {
  dateLocalISO: '2025-01-24',
  driverHomeTz: 'America/Chicago',
  fromLocation: 'Chicago, IL',
  carrierName: 'Sample Trucking Co.',
  mainOfficeAddress: '123 Main St, Chicago, IL 60601',
  homeTerminalAddress: '456 Terminal Blvd, Chicago, IL 60602',
  truckTractorAndTrailer: 'Truck: ABC-123, Trailer: XYZ-789',
  totalMilesDrivingToday: 450,
  totalMileageToday: 450,
  shippingDocuments: ['BOL-001', 'Invoice-002'],
  shipperCommodity: 'General Freight',
  remarks: 'Route completed on time. No issues encountered. Fuel stop at mile 200.',
  cycle: '70/8',
  logEntriesUtc: [
    // Sample day: 8 hours driving, 2 hours on duty, 14 hours off duty
    { status: 'OFF', startUtc: '2025-01-24T00:00:00Z', endUtc: '2025-01-24T08:00:00Z' }, // 8h off duty
    { status: 'D', startUtc: '2025-01-24T08:00:00Z', endUtc: '2025-01-24T12:00:00Z' },   // 4h driving
    { status: 'ON', startUtc: '2025-01-24T12:00:00Z', endUtc: '2025-01-24T13:00:00Z' },  // 1h on duty (lunch)
    { status: 'D', startUtc: '2025-01-24T13:00:00Z', endUtc: '2025-01-24T17:00:00Z' },   // 4h driving
    { status: 'ON', startUtc: '2025-01-24T17:00:00Z', endUtc: '2025-01-24T18:00:00Z' },  // 1h on duty (unloading)
    { status: 'OFF', startUtc: '2025-01-24T18:00:00Z', endUtc: '2025-01-25T00:00:00Z' }, // 6h off duty
  ]
};

export const LogSheetDemo: React.FC = () => {
  const [logData, setLogData] = useState<LogDaySheetFields>(sampleLogData);
  const [showCoordinateMapper, setShowCoordinateMapper] = useState(false);
  const [showOverlayPage, setShowOverlayPage] = useState(false);
  const [showAutoPlanner, setShowAutoPlanner] = useState(false);

  const handleFieldChange = (field: keyof LogDaySheetFields, value: any) => {
    setLogData(prev => ({ ...prev, [field]: value }));
  };

  const addLogEntry = () => {
    const newEntry = {
      status: 'OFF' as const,
      startUtc: '2025-01-24T20:00:00Z',
      endUtc: '2025-01-24T22:00:00Z'
    };
    setLogData(prev => ({
      ...prev,
      logEntriesUtc: [...prev.logEntriesUtc, newEntry]
    }));
  };


  // Removed unused function: handleTemplateBasedExport

      // Export using template overlay
      await exportTemplateBasedPDF(logData);
      
      // Reset button state
      if (button) {
        button.disabled = false;
        button.textContent = 'Export Template PDF';
      }
      
    } catch (error) {
      console.error('Template export failed:', error);
      alert('Failed to export template PDF. Please ensure Logsheet.pdf is in the public folder.');
      
      // Reset button state
      const button = document.querySelector('[data-template-export-button]') as HTMLButtonElement;
      if (button) {
        button.disabled = false;
        button.textContent = 'Export Template PDF';
      }
    }
  };

  const handlePreviewTemplate = async () => {
    try {
      await previewPdfTemplate();
    } catch (error) {
      console.error('Preview failed:', error);
      alert('Failed to preview template. Please ensure Logsheet.pdf is in the public folder.');
    }
  };

  const handleCoordinatesFound = (coordinates: Record<string, { x: number; y: number }>) => {
    console.log('New coordinates found:', coordinates);
    // You can update the PDF_COORDINATES in pdfTemplateOverlay.ts with these values
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Driver's Log Sheet Demo</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls Panel */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Log Sheet Fields</h2>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input
                  type="date"
                  value={logData.dateLocalISO}
                  onChange={(e) => handleFieldChange('dateLocalISO', e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">From Location</label>
                <input
                  type="text"
                  value={logData.fromLocation || ''}
                  onChange={(e) => handleFieldChange('fromLocation', e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Carrier Name</label>
                <input
                  type="text"
                  value={logData.carrierName || ''}
                  onChange={(e) => handleFieldChange('carrierName', e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Truck/Trailer</label>
                <input
                  type="text"
                  value={logData.truckTractorAndTrailer || ''}
                  onChange={(e) => handleFieldChange('truckTractorAndTrailer', e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Total Miles Driving</label>
                <input
                  type="number"
                  value={logData.totalMilesDrivingToday || ''}
                  onChange={(e) => handleFieldChange('totalMilesDrivingToday', parseInt(e.target.value) || 0)}
                  className="w-full p-2 border rounded"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Remarks</label>
                <textarea
                  value={logData.remarks || ''}
                  onChange={(e) => handleFieldChange('remarks', e.target.value)}
                  className="w-full p-2 border rounded h-20"
                />
              </div>
            </div>
            
            <div className="mt-4 space-x-2">
              <button
                onClick={addLogEntry}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Add Log Entry
              </button>
              {/* Removed legacy Export PDF button to avoid confusion with overlay export */}
              <button
                onClick={handlePreviewTemplate}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Preview Template
              </button>
              <button
                onClick={() => setShowCoordinateMapper(!showCoordinateMapper)}
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
              >
                {showCoordinateMapper ? 'Hide' : 'Show'} Coordinate Mapper
              </button>
              <button 
                onClick={() => setShowOverlayPage(true)}
                className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 font-semibold"
              >
                Go to PDF Overlay Page
              </button>
              <button 
                onClick={() => setShowAutoPlanner(true)}
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-semibold"
              >
                Open Auto Log Export
              </button>
            </div>
          </div>
          
          {/* Log Entries List */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-3">Log Entries</h3>
            <div className="space-y-2">
              {logData.logEntriesUtc.map((entry, index) => (
                <div key={index} className="flex items-center space-x-2 text-sm">
                  <span className={`px-2 py-1 rounded text-xs ${
                    entry.status === 'OFF' ? 'bg-gray-200' :
                    entry.status === 'SB' ? 'bg-blue-200' :
                    entry.status === 'D' ? 'bg-red-200' :
                    'bg-yellow-200'
                  }`}>
                    {entry.status}
                  </span>
                  <span>{new Date(entry.startUtc).toLocaleTimeString()}</span>
                  <span>-</span>
                  <span>{new Date(entry.endUtc).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* PDF Coordinate Mapper */}
      {showCoordinateMapper && (
        <div className="mt-8">
          <PdfCoordinateMapper onCoordinatesFound={handleCoordinatesFound} />
        </div>
      )}
      
      {/* PDF Overlay Page */}
      {showOverlayPage && (
        <div className="mt-8">
          <PdfOverlayPage />
        </div>
      )}

      {/* Auto Planner Page */}
      {showAutoPlanner && (
        <div className="mt-8">
          <AutoLogExport />
        </div>
      )}
    </div>
  );
};
