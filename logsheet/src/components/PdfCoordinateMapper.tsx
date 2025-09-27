/*
  Intention: This tool helps us map pixel coordinates on the log sheet PDF for fields and grid positions.
  We visually click where each field should be drawn and export a coordinates map for use by PdfOverlayPage.

  High-level responsibilities:
  - Load the log sheet template on a canvas using PDF.js.
  - Let the user select a field name, then click on the PDF to capture its (x, y).
  - Support zoom/pan to precisely place markers.
  - Export results as JSON and TypeScript for downstream consumption.

  Linting note: keep console logs for mapping/debugging; allow 'any' for pdf.js objects.
*/
/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Intention: Point PDF.js to a local worker to avoid CORS issues in dev
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

interface PdfCoordinateMapperProps {
  onCoordinatesFound: (coordinates: Record<string, { x: number; y: number }>) => void;
}

export const PdfCoordinateMapper: React.FC<PdfCoordinateMapperProps> = ({ onCoordinatesFound }) => {
  // Intention: Track current mapping state (which field is active, zoom/pan, history for undo)
  const [coordinates, setCoordinates] = useState<Record<string, { x: number; y: number }>>({});
  const [currentField, setCurrentField] = useState<string>('');
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfError, setPdfError] = useState<string>('');
  const [coordinateHistory, setCoordinateHistory] = useState<Array<Record<string, { x: number; y: number }>>>([]);
  const [zoom, setZoom] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);

  const fields = [
    // Date Fields (mark top-left of each field)
    'dateMonth',
    'dateDay', 
    'dateYear',
    
    // Location Fields (mark top-left of input area)
    'fromLocation',
    'toLocation',
    
    // Carrier Information (mark top-left of input area)
    'carrierName',
    'mainOfficeAddress',
    'homeTerminalAddress',
    
    // Vehicle Information (mark top-left of input area)
    'vehicleInfo',
    'mileageDriving',
    'mileageTotal',
    
    // Grid Structure - Boundaries (mark corners)
    'gridTopLeft',
    'gridTopRight',
    'gridBottomLeft',
    'gridBottomRight',
    
    // Grid Rows (mark left edge at Y-coordinate where horizontal line starts)
    'offDutyRowTop',
    'sleeperBerthRowTop',
    'drivingRowTop',
    'onDutyRowTop',
    'onDutyRowBottom',
    
    // Grid Columns - Time Slots (mark top edge at X-coordinate where vertical line starts)
    'timeColumn12AM',
    'timeColumn1AM',
    'timeColumn2AM',
    'timeColumn3AM',
    'timeColumn4AM',
    'timeColumn5AM',
    'timeColumn6AM',
    'timeColumn7AM',
    'timeColumn8AM',
    'timeColumn9AM',
    'timeColumn10AM',
    'timeColumn11AM',
    'timeColumn12PM',
    'timeColumn1PM',
    'timeColumn2PM',
    'timeColumn3PM',
    'timeColumn4PM',
    'timeColumn5PM',
    'timeColumn6PM',
    'timeColumn7PM',
    'timeColumn8PM',
    'timeColumn9PM',
    'timeColumn10PM',
    'timeColumn11PM',
    
    // Status Labels (mark center of each status label)
    'offDutyLabel',
    'sleeperBerthLabel',
    'drivingLabel',
    'onDutyLabel',
    
    // Totals Section (mark top-left of each field)
    'totalHours',
    'offDutyTotal',
    'sleeperBerthTotal',
    'drivingTotal',
    'onDutyTotal',
    
    // Additional Fields (mark top-left of input area)
    'remarks',
    'shippingDocs',
    'shipperCommodity',
    
    // Recap Section (mark top-left of each field)
    'recapTitle',
    'dailyTotals',
    'recap70A',
    'recap70B',
    'recap70C',
    'recap60A',
    'recap60B',
    'recap60C',
    'restartNote'
  ];

  // Intention: Load and render page 1 of the template as our positioning background
  useEffect(() => {
    const loadPdf = async () => {
      try {
        const pdfUrl = '/log_sheet.pdf';
        console.log('Loading PDF from:', pdfUrl);
        
        // Try loading with different options to handle compression issues
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          verbosity: 0, // Reduce verbosity to minimize warnings
          disableAutoFetch: true,
          disableStream: true,
          disableRange: true
        });
        
        const pdf = await loadingTask.promise;
        
        pdfRef.current = pdf;
        
        // Render first page
        const page = await pdf.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Set canvas size to match PDF page
        const viewport = page.getViewport({ scale: 1.0 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render PDF page
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };

        await page.render(renderContext).promise;
        setPdfLoaded(true);
        console.log('PDF loaded successfully');
        
      } catch (error) {
        console.error('Error loading PDF:', error);
        
        // Try alternative approach - load as array buffer
        try {
          console.log('Trying alternative PDF loading method...');
          const response = await fetch('/log_sheet.pdf');
          const arrayBuffer = await response.arrayBuffer();
          
          const pdf = await pdfjsLib.getDocument({
            data: arrayBuffer,
            verbosity: 0
          }).promise;
          
          pdfRef.current = pdf;
          
          const page = await pdf.getPage(1);
          const canvas = canvasRef.current;
          if (!canvas) return;

          const context = canvas.getContext('2d');
          if (!context) return;

          const viewport = page.getViewport({ scale: 1.0 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };

          await page.render(renderContext).promise;
          setPdfLoaded(true);
          console.log('PDF loaded successfully with alternative method');
          
        } catch (secondError) {
          console.error('Alternative PDF loading also failed:', secondError);
          setPdfError(`Failed to load PDF template. The PDF file may be corrupted or have compression issues. Please try:\n1. Re-saving the PDF with different compression settings\n2. Using a different PDF file\n3. Converting to a simpler PDF format\n\nError: ${secondError.message}`);
        }
      }
    };

    loadPdf();
  }, []);

  // Intention: Whenever coordinates or view transforms change, redraw markers on top of the canvas
  useEffect(() => {
    if (!pdfLoaded) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Only redraw if we have coordinates to show
    if (Object.keys(coordinates).length > 0) {
      drawCoordinateMarkers(ctx, canvas);
    }
  }, [coordinates, pdfLoaded, zoom, panOffset]);

  // Intention: Render red dot + label for every saved field coordinate, respecting zoom/pan
  const drawCoordinateMarkers = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    // Apply zoom and pan transformations
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    // Draw existing coordinates
    Object.entries(coordinates).forEach(([field, coord]) => {
      // Draw red circle
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(coord.x, coord.y, 5 / zoom, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw field name
      ctx.fillStyle = '#000';
      ctx.font = `${12 / zoom}px Arial`;
      ctx.fillText(field, coord.x + 8 / zoom, coord.y - 8 / zoom);
    });

    ctx.restore();
  };

  // Intention: Convert a click on the canvas into PDF coordinate space and save it under the selected field
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentField || !pdfLoaded) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const canvasY = ((event.clientY - rect.top) / rect.height) * canvas.height;

    // Convert canvas coordinates to PDF coordinates accounting for zoom and pan
    const pdfX = (canvasX - panOffset.x) / zoom;
    const pdfY = (canvasY - panOffset.y) / zoom;

    console.log(`Mapping ${currentField}:`, {
      clientX: event.clientX,
      clientY: event.clientY,
      canvasX,
      canvasY,
      pdfX: Math.round(pdfX),
      pdfY: Math.round(pdfY),
      zoom,
      panOffset
    });

    // Save current state to history before making changes
    setCoordinateHistory(prev => [...prev, { ...coordinates }]);

    setCoordinates(prev => ({
      ...prev,
      [currentField]: { x: Math.round(pdfX), y: Math.round(pdfY) }
    }));

    setCurrentField('');
  };

  // Intention: Send mapped coordinates to parent and also copy them to clipboard for easy reuse
  const exportCoordinates = () => {
    console.log('PDF Coordinates:', coordinates);
    onCoordinatesFound(coordinates);
    
    // Copy to clipboard
    const coordString = JSON.stringify(coordinates, null, 2);
    navigator.clipboard.writeText(coordString);
    alert('Coordinates copied to clipboard!');
  };

  // Generate downloadable files for coordinates.json and coordinates.ts
  // Intention: Provide local downloads for coordinates.json and coordinates.ts for versioning/checkout
  const saveCoordinatesFiles = () => {
    const coordJson = JSON.stringify(coordinates, null, 2);

    // Download coordinates.json
    const jsonBlob = new Blob([coordJson], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = 'coordinates.json';
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
    URL.revokeObjectURL(jsonUrl);

    // Build TypeScript content for coordinates.ts
    const tsHeader = `export interface Coordinate {\n  x: number;\n  y: number;\n}\n\nexport type CoordinatesMap = Record<string, Coordinate>;\n\nexport const coordinates: CoordinatesMap = `;
    const tsContent = tsHeader + coordJson + ';\n';

    // Download coordinates.ts
    const tsBlob = new Blob([tsContent], { type: 'text/typescript' });
    const tsUrl = URL.createObjectURL(tsBlob);
    const tsLink = document.createElement('a');
    tsLink.href = tsUrl;
    tsLink.download = 'coordinates.ts';
    document.body.appendChild(tsLink);
    tsLink.click();
    document.body.removeChild(tsLink);
    URL.revokeObjectURL(tsUrl);
  };

  // Intention: If user completes the full set of fields, auto-save to reduce clicks
  useEffect(() => {
    const total = fields.length;
    const mapped = Object.keys(coordinates).length;
    if (total > 0 && mapped === total) {
      saveCoordinatesFiles();
    }
  }, [coordinates]);

  // Intention: Reset all recorded coordinates and visual overlays
  const clearCoordinates = () => {
    setCoordinates({});
    setCoordinateHistory([]);
    // Clear the canvas overlays
    clearCanvasOverlays();
  };

  // Intention: Wipe markers and redraw the base PDF when clearing
  const clearCanvasOverlays = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear the entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw the PDF background
    if (pdfRef.current) {
      const page = pdfRef.current.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };
      
      // Render PDF again
      page.render(renderContext).promise.catch((error) => {
        console.error('Error redrawing PDF after clear:', error);
      });
    }
  };

  // Intention: Step back to last snapshot of coordinates for quick correction
  const undoLastAction = () => {
    if (coordinateHistory.length > 0) {
      const previousState = coordinateHistory[coordinateHistory.length - 1];
      setCoordinates(previousState);
      setCoordinateHistory(prev => prev.slice(0, -1));
      
      // If we're going back to empty state, clear canvas
      if (Object.keys(previousState).length === 0) {
        clearCanvasOverlays();
      }
    }
  };

  // Intention: Mouse interactions to pan (Ctrl+Left or Middle mouse) and buttons to zoom
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || (event.button === 0 && event.ctrlKey)) { // Middle mouse or Ctrl+Left
      setIsDragging(true);
      setDragStart({ x: event.clientX, y: event.clientY });
      event.preventDefault();
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const deltaX = event.clientX - dragStart.x;
      const deltaY = event.clientY - dragStart.y;
      setPanOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      setDragStart({ x: event.clientX, y: event.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mouse wheel zoom disabled - only use + and - buttons

  // Intention: Return zoom/pan to defaults
  const resetView = () => {
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">PDF Coordinate Mapper</h2>
      
      <div className="mb-4">
        <div className="text-sm text-gray-600 mb-4">
          <p className="mb-2">
            <strong>Instructions:</strong> Click on a field name below, then click on the PDF to mark its position.
            The coordinates will be displayed in PDF points.
          </p>
          <div className="bg-blue-50 p-3 rounded border border-blue-200">
            <p className="font-semibold text-blue-800 mb-1">Mapping Guidelines:</p>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• <strong>Text Fields:</strong> Mark top-left corner of input area</li>
              <li>• <strong>Grid Rows:</strong> Mark left edge at Y-coordinate where horizontal line starts</li>
              <li>• <strong>Grid Columns:</strong> Mark top edge at X-coordinate where vertical line starts</li>
              <li>• <strong>Grid Boundaries:</strong> Mark the four corners of the entire grid</li>
              <li>• <strong>Status Labels:</strong> Mark center of each status label</li>
            </ul>
          </div>
        </div>
        
        {!pdfLoaded && !pdfError && (
          <div className="text-blue-600 mb-4">
            Loading PDF template...
          </div>
        )}
        
        {pdfError && (
          <div className="text-red-600 mb-4 p-4 bg-red-50 border border-red-200 rounded">
            <h3 className="font-bold mb-2">PDF Loading Error</h3>
            <pre className="text-sm whitespace-pre-wrap">{pdfError}</pre>
            <div className="mt-4">
              <button
                onClick={() => {
                  setPdfError('');
                  setPdfLoaded(false);
                  // Reload the PDF
                  window.location.reload();
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Retry Loading PDF
              </button>
            </div>
          </div>
        )}
        
        <div className="flex flex-wrap gap-2 mb-4">
          {fields.map(field => (
            <button
              key={field}
              onClick={() => setCurrentField(field)}
              className={`px-3 py-1 rounded text-sm font-medium ${
                currentField === field 
                  ? 'bg-blue-500 text-white border-2 border-blue-700' 
                  : coordinates[field] 
                    ? 'bg-green-500 text-white border-2 border-green-700' 
                    : 'bg-red-200 text-red-800 border-2 border-red-400 hover:bg-red-300'
              }`}
            >
              {field}
            </button>
          ))}
        </div>
        
        <div className="mb-4 text-sm">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-green-500 border-2 border-green-700 rounded"></div>
              <span className="text-green-700 font-medium">Mapped ({Object.keys(coordinates).length})</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-red-200 border-2 border-red-400 rounded"></div>
              <span className="text-red-700 font-medium">Remaining ({fields.length - Object.keys(coordinates).length})</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-blue-500 border-2 border-blue-700 rounded"></div>
              <span className="text-blue-700 font-medium">Selected</span>
            </div>
          </div>
        </div>
        
        {currentField && (
          <p className="text-blue-600 font-medium">
            Click on the PDF to mark position for: <strong>{currentField}</strong>
          </p>
        )}
      </div>

      <div className="mb-4 border border-gray-300 p-4 bg-white">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="border border-gray-300 cursor-crosshair max-w-full h-auto"
          style={{ 
            width: '100%', 
            maxWidth: '612px',
            height: 'auto',
            transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
            transformOrigin: 'top left'
          }}
        />
      </div>

      {/* SUPER PROMINENT Floating Zoom Controls */}
      <div 
        className="fixed top-2 right-2 z-[99999] bg-yellow-400 p-6 rounded-2xl shadow-2xl border-4 border-red-500"
        style={{ 
          position: 'fixed',
          top: '8px',
          right: '8px',
          zIndex: 99999,
          backgroundColor: '#fbbf24',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '4px solid #ef4444'
        }}
      >
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setZoom(prev => Math.max(0.1, prev - 0.1))}
              className="px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 text-2xl font-black shadow-xl"
              style={{ fontSize: '24px', fontWeight: '900' }}
            >
              −
            </button>
            <span 
              className="text-2xl font-black min-w-[100px] text-center bg-blue-200 px-4 py-3 rounded-xl border-4 border-blue-500"
              style={{ fontSize: '20px', fontWeight: '900' }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(prev => Math.min(5.0, prev + 0.1))}
              className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 text-2xl font-black shadow-xl"
              style={{ fontSize: '24px', fontWeight: '900' }}
            >
              +
            </button>
          </div>
          
          <button
            onClick={resetView}
            className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-lg font-black shadow-xl"
            style={{ fontSize: '16px', fontWeight: '900' }}
          >
            Reset
          </button>
        </div>
        
        <div className="text-sm text-gray-800 mt-4 pt-3 border-t-2 border-gray-600 font-bold">
          <div>• Ctrl+Click+Drag: Pan</div>
          <div>• Click: Place marker</div>
        </div>
      </div>

      <div className="space-x-2">
        <button
          onClick={exportCoordinates}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Export Coordinates
        </button>
        
        <button
          onClick={saveCoordinatesFiles}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Save Coordinates (json & ts)
        </button>
        
        <button
          onClick={undoLastAction}
          disabled={coordinateHistory.length === 0}
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Undo Last ({coordinateHistory.length})
        </button>
        
        <button
          onClick={clearCoordinates}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Clear All
        </button>
      </div>

      {Object.keys(coordinates).length > 0 && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h3 className="font-bold mb-2">Current Coordinates:</h3>
          <pre className="text-sm overflow-auto">
            {JSON.stringify(coordinates, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
