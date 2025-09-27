import { createFilledLogSheet, convertLogEntriesToPDFFormat } from './pdfTemplateOverlay';
import type { LogDaySheetFields } from '../types/logsheet';

/**
 * Export log sheet using PDF template overlay
 */
export async function exportTemplateBasedPDF(
  fields: LogDaySheetFields,
  filename?: string
): Promise<void> {
  try {
    // Load the PDF template from public folder
    const templateResponse = await fetch('/log_sheet.pdf');
    if (!templateResponse.ok) {
      throw new Error('Failed to load PDF template');
    }
    
    const templateBytes = await templateResponse.arrayBuffer();
    
    // Convert log entries to PDF format
    const pdfLogEntries = convertLogEntriesToPDFFormat(fields.logEntriesUtc);
    
    // Create filled PDF
    const filledPdfBytes = await createFilledLogSheet(
      templateBytes,
      fields,
      pdfLogEntries
    );
    
    // Create blob and download
    const blob = new Blob([filledPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `Drivers_Daily_Log_${fields.dateLocalISO}.pdf`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error exporting template-based PDF:', error);
    throw new Error('Failed to export PDF. Please ensure the template file is available.');
  }
}

/**
 * Load PDF template and return as ArrayBuffer
 */
export async function loadPdfTemplate(): Promise<ArrayBuffer> {
  try {
    const response = await fetch('/log_sheet.pdf');
    if (!response.ok) {
      throw new Error('Failed to load PDF template');
    }
    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error loading PDF template:', error);
    throw new Error('PDF template not found. Please place log_sheet.pdf in the public folder.');
  }
}

/**
 * Preview PDF template (for debugging coordinates)
 */
export async function previewPdfTemplate(): Promise<void> {
  try {
    const templateBytes = await loadPdfTemplate();
    const blob = new Blob([templateBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    // Open in new tab for preview
    window.open(url, '_blank');
    
    // Clean up after a delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
  } catch (error) {
    console.error('Error previewing PDF template:', error);
    alert('Failed to preview PDF template. Please ensure log_sheet.pdf is in the public folder.');
  }
}
