/*
  Intention: This component renders a PDF log sheet template and overlays computed trip data (text and grid)
  directly onto an HTML canvas, then exports a final PDF composed from the template plus overlays.

  High-level responsibilities:
  - Load the log sheet template using PDF.js into an offscreen canvas as a background.
  - Draw overlay content (date, locations, carrier/vehicle info, duty grid) using 2D canvas APIs.
  - Optionally render multiple day pages and export them as a single multi-page PDF via pdf-lib.
  - Accept trip data from upstream (AutoLogExport) and normalize it for drawing.

  Notes on linting and debugging:
  - We keep console logging for traceability during mapping and export, so we disable the no-console rule here.
*/
/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Intention: Tell PDF.js where to find its worker script to enable background parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

// Import coordinates from the TypeScript file
import { coordinates } from '../coordinates';

interface LogEntry {
  status: 'OFF' | 'SB' | 'D' | 'ON';
  startTime: string;
  endTime: string;
  startUtc: string;
  endUtc: string;
}

interface LogDaySheetFields {
  dateMonth: string;
  dateDay: string;
  dateYear: string;
  fromLocation: string;
  toLocation: string;
  carrierName: string;
  mainOfficeAddress: string;
  homeTerminalAddress: string;
  vehicleInfo: string;
  mileageDriving: string;
  mileageTotal: string;
  logEntriesUtc: LogEntry[];
}

interface PdfOverlayPageProps {
  tripData?: {
    meta: {
      startDateISO: string;
      origin: string;
      destination: string;
      distanceMeters: number;
    };
    days: Array<Array<{ startUtc: string; endUtc: string; status: 'OFF'|'SB'|'D'|'ON' }>>;
    dailyProgress?: Array<{
      date: string;
      start_location: string;
      end_location: string;
      distance_covered: number;
      total_distance: number;
      driving_hours: number;
    }>;
    notice?: string;
  };
}

export const PdfOverlayPage: React.FC<PdfOverlayPageProps> = ({ tripData }) => {
  /*
    Intention: Manage local UI/data state for a single rendered page and multi-day rendering pipeline.
    - logData: the form-like fields to draw onto the canvas
    - pdfLoaded/pdfError: template load state for guarded drawing
    - dailyCanvasRefs/bgCanvas: per-day and background canvases to avoid re-render jitter
  */
  const [logData, setLogData] = useState<LogDaySheetFields>({
    dateMonth: '12',
    dateDay: '15',
    dateYear: '2024',
    fromLocation: 'New York, NY',
    toLocation: 'Boston, MA',
    carrierName: 'ABC Trucking Co.',
    mainOfficeAddress: '123 Main St, City, State 12345',
    homeTerminalAddress: '456 Terminal Ave, City, State 12345',
    vehicleInfo: 'Truck #12345',
    mileageDriving: '250',
    mileageTotal: '250',
    logEntriesUtc: []
  });

  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfError, setPdfError] = useState<string>('');
  const [autoReady, setAutoReady] = useState<boolean>(false);
  const [autoNotice, setAutoNotice] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);
  // Render PDF page once to an offscreen canvas and reuse
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  
  // Create separate canvas refs for each daily sheet
  const dailyCanvasRefs = useRef<{ [key: number]: HTMLCanvasElement | null }>({});
  const dailyBgCanvasRefs = useRef<{ [key: number]: HTMLCanvasElement | null }>({});

  // Intention: Render the PDF template and overlays for a specific day onto that day's canvas
  const renderPdfForDay = async (dayIndex: number, dayData: any) => {
    console.log(`renderPdfForDay called for day ${dayIndex + 1}`, { dayData });
    const canvas = dailyCanvasRefs.current[dayIndex];
    console.log('Canvas found:', !!canvas, 'PDF ref found:', !!pdfRef.current);
    if (!canvas || !pdfRef.current) {
      console.log('Missing canvas or PDF ref - aborting');
      return;
    }

    try {
      console.log(`Starting PDF render for day ${dayIndex + 1}...`);
      // Use the same method as the working PDF render
      const page = await pdfRef.current.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      console.log('Page and viewport ready:', { viewport: { width: viewport.width, height: viewport.height } });
      
      // Create background canvas for this day
      const bg = document.createElement('canvas');
      bg.width = viewport.width;
      bg.height = viewport.height;
      const bgCtx = bg.getContext('2d');
      if (!bgCtx) {
        console.log('Failed to get background canvas context');
        return;
      }
      
      // Render PDF to background canvas
      console.log('Rendering PDF to background canvas...');
      await page.render({ canvas: bg, canvasContext: bgCtx, viewport }).promise;
      console.log('PDF rendered to background canvas');
      
      // Set up main canvas
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.log('Failed to get main canvas context');
        return;
      }
      
      // Draw background to main canvas
      console.log('Drawing background to main canvas...');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bg, 0, 0);
      console.log('Background drawn to main canvas');
      
      // Draw overlays for this specific day
      console.log('Drawing overlays...');
      drawOverlaysForDay(ctx, dayData);
      console.log(`PDF render complete for day ${dayIndex + 1}`);
    } catch (error) {
      console.error(`Error rendering PDF for day ${dayIndex + 1}:`, error);
    }
  };

  // Intention: Draw all overlay primitives (text + duty grid) for a single day's data onto the provided context
  const drawOverlaysForDay = (ctx: CanvasRenderingContext2D, dayData: any) => {
    // Set up canvas for drawing
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = '12px Arial';
    ctx.fillStyle = '#000000';

    // Draw log sheet information for this day
    const dayDate = dayData.date;
    ctx.fillText(String(dayDate.getMonth() + 1).padStart(2, '0'), coordinates.dateMonth.x, coordinates.dateMonth.y);
    ctx.fillText(String(dayDate.getDate()).padStart(2, '0'), coordinates.dateDay.x, coordinates.dateDay.y);
    ctx.fillText(String(dayDate.getFullYear()), coordinates.dateYear.x, coordinates.dateYear.y);
    
    ctx.fillText(dayData.startLocation, coordinates.fromLocation.x, coordinates.fromLocation.y);
    ctx.fillText(dayData.endLocation, coordinates.toLocation.x, coordinates.toLocation.y);
    
    // Add all the missing logsheet information fields from logData
    ctx.fillText(logData.carrierName, coordinates.carrierName.x, coordinates.carrierName.y);
    ctx.fillText(logData.mainOfficeAddress, coordinates.mainOfficeAddress.x, coordinates.mainOfficeAddress.y);
    ctx.fillText(logData.homeTerminalAddress, coordinates.homeTerminalAddress.x, coordinates.homeTerminalAddress.y);
    ctx.fillText(logData.vehicleInfo, coordinates.vehicleInfo.x, coordinates.vehicleInfo.y);
    
    ctx.fillText(`${dayData.dailyDistance ? dayData.dailyDistance.toFixed(1) : '0.0'} miles`, coordinates.mileageDriving.x, coordinates.mileageDriving.y);
    ctx.fillText(`${dayData.cumulativeDistance ? dayData.cumulativeDistance.toFixed(1) : '0.0'} miles`, coordinates.mileageTotal.x, coordinates.mileageTotal.y);

    // Note: Individual log entries are not drawn as text on the PDF overlay
    // Only the log grid lines are drawn (see drawLogGrid below)

    // Calculate and display duty totals for this day
    const calculateDayDutyTotals = () => {
      const totals = {
        OFF: 0,
        SB: 0,
        D: 0,
        ON: 0
      };

      dayData.logEntries.forEach((entry: any) => {
        const startTime = new Date(entry.startUtc);
        const endTime = new Date(entry.endUtc);
        const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        
        if (entry.status in totals) {
          totals[entry.status as keyof typeof totals] += durationHours;
        }
      });

      return totals;
    };

    const dayDutyTotals = calculateDayDutyTotals();
    console.log(`Day duty totals:`, dayDutyTotals);

    // Display total hours for each duty status
    ctx.fillText(dayDutyTotals.OFF ? dayDutyTotals.OFF.toFixed(1) : '0.0', coordinates.offDutyTotal.x, coordinates.offDutyTotal.y);
      ctx.fillText(dayDutyTotals.SB ? dayDutyTotals.SB.toFixed(1) : '0.0', coordinates.sleeperBerthTotal.x, coordinates.sleeperBerthTotal.y);
      ctx.fillText(dayDutyTotals.D ? dayDutyTotals.D.toFixed(1) : '0.0', coordinates.drivingTotal.x, coordinates.drivingTotal.y);
      ctx.fillText(dayDutyTotals.ON ? dayDutyTotals.ON.toFixed(1) : '0.0', coordinates.onDutyTotal.x, coordinates.onDutyTotal.y);

    // Draw the log grid lines (this is what was missing!)
    // Temporarily set logData.logEntriesUtc to this day's data for drawLogGrid
    const originalLogEntries = logData.logEntriesUtc;
    logData.logEntriesUtc = dayData.logEntries;
    drawLogGrid(ctx);
    // Restore original data
    logData.logEntriesUtc = originalLogEntries;
  };
  
  // Global export calibration (PDF pixels): X>0 moves right, Y>0 moves up
  const [exportXNudge, setExportXNudge] = useState<number>(-15);
  const [exportYNudge, setExportYNudge] = useState<number>(16);
  
  // Intention: Track exporting progress to avoid duplicate clicks and give user feedback
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Intention: Build a brand new PDF and insert one page per day by rasterizing the template and overlays
  const exportAllDailyPdfs = async () => {
    if (!pdfRef.current || dailySheets.length === 0) {
      console.log('No PDF or daily sheets to export');
      return;
    }

    setIsExporting(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Get the original PDF template
      const originalPdf = pdfRef.current;
      const originalPage = await originalPdf.getPage(1);
      const viewport = originalPage.getViewport({ scale: 1.0 });
      
      // For each daily sheet, create a page and draw overlays
      for (let dayIndex = 0; dayIndex < dailySheets.length; dayIndex++) {
        const dayData = dailySheets[dayIndex];
        
        // Create a new page with the same dimensions as the original
        const page = pdfDoc.addPage([viewport.width, viewport.height]);
        
        // Create a canvas to render the PDF with overlays
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        
        // Render the original PDF to canvas
        const bg = document.createElement('canvas');
        bg.width = viewport.width;
        bg.height = viewport.height;
        const bgCtx = bg.getContext('2d');
        if (!bgCtx) continue;
        
        await originalPage.render({ canvas: bg, canvasContext: bgCtx, viewport }).promise;
        
        // Draw background and overlays
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bg, 0, 0);
        
        // Draw overlays for this day
        drawOverlaysForDay(ctx, dayData);
        
        // Convert canvas to image data
        const imageData = canvas.toDataURL('image/png');
        
        // Create PDF page from image
        const image = await pdfDoc.embedPng(imageData);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: viewport.width,
          height: viewport.height,
        });
      }
      
      // Save the combined PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      // Download the PDF
      const link = document.createElement('a');
      link.href = url;
      link.download = `daily-log-sheets-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('Multi-page PDF exported successfully');
    } catch (error) {
      console.error('Error exporting multi-page PDF:', error);
      alert('Error exporting PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Intention: Convert UTC ISO date to a human-readable 12-hour time string (AM/PM) used on overlays
  const toDisplayTime = (iso: string) => {
    console.log('Converting time:', iso);
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) {
      console.log('Invalid date:', iso);
      return '';
    }
    let hours = dt.getUTCHours();
    const minutes = dt.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const minStr = minutes.toString().padStart(2, '0');
    const result = `${hours}:${minStr} ${ampm}`;
    console.log('Converted to:', result);
    return result;
  };

  // Intention: Load the PDF template once, rasterize to an offscreen background canvas, and reuse it for drawing
  useEffect(() => {
    const loadPdf = async () => {
      try {
        console.log('Loading PDF template from /log_sheet.pdf...');
        const loadingTask = pdfjsLib.getDocument({
          url: `/log_sheet.pdf?v=${Date.now()}`,
          verbosity: 0,
          disableAutoFetch: true,
          disableStream: true,
          disableRange: true
        });

        const pdf = await loadingTask.promise;
        console.log('PDF loaded successfully:', pdf);
        console.log('PDF numPages:', pdf.numPages);
        pdfRef.current = pdf;
        
        const page = await pdf.getPage(1);
        console.log('Got page 1:', page);
        const viewport = page.getViewport({ scale: 1.0 });
        console.log('Viewport:', { width: viewport.width, height: viewport.height });
        
        // Render PDF into an offscreen background canvas
        const bg = document.createElement('canvas');
        bg.width = viewport.width;
        bg.height = viewport.height;
        const bgCtx = bg.getContext('2d');
        if (!bgCtx) {
          console.log('Failed to get background canvas context');
          return;
        }
        console.log('Rendering PDF to background canvas...');
        await page.render({ canvas: bg, canvasContext: bgCtx, viewport }).promise;
        console.log('PDF rendered to background canvas');
        bgCanvasRef.current = bg;

        // PDF template is now loaded and ready for daily sheets
        console.log('PDF template loaded and ready for daily sheets');
        setPdfLoaded(true);
        
        // Also render to default canvas for fallback section
        const defaultCanvas = canvasRef.current;
        if (defaultCanvas) {
          console.log('Rendering to default canvas for fallback section...');
          defaultCanvas.width = viewport.width;
          defaultCanvas.height = viewport.height;
          const defaultCtx = defaultCanvas.getContext('2d');
          if (defaultCtx) {
            defaultCtx.clearRect(0, 0, defaultCanvas.width, defaultCanvas.height);
            defaultCtx.drawImage(bg, 0, 0);
            console.log('Default canvas rendered');
          }
        }
      } catch (error) {
        console.error('Error loading PDF:', error);
        setPdfError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    loadPdf();
  }, []);

  // Intention: Translate server-provided tripData into local overlay fields; keep UI robust if tripData is absent
  useEffect(() => {
    if (!tripData) {
      console.log('PDF Overlay - No trip data provided, using default values');
      return;
    }

    console.log('PDF Overlay - Processing trip data:', tripData);

    const toCityState = (addr: string): string => {
      if (!addr) return '';
      const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const maybeStateZip = parts[parts.length - 2] || '';
        const maybeCity = parts[parts.length - 3] || parts[parts.length - 2] || parts[0] || '';
        const stateMatch = maybeStateZip.match(/\b([A-Z]{2})\b/);
        if (stateMatch && maybeCity) {
          return `${maybeCity}, ${stateMatch[1]}`;
        }
        const simpleMatch = addr.match(/([^,]+),\s*([A-Z]{2})\b/);
        if (simpleMatch) return `${simpleMatch[1].trim()}, ${simpleMatch[2]}`;
      }
      return addr;
    };

    try {
      const { meta, days, notice } = tripData;
      
      const startISO: string = meta.startDateISO || new Date().toISOString().slice(0,10);
      const d = new Date(startISO);
      const miles = Math.round((meta.distanceMeters || meta.distanceMeters === 0 ? meta.distanceMeters : 0) * 0.000621371);
      const firstDay = Array.isArray(days) && days.length > 0 ? days[0] : [];
      console.log('PDF Overlay - First day after processing:', firstDay);

      // Normalize segments to ensure coverage from 00:00 to 23:59 with OFF padding
      const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
      const dayEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 0));
      const sortByStart = [...firstDay].sort((a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime());
      const normalized: { status: 'OFF'|'SB'|'D'|'ON'; startUtc: string; endUtc: string }[] = [];
      if (sortByStart.length === 0 || new Date(sortByStart[0].startUtc) > dayStart) {
        normalized.push({ status: 'OFF', startUtc: dayStart.toISOString(), endUtc: (sortByStart[0]?.startUtc || dayEnd.toISOString()) });
      }
      for (let i = 0; i < sortByStart.length; i++) {
        const seg = sortByStart[i];
        normalized.push({ status: seg.status, startUtc: seg.startUtc, endUtc: seg.endUtc });
        const next = sortByStart[i + 1];
        if (next) {
          const thisEnd = new Date(seg.endUtc);
          const nextStart = new Date(next.startUtc);
          if (nextStart > thisEnd) {
            // pad gap with OFF
            normalized.push({ status: 'OFF', startUtc: thisEnd.toISOString(), endUtc: nextStart.toISOString() });
          }
        }
      }
      const lastEnd = new Date((sortByStart[sortByStart.length - 1]?.endUtc) || dayStart.toISOString());
      if (lastEnd < dayEnd) {
        normalized.push({ status: 'OFF', startUtc: lastEnd.toISOString(), endUtc: dayEnd.toISOString() });
      }


      // Create the new log data directly with all required fields
      const finalLogData = {
        dateMonth: String(d.getMonth() + 1).padStart(2,'0'),
        dateDay: String(d.getDate()).padStart(2,'0'),
        dateYear: String(d.getFullYear()),
        fromLocation: toCityState(meta.origin || ''),
        toLocation: toCityState(meta.destination || ''),
        carrierName: 'ABC Trucking Co.',
        mainOfficeAddress: '123 Main St, City, State 12345',
        homeTerminalAddress: '456 Terminal Ave, City, State 12345',
        vehicleInfo: 'Truck #12345',
        mileageDriving: String(miles || 0),
        mileageTotal: String(miles || 0),
        logEntriesUtc: normalized.map(s => ({
          status: s.status,
          startTime: toDisplayTime(s.startUtc),
          endTime: toDisplayTime(s.endUtc),
          startUtc: s.startUtc,
          endUtc: s.endUtc,
        }))
      };
      
      console.log('Final log data being set:', finalLogData);
      
      // Set the data directly
      setLogData(finalLogData);
      setAutoReady(true);
      if (notice) setAutoNotice(notice);
      
    } catch (e) {
      console.error('Failed to process trip data:', e);
    }
  }, [tripData]);

  // Intention: This component does not persist state; upstream provides the data for export

  // Debug: Log when logData changes
  useEffect(() => {
    console.log('logData state updated:', logData);
  }, [logData]);

  // Intention: When template is ready or data changes, redraw overlays once using background canvas to prevent flicker
  useEffect(() => {
    if (!pdfLoaded) return;

    const drawAll = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgCanvasRef.current) {
        ctx.drawImage(bgCanvasRef.current, 0, 0);
      }
      try {
        drawOverlayContent(ctx);
      } catch (error) {
        console.error('Error drawing overlays:', error);
      }
    };

    // Schedule with rAF to avoid race/flicker
    frameRef.current && cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(drawAll);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [pdfLoaded, logData]);

  // Intention: Keep canvas contents crisp when the window is resized by redrawing background + overlays
  useEffect(() => {
    const onResize = () => {
      if (!pdfLoaded) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgCanvasRef.current) {
        ctx.drawImage(bgCanvasRef.current, 0, 0);
      }
      try {
        drawOverlayContent(ctx);
      } catch (e) {
        console.error('Error drawing overlays on resize:', e);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pdfLoaded]);

  // Intention: Aggregate OFF/SB/D/ON totals for the day from log entries for printing on the sheet
  const calculateDutyTotals = () => {
    const totals = {
      OFF: 0,
      SB: 0,
      D: 0,
      ON: 0
    };

    logData.logEntriesUtc.forEach(entry => {
      const startTime = new Date(entry.startUtc);
      const endTime = new Date(entry.endUtc);
      const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      
      if (entry.status in totals) {
        totals[entry.status as keyof typeof totals] += durationHours;
      }
    });

    return totals;
  };

  // Intention: Draws the single-page overlay (text fields + duty grid) using the current logData into ctx
  const drawOverlayContent = (ctx: CanvasRenderingContext2D) => {
    ctx.save();

    // Draw text overlays
    ctx.fillStyle = '#000000';
    ctx.font = '12px Helvetica';
    // Ensure coordinates represent the TOP-LEFT of the text box
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    
    // Debug: Log coordinates being used
    console.log('Using coordinates:', {
      dateMonth: coordinates.dateMonth,
      dateDay: coordinates.dateDay,
      dateYear: coordinates.dateYear
    });
    
    // Date fields
    ctx.fillText(logData.dateMonth, coordinates.dateMonth.x, coordinates.dateMonth.y);
    ctx.fillText(logData.dateDay, coordinates.dateDay.x, coordinates.dateDay.y);
    ctx.fillText(logData.dateYear, coordinates.dateYear.x, coordinates.dateYear.y);
    
    // Location fields
    ctx.fillText(logData.fromLocation, coordinates.fromLocation.x, coordinates.fromLocation.y);
    ctx.fillText(logData.toLocation, coordinates.toLocation.x, coordinates.toLocation.y);
    
    // Carrier info
    ctx.fillText(logData.carrierName, coordinates.carrierName.x, coordinates.carrierName.y);
    ctx.fillText(logData.mainOfficeAddress, coordinates.mainOfficeAddress.x, coordinates.mainOfficeAddress.y);
    ctx.fillText(logData.homeTerminalAddress, coordinates.homeTerminalAddress.x, coordinates.homeTerminalAddress.y);
    
    // Vehicle info
    ctx.fillText(logData.vehicleInfo, coordinates.vehicleInfo.x, coordinates.vehicleInfo.y);
    ctx.fillText(logData.mileageDriving, coordinates.mileageDriving.x, coordinates.mileageDriving.y);
    ctx.fillText(logData.mileageTotal, coordinates.mileageTotal.x, coordinates.mileageTotal.y);

    // Calculate and display duty totals
    const dutyTotals = calculateDutyTotals();
    console.log('Duty totals calculated:', dutyTotals);
    
    // Display total hours for each duty status
    ctx.fillText(dutyTotals.OFF ? dutyTotals.OFF.toFixed(1) : '0.0', coordinates.offDutyTotal.x, coordinates.offDutyTotal.y);
      ctx.fillText(dutyTotals.SB ? dutyTotals.SB.toFixed(1) : '0.0', coordinates.sleeperBerthTotal.x, coordinates.sleeperBerthTotal.y);
      ctx.fillText(dutyTotals.D ? dutyTotals.D.toFixed(1) : '0.0', coordinates.drivingTotal.x, coordinates.drivingTotal.y);
      ctx.fillText(dutyTotals.ON ? dutyTotals.ON.toFixed(1) : '0.0', coordinates.onDutyTotal.x, coordinates.onDutyTotal.y);

    // Draw log grid lines (continuous polyline midnight -> midnight)
    drawLogGrid(ctx);

    ctx.restore();
  };

  // Intention: Render a single continuous polyline across the grid, switching rows on duty status transitions
  const drawLogGrid = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;

    // Grid box and layout
    const gridLeft = coordinates.gridTopLeft.x;
    const gridRight = coordinates.gridTopRight.x;
    const gridTop = coordinates.gridTopLeft.y;
    const gridBottom = coordinates.gridBottomLeft.y;
    const gridWidth = gridRight - gridLeft;
    const hourStep = gridWidth / 24;
    const baseX = gridLeft;
    const dutyStatuses = ['OFF', 'SB', 'D', 'ON'];
    const rowTopCoordinates = [
      coordinates.offDutyRowTop,
      coordinates.sleeperBerthRowTop,
      coordinates.drivingRowTop,
      coordinates.onDutyRowTop
    ];
    const rowHeights = [
      coordinates.sleeperBerthRowTop.y - coordinates.offDutyRowTop.y,
      coordinates.drivingRowTop.y - coordinates.sleeperBerthRowTop.y,
      coordinates.onDutyRowTop.y - coordinates.drivingRowTop.y,
      coordinates.onDutyRowBottom.y - coordinates.onDutyRowTop.y
    ];

    // Build a continuous polyline from 00:00 to 24:00 switching rows at transitions
    const segments = [...logData.logEntriesUtc]
      .map(s => ({
        status: s.status,
        startHour: Math.max(0, new Date(s.startUtc).getUTCHours() + new Date(s.startUtc).getUTCMinutes() / 60),
        endHour: Math.min(24, new Date(s.endUtc).getUTCHours() + new Date(s.endUtc).getUTCMinutes() / 60)
      }))
      .filter(s => s.endHour > s.startHour)
      .sort((a, b) => a.startHour - b.startHour);

    if (segments.length === 0) return;

    const xForHour = (h: number) => Math.max(gridLeft, Math.min(gridRight, baseX + h * hourStep));
    const yForStatus = (status: string) => {
      const idx = dutyStatuses.indexOf(status);
      const top = rowTopCoordinates[idx].y;
      return Math.max(gridTop, Math.min(gridBottom, top + rowHeights[idx] / 2));
    };

    let currentHour = 0;
    let currentY = yForStatus(segments[0].status);

    // Start at midnight
    ctx.beginPath();
    ctx.moveTo(xForHour(currentHour), currentY);

    segments.forEach((seg) => {
      const segY = yForStatus(seg.status);
      const segStartX = xForHour(seg.startHour);
      const segEndX = xForHour(seg.endHour);

      // Vertical connector at segment start if row changes
      if (Math.abs(segY - currentY) > 0.1) {
        ctx.lineTo(segStartX, currentY);
        ctx.lineTo(segStartX, segY);
      } else if (segStartX > xForHour(currentHour)) {
        // Move horizontally to the start of this segment if gap
        ctx.lineTo(segStartX, currentY);
      }

      // Horizontal along this status row
      ctx.lineTo(segEndX, segY);
      currentY = segY;
      currentHour = seg.endHour;
    });

    // Extend to 24:00
    if (currentHour < 24) {
      ctx.lineTo(xForHour(24), currentY);
    }
    ctx.stroke();
  };

  // Intention: Single-page export of the currently visible canvas (template + overlay) via pdf-lib
  const exportPdf = async () => {
    try {
      // Load the PDF template with cache buster
      const templateResponse = await fetch(`/log_sheet.pdf?v=${Date.now()}`);
      if (!templateResponse.ok) {
        throw new Error('Failed to load PDF template');
      }
      const templateBytes = await templateResponse.arrayBuffer();

      // Create a new single-page doc from page 1 of template
      const templateDoc = await PDFDocument.load(templateBytes);
      const newDoc = await PDFDocument.create();
      const [copiedPage] = await newDoc.copyPages(templateDoc, [0]);
      newDoc.addPage(copiedPage);
      const page = newDoc.getPage(0);
      const { width, height } = page.getSize();

      // WYSIWYG: embed the visible canvas (background + overlays)
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not available for export');
      const dataUrl = canvas.toDataURL('image/png');
      const pngImage = await newDoc.embedPng(dataUrl);
      page.drawImage(pngImage, { x: 0, y: 0, width, height });

      // Save and download (timestamped to avoid caching)
      const pdfBytes = await newDoc.save();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `logsheet_overlay_${logData.dateMonth}_${logData.dateDay}_${logData.dateYear}_${ts}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert('PDF exported successfully!');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Error exporting PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleInputChange = (field: keyof LogDaySheetFields, value: string) => {
    setLogData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Removed unused functions: addLogEntry and removeLogEntry

  const updateLogEntry = (index: number, field: keyof LogEntry, value: string) => {
    setLogData(prev => ({
      ...prev,
      logEntriesUtc: prev.logEntriesUtc.map((entry, i) => 
        i === index ? { ...entry, [field]: value } : entry
      )
    }));
  };

  // Generate multiple daily sheets if dailyProgress is available
  const generateDailySheets = () => {
    console.log('generateDailySheets - tripData:', tripData);
    console.log('generateDailySheets - dailyProgress:', tripData?.dailyProgress);
    console.log('generateDailySheets - days:', tripData?.days);
    if (!tripData?.dailyProgress || tripData.dailyProgress.length === 0) {
      console.log('No daily progress data available');
      return []; // Return empty array if no daily progress
    }

    return tripData.dailyProgress.map((day, index) => {
      // Calculate the correct date by adding days to the start date
      const startDate = new Date(tripData.meta.startDateISO);
      const dayDate = new Date(startDate);
      dayDate.setDate(startDate.getDate() + index);
      const dayLogEntries = tripData.days[index] || [];
      console.log(`Day ${index + 1} log entries:`, dayLogEntries);
      
      // Generate duty status entries for this specific day
      const dutyStatusEntries = dayLogEntries.map(entry => {
        const startTime = new Date(entry.startUtc);
        const endTime = new Date(entry.endUtc);
        
        return {
          status: entry.status,
          startTime: startTime.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
          }),
          endTime: endTime.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
          })
        };
      });
      
             return {
               date: dayDate,
               startLocation: day.start_location,
               endLocation: day.end_location,
               dailyDistance: (day as any).daily_distance || day.distance_covered,  // Distance driven this day
               cumulativeDistance: (day as any).cumulative_distance || day.total_distance,  // Total distance from start
               drivingHours: day.driving_hours,
               logEntries: dayLogEntries,
               dutyStatusEntries: dutyStatusEntries
             };
    });
  };

  const dailySheets = generateDailySheets();

  // Render PDF for each day when data is available
  useEffect(() => {
    console.log('PDF render useEffect triggered:', { pdfLoaded, dailySheetsLength: dailySheets.length });
    if (pdfLoaded && dailySheets.length > 0) {
      console.log('Starting to render daily PDFs...');
      // Render each day with delay to avoid PDF.js conflicts
      const renderAllDays = async () => {
        for (let i = 0; i < dailySheets.length; i++) {
          console.log(`Rendering PDF for day ${i + 1}...`);
          await renderPdfForDay(i, dailySheets[i]);
          // Longer delay between renders to ensure PDF.js is ready
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        console.log('All daily PDFs rendered');
      };
      renderAllDays();
    } else {
      console.log('Not rendering PDFs - pdfLoaded:', pdfLoaded, 'dailySheets.length:', dailySheets.length);
    }
  }, [pdfLoaded, dailySheets]);

  // Handle default PDF overlays for fallback section
  useEffect(() => {
    if (pdfLoaded && dailySheets.length === 0 && canvasRef.current && bgCanvasRef.current) {
      console.log('Rendering default PDF overlays...');
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Redraw background
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bgCanvasRef.current, 0, 0);
        // Draw overlays
        drawOverlayContent(ctx);
        console.log('Default PDF overlays rendered');
      }
    }
  }, [pdfLoaded, logData, dailySheets.length]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Floating Export Button */}
      {dailySheets.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={exportAllDailyPdfs}
            disabled={isExporting || !pdfLoaded}
            className={`px-6 py-3 rounded-lg font-semibold shadow-lg transition-all duration-200 ${
              isExporting || !pdfLoaded
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-xl'
            }`}
          >
            {isExporting ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Exporting...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export All Days ({dailySheets.length} pages)</span>
              </div>
            )}
          </button>
        </div>
      )}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">PDF Log Sheet Overlay</h1>
        <p className="text-gray-600">Multi-day log sheets for your journey</p>
        {autoNotice && (
          <div className="mt-3 p-3 rounded-md border border-green-300 bg-green-50 text-green-700">
            {autoNotice}
          </div>
        )}
      </div>

      {/* Multiple Daily Sheets */}
      <div className="space-y-8">
        {dailySheets.map((sheet, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow-md">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Day {index + 1} - {sheet.date.toLocaleDateString()}</h2>
                     <div className="grid grid-cols-2 gap-4 mt-2 text-sm text-gray-600">
                       <div>
                         <strong>From:</strong> {sheet.startLocation}
                       </div>
                       <div>
                         <strong>To:</strong> {sheet.endLocation}
                       </div>
                       <div>
                         <strong>Daily Distance:</strong> {sheet.dailyDistance ? sheet.dailyDistance.toFixed(1) : '0.0'} miles
                       </div>
                       <div>
                         <strong>Cumulative Distance:</strong> {sheet.cumulativeDistance ? sheet.cumulativeDistance.toFixed(1) : '0.0'} miles
                       </div>
                     </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form Section for this day */}
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold mb-3">Log Sheet Information</h3>
            
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                      <input
                        type="text"
                        value={String(sheet.date.getMonth() + 1).padStart(2, '0')}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                      <input
                        type="text"
                        value={String(sheet.date.getDate()).padStart(2, '0')}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                      <input
                        type="text"
                        value={String(sheet.date.getFullYear())}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">From Location</label>
                      <input
                        type="text"
                        value={sheet.startLocation}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">To Location</label>
                      <input
                        type="text"
                        value={sheet.endLocation}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Carrier Name</label>
                      <input
                        type="text"
                        value={logData.carrierName}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Main Office Address</label>
                      <input
                        type="text"
                        value={logData.mainOfficeAddress}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Home Terminal Address</label>
                      <input
                        type="text"
                        value={logData.homeTerminalAddress}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Info</label>
                      <input
                        type="text"
                        value={logData.vehicleInfo}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                      />
                    </div>
                           <div className="grid grid-cols-2 gap-4">
                             <div>
                               <label className="block text-sm font-medium text-gray-700 mb-1">Daily Distance Driven</label>
                               <input
                                 type="text"
                                 value={`${sheet && sheet.dailyDistance ? sheet.dailyDistance.toFixed(1) : '0.0'} miles`}
                                 disabled={true}
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                               />
                             </div>
                             <div>
                               <label className="block text-sm font-medium text-gray-700 mb-1">Cumulative Distance from Start</label>
                               <input
                                 type="text"
                                 value={`${sheet && sheet.cumulativeDistance ? sheet.cumulativeDistance.toFixed(1) : '0.0'} miles`}
                                 disabled={true}
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                               />
                             </div>
                           </div>
                  </div>
                </div>
              </div>

              {/* Duty Status Entries for this day */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4">Duty Status Entries - Day {index + 1}</h3>
                <div className="space-y-3">
                  {sheet.logEntries.map((entry, entryIndex) => (
                    <div key={entryIndex} className="flex items-center space-x-3 p-3 bg-white rounded border">
                      <select
                        value={entry.status}
                        disabled={true}
                        className="duty-status-select"
                      >
                        <option value="OFF">OFF</option>
                        <option value="SB">SB</option>
                        <option value="D">D</option>
                        <option value="ON">ON</option>
                      </select>
                      <input
                        type="text"
                        value={toDisplayTime(entry.startUtc)}
                        readOnly
                        placeholder="Start Time"
                        className="px-3 py-1 border border-gray-300 rounded bg-gray-100"
                      />
                      <input
                        type="text"
                        value={toDisplayTime(entry.endUtc)}
                        readOnly
                        placeholder="End Time"
                        className="px-3 py-1 border border-gray-300 rounded bg-gray-100"
                      />
                    </div>
                  ))}
                  {sheet.logEntries.length === 0 && (
                    <div className="text-sm text-gray-500">No entries for this day</div>
                  )}
                </div>
              </div>

              {/* PDF Preview Section for this day */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4">PDF Preview - Day {index + 1}</h3>
                <div className="border border-gray-300 p-4 bg-white">
                  <canvas
                    ref={(el) => {
                      if (el) {
                        dailyCanvasRefs.current[index] = el;
                      }
                    }}
                    className="border border-gray-300 max-w-full h-auto"
                    style={{ width: '100%', maxWidth: '612px', height: 'auto' }}
                  />
                  {/* Hidden background canvas for this day */}
                  <canvas
                    ref={(el) => {
                      if (el) {
                        dailyBgCanvasRefs.current[index] = el;
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Fallback to single sheet if no daily progress */}
      {dailySheets.length === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form Section */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Log Sheet Information</h2>
              
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                  <input
                    type="text"
                    value={logData.dateMonth}
                    onChange={(e) => handleInputChange('dateMonth', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                  <input
                    type="text"
                    value={logData.dateDay}
                    onChange={(e) => handleInputChange('dateDay', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                  <input
                    type="text"
                    value={logData.dateYear}
                    onChange={(e) => handleInputChange('dateYear', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Location</label>
                  <input
                    type="text"
                    value={logData.fromLocation}
                    onChange={(e) => handleInputChange('fromLocation', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Location</label>
                  <input
                    type="text"
                    value={logData.toLocation}
                    onChange={(e) => handleInputChange('toLocation', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Carrier Name</label>
                  <input
                    type="text"
                    value={logData.carrierName}
                    onChange={(e) => handleInputChange('carrierName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Main Office Address</label>
                  <input
                    type="text"
                    value={logData.mainOfficeAddress}
                    onChange={(e) => handleInputChange('mainOfficeAddress', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Home Terminal Address</label>
                  <input
                    type="text"
                    value={logData.homeTerminalAddress}
                    onChange={(e) => handleInputChange('homeTerminalAddress', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Info</label>
                  <input
                    type="text"
                    value={logData.vehicleInfo}
                    onChange={(e) => handleInputChange('vehicleInfo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mileage Driving</label>
                    <input
                      type="text"
                      value={logData.mileageDriving}
                      onChange={(e) => handleInputChange('mileageDriving', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mileage Total</label>
                    <input
                      type="text"
                      value={logData.mileageTotal}
                      onChange={(e) => handleInputChange('mileageTotal', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Log Entries */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Duty Status Entries</h2>
              </div>

              <div className="space-y-3">
                {logData.logEntriesUtc.map((entry, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded">
                    <select
                      value={entry.status}
                      onChange={(e) => updateLogEntry(index, 'status', e.target.value as 'OFF' | 'SB' | 'D' | 'ON')}
                      className="px-3 py-1 border border-gray-300 rounded"
                    >
                      <option value="OFF">OFF</option>
                      <option value="SB">SB</option>
                      <option value="D">D</option>
                      <option value="ON">ON</option>
                    </select>
                    <input
                      type="text"
                      value={entry.startTime}
                      onChange={(e) => updateLogEntry(index, 'startTime', e.target.value)}
                      placeholder="Start Time"
                      className="px-3 py-1 border border-gray-300 rounded"
                    />
                    <input
                      type="text"
                      value={entry.endTime}
                      onChange={(e) => updateLogEntry(index, 'endTime', e.target.value)}
                      placeholder="End Time"
                      className="px-3 py-1 border border-gray-300 rounded"
                    />
                  </div>
                ))}
                {logData.logEntriesUtc.length === 0 && (
                  <div className="text-sm text-gray-500">No entries yet. Generate logs from the Auto Log Export page.</div>
                )}
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={exportPdf}
                disabled={!autoReady}
                className={`px-6 py-3 rounded-lg font-semibold ${autoReady ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
              >
                Export PDF
              </button>
              <div className="flex items-center space-x-2 hidden">
                <label className="text-sm text-gray-700">X offset (px):</label>
                <input
                  type="number"
                  value={exportXNudge}
                  onChange={(e) => setExportXNudge(parseInt(e.target.value || '0', 10))}
                  className="w-24 px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div className="flex items-center space-x-2 hidden">
                <label className="text-sm text-gray-700">Y offset (px):</label>
                <input
                  type="number"
                  value={exportYNudge}
                  onChange={(e) => setExportYNudge(parseInt(e.target.value || '0', 10))}
                  className="w-24 px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <button
                onClick={() => window.history.back()}
                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-semibold hidden"
              >
                Back to Coordinate Mapper
              </button>
            </div>
          </div>

          {/* PDF Preview Section */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">PDF Preview</h2>
            
            {!pdfLoaded && !pdfError && (
              <div className="text-blue-600 mb-4">
                Loading PDF template...
              </div>
            )}
            
            {pdfError && (
              <div className="text-red-600 mb-4 p-4 bg-red-50 border border-red-200 rounded">
                <h3 className="font-bold mb-2">PDF Loading Error</h3>
                <pre className="text-sm whitespace-pre-wrap">{pdfError}</pre>
              </div>
            )}
            
            <div className="border border-gray-300 p-4 bg-white">
              <canvas
                ref={canvasRef}
                className="border border-gray-300 max-w-full h-auto"
                style={{ width: '100%', maxWidth: '612px', height: 'auto' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
