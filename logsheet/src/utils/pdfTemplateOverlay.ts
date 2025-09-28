import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import type { LogDaySheetFields } from '../types/logsheet';

// Coordinate mapping for the log sheet PDF template
// These coordinates are in PDF points (72 points = 1 inch)
export const PDF_COORDINATES = {
  // Page dimensions (8.5" x 11" = 612 x 792 points)
  pageWidth: 612,
  pageHeight: 792,
  
  // Header section coordinates
  header: {
    title: { x: 306, y: 750 }, // Center of page, top
    date: {
      month: { x: 100, y: 720 },
      day: { x: 150, y: 720 },
      year: { x: 200, y: 720 }
    },
    fromLocation: { x: 100, y: 690 },
    toLocation: { x: 300, y: 690 },
    carrierName: { x: 100, y: 660 },
    mainOfficeAddress: { x: 100, y: 630 },
    homeTerminalAddress: { x: 100, y: 600 },
    vehicleInfo: { x: 100, y: 570 },
    mileageDriving: { x: 400, y: 690 },
    mileageTotal: { x: 400, y: 660 }
  },
  
  // Log grid coordinates (main 24-hour grid)
  grid: {
    // Grid boundaries
    x: 100,
    y: 450,
    width: 500,
    height: 120,
    
    // Row centers (4 rows: Off Duty, Sleeper Berth, Driving, On Duty)
    rowCenters: [510, 480, 450, 420], // Y coordinates for each row center
    
    // Hour positions (24 hours across the grid)
    hourPositions: [
      100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, // Midnight to 11 AM
      340, 360, 380, 400, 420, 440, 460, 480, 500, 520, 540, 560  // Noon to 11 PM
    ],
    
    // Total hours column
    totalHours: { x: 620, y: 450 }
  },
  
  // Remarks section
  remarks: {
    x: 100,
    y: 300,
    width: 500,
    height: 80
  },
  
  // Shipping documents section
  shipping: {
    documents: { x: 100, y: 250 },
    shipperCommodity: { x: 100, y: 220 },
    instructions: { x: 100, y: 190 }
  },
  
  // Recap section (bottom)
  recap: {
    title: { x: 100, y: 150 },
    dailyTotals: { x: 100, y: 130 },
    recap70: { x: 100, y: 110 },
    recap60: { x: 100, y: 90 },
    restartNote: { x: 400, y: 70 }
  }
} as const;

/**
 * Load the PDF template and overlay content
 */
export async function createFilledLogSheet(
  templatePdfBytes: ArrayBuffer,
  fields: LogDaySheetFields,
  logEntries: Array<{ status: string; startTime: string; endTime: string }>
): Promise<Uint8Array> {
  try {
    // Load the PDF template
    const pdfDoc = await PDFDocument.load(templatePdfBytes);
    const page = pdfDoc.getPage(0);
    
    // Overlay all content
    await overlayHeader(page, fields);
    await overlayLogEntries(page, logEntries);
    await overlayRemarks(page, fields);
    await overlayShipping(page, fields);
    await overlayRecap(page, fields);
    
    // Save the filled PDF
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
    
  } catch (error) {
    console.error('Error creating filled log sheet:', error);
    throw new Error('Failed to create filled log sheet');
  }
}

/**
 * Overlay header information
 */
async function overlayHeader(page: PDFPage, fields: LogDaySheetFields) {
  const coords = PDF_COORDINATES.header;
  
  // Date
  const date = new Date(fields.dateLocalISO);
  page.drawText((date.getMonth() + 1).toString(), {
    x: coords.date.month.x,
    y: coords.date.month.y,
    size: 12,
    color: rgb(0, 0, 0)
  });
  
  page.drawText(date.getDate().toString(), {
    x: coords.date.day.x,
    y: coords.date.day.y,
    size: 12,
    color: rgb(0, 0, 0)
  });
  
  page.drawText(date.getFullYear().toString(), {
    x: coords.date.year.x,
    y: coords.date.year.y,
    size: 12,
    color: rgb(0, 0, 0)
  });
  
  // From/To locations
  if (fields.fromLocation) {
    page.drawText(fields.fromLocation, {
      x: coords.fromLocation.x,
      y: coords.fromLocation.y,
      size: 12,
      color: rgb(0, 0, 0)
    });
  }
  
  // Carrier information
  if (fields.carrierName) {
    page.drawText(fields.carrierName, {
      x: coords.carrierName.x,
      y: coords.carrierName.y,
      size: 12,
      color: rgb(0, 0, 0)
    });
  }
  
  if (fields.mainOfficeAddress) {
    page.drawText(fields.mainOfficeAddress, {
      x: coords.mainOfficeAddress.x,
      y: coords.mainOfficeAddress.y,
      size: 12,
      color: rgb(0, 0, 0)
    });
  }
  
  if (fields.homeTerminalAddress) {
    page.drawText(fields.homeTerminalAddress, {
      x: coords.homeTerminalAddress.x,
      y: coords.homeTerminalAddress.y,
      size: 12,
      color: rgb(0, 0, 0)
    });
  }
  
  // Vehicle information
  if (fields.truckTractorAndTrailer) {
    page.drawText(fields.truckTractorAndTrailer, {
      x: coords.vehicleInfo.x,
      y: coords.vehicleInfo.y,
      size: 12,
      color: rgb(0, 0, 0)
    });
  }
  
  // Mileage
  if (fields.totalMilesDrivingToday) {
    page.drawText(fields.totalMilesDrivingToday.toString(), {
      x: coords.mileageDriving.x,
      y: coords.mileageDriving.y,
      size: 12,
      color: rgb(0, 0, 0)
    });
  }
  
  if (fields.totalMileageToday) {
    page.drawText(fields.totalMileageToday.toString(), {
      x: coords.mileageTotal.x,
      y: coords.mileageTotal.y,
      size: 12,
      color: rgb(0, 0, 0)
    });
  }
}

/**
 * Overlay log entries on the grid
 */
async function overlayLogEntries(
  page: PDFPage, 
  logEntries: Array<{ status: string; startTime: string; endTime: string }>
) {
  const coords = PDF_COORDINATES.grid;
  
  // Status to row mapping
  const statusToRow: Record<string, number> = {
    'OFF': 0,
    'SB': 1,
    'D': 2,
    'ON': 3
  };
  
  // Draw log entries as horizontal lines
  for (const entry of logEntries) {
    const rowIndex = statusToRow[entry.status] || 0;
    const y = coords.rowCenters[rowIndex];
    
    // Convert time to grid position
    const startHour = parseInt(entry.startTime.split(':')[0]);
    const endHour = parseInt(entry.endTime.split(':')[0]);
    
    const startX = coords.hourPositions[startHour] || coords.x;
    const endX = coords.hourPositions[endHour] || coords.x + coords.width;
    
    // Draw horizontal line for the log entry
    page.drawLine({
      start: { x: startX, y },
      end: { x: endX, y },
      thickness: 2,
      color: rgb(0, 0, 0)
    });
  }
}

/**
 * Overlay remarks
 */
async function overlayRemarks(page: PDFPage, fields: LogDaySheetFields) {
  const coords = PDF_COORDINATES.remarks;
  
  if (fields.remarks) {
    // Simple text wrapping
    const words = fields.remarks.split(' ');
    let line = '';
    let y = coords.y;
    
    for (const word of words) {
      const testLine = line + word + ' ';
      
      if (testLine.length > 50 && line !== '') {
        page.drawText(line, {
          x: coords.x,
          y,
          size: 10,
          color: rgb(0, 0, 0)
        });
        line = word + ' ';
        y -= 15;
      } else {
        line = testLine;
      }
    }
    
    if (line) {
      page.drawText(line, {
        x: coords.x,
        y,
        size: 10,
        color: rgb(0, 0, 0)
      });
    }
  }
}

/**
 * Overlay shipping information
 */
async function overlayShipping(page: PDFPage, fields: LogDaySheetFields) {
  const coords = PDF_COORDINATES.shipping;
  
  if (fields.shippingDocuments) {
    page.drawText(fields.shippingDocuments.join(', '), {
      x: coords.documents.x,
      y: coords.documents.y,
      size: 10,
      color: rgb(0, 0, 0)
    });
  }
  
  if (fields.shipperCommodity) {
    page.drawText(fields.shipperCommodity, {
      x: coords.shipperCommodity.x,
      y: coords.shipperCommodity.y,
      size: 10,
      color: rgb(0, 0, 0)
    });
  }
}

/**
 * Overlay recap information
 */
async function overlayRecap(page: PDFPage, fields: LogDaySheetFields) {
  const coords = PDF_COORDINATES.recap;
  
  // Calculate totals (simplified)
  const onDutyTotal = 8; // This would be calculated from log entries
  
  page.drawText(`Total lines 3 & 4: ${onDutyTotal}`, {
    x: coords.dailyTotals.x,
    y: coords.dailyTotals.y,
    size: 10,
    color: rgb(0, 0, 0)
  });
}

/**
 * Convert canvas log entries to PDF overlay format
 */
export function convertLogEntriesToPDFFormat(logEntriesUtc: Array<{ status: string; startUtc: string; endUtc: string }>): Array<{ status: string; startTime: string; endTime: string }> {
  return logEntriesUtc.map(entry => {
    const startDate = new Date(entry.startUtc);
    const endDate = new Date(entry.endUtc);
    
    return {
      status: entry.status,
      startTime: `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`,
      endTime: `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`
    };
  });
}

// Define the missing types
interface DailyLogSheetData {
  date: string;
  // Add other required fields
}

interface FieldCoordinates {
  // Add required coordinate fields
  [key: string]: any;
}

// Helper function for drawing date fields
function drawDateFields(ctx: CanvasRenderingContext2D, date: string, coordinates: FieldCoordinates) {
  // Implementation
}

export function drawDailyLogSheet(ctx: CanvasRenderingContext2D, data: DailyLogSheetData, coordinates: FieldCoordinates) {
  // Draw the date
  drawDateFields(ctx, data.date, coordinates);
}
