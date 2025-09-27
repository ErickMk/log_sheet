/**
 * Cache Manager for AutoLogExport and PdfOverlay pages
 * Handles session-based caching that persists during navigation but clears on page reload
 */

export interface AutoLogExportCache {
  form: {
    currentLocation: string;
    pickupLocation: string;
    destination: string;
    cycle: '60/7' | '70/8';
    cycleHours: number;
    startDateISO: string;
    startTimeLocal: string;
    isPropertyCarrying: boolean;
    adverseConditions: boolean;
    fuelIntervalMiles: number;
    serviceTimeMinutes: number;
  };
  routeData: {
    distance: number;
    duration: number;
    stops: number;
    arrival: string;
  } | null;
  mapRoute: {
    directions: any;
    rendered: boolean;
  } | null;
}

export interface PdfOverlayCache {
  tripData: {
    meta: any;
    days: any[];
    dailyProgress: any[];
  } | null;
}

class CacheManager {
  private static instance: CacheManager;
  private sessionId: string;
  private isPageReload: boolean = false;

  private constructor() {
    // Generate a unique session ID for this browser session
    this.sessionId = this.generateSessionId();
    
    // Simple page reload detection using performance API
    try {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation && navigation.type === 'reload') {
        this.isPageReload = true;
        this.clearAllCaches();
        console.log('Page reload detected - clearing all caches');
      } else {
        console.log('Page navigation detected - preserving caches');
      }
    } catch (error) {
      // Fallback for browsers that don't support Performance API
      console.log('Performance API not supported - assuming navigation (preserving caches)');
    }
  }

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCacheKey(page: 'autologexport' | 'pdfoverlay'): string {
    return `${this.sessionId}_${page}`;
  }

  // AutoLogExport Cache Methods
  public setAutoLogExportCache(data: Partial<AutoLogExportCache>): void {
    if (this.isPageReload) return;
    
    const currentCache = this.getAutoLogExportCache();
    const updatedCache = { ...currentCache, ...data };
    sessionStorage.setItem(this.getCacheKey('autologexport'), JSON.stringify(updatedCache));
  }

  public getAutoLogExportCache(): AutoLogExportCache {
    if (this.isPageReload) {
      return {
        form: {
          currentLocation: '',
          pickupLocation: '',
          destination: '',
          cycle: '70/8',
          cycleHours: 0,
          startDateISO: new Date().toISOString().slice(0, 10),
          startTimeLocal: '08:00',
          isPropertyCarrying: true,
          adverseConditions: false,
          fuelIntervalMiles: 1000,
          serviceTimeMinutes: 60,
        },
        routeData: null,
        mapRoute: null,
      };
    }

    const cached = sessionStorage.getItem(this.getCacheKey('autologexport'));
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (error) {
        console.warn('Failed to parse AutoLogExport cache:', error);
      }
    }

    return {
      form: {
        currentLocation: '',
        pickupLocation: '',
        destination: '',
        cycle: '70/8',
        cycleHours: 0,
        startDateISO: new Date().toISOString().slice(0, 10),
        startTimeLocal: '08:00',
        isPropertyCarrying: true,
        adverseConditions: false,
        fuelIntervalMiles: 1000,
        serviceTimeMinutes: 60,
      },
      routeData: null,
      mapRoute: null,
    };
  }

  // PdfOverlay Cache Methods
  public setPdfOverlayCache(data: Partial<PdfOverlayCache>): void {
    if (this.isPageReload) return;
    
    const currentCache = this.getPdfOverlayCache();
    const updatedCache = { ...currentCache, ...data };
    sessionStorage.setItem(this.getCacheKey('pdfoverlay'), JSON.stringify(updatedCache));
  }

  public getPdfOverlayCache(): PdfOverlayCache {
    if (this.isPageReload) {
      return {
        tripData: null,
      };
    }

    const cached = sessionStorage.getItem(this.getCacheKey('pdfoverlay'));
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (error) {
        console.warn('Failed to parse PdfOverlay cache:', error);
      }
    }

    return {
      tripData: null,
    };
  }

  // Clear specific cache
  public clearAutoLogExportCache(): void {
    sessionStorage.removeItem(this.getCacheKey('autologexport'));
  }

  public clearPdfOverlayCache(): void {
    sessionStorage.removeItem(this.getCacheKey('pdfoverlay'));
  }

  // Clear all caches
  public clearAllCaches(): void {
    this.clearAutoLogExportCache();
    this.clearPdfOverlayCache();
    // Also clear the old localStorage items for backward compatibility
    localStorage.removeItem('autoLogExport.form');
    localStorage.removeItem('autoLogExport.days');
    localStorage.removeItem('autoLogExport.meta');
    localStorage.removeItem('autoLogExport.dailyProgress');
    localStorage.removeItem('autoLogExport.ready');
    localStorage.removeItem('autoLogExport.notice');
  }

  // Check if cache exists
  public hasAutoLogExportCache(): boolean {
    return sessionStorage.getItem(this.getCacheKey('autologexport')) !== null;
  }

  public hasPdfOverlayCache(): boolean {
    return sessionStorage.getItem(this.getCacheKey('pdfoverlay')) !== null;
  }

  // Debug method to log cache status
  public logCacheStatus(): void {
    console.log('Cache Manager Status:', {
      sessionId: this.sessionId,
      isPageReload: this.isPageReload,
      hasAutoLogExportCache: this.hasAutoLogExportCache(),
      hasPdfOverlayCache: this.hasPdfOverlayCache(),
      autoLogExportCache: this.getAutoLogExportCache(),
      pdfOverlayCache: this.getPdfOverlayCache()
    });
  }

  // Manual cache clear for testing
  public clearCacheForTesting(): void {
    console.log('Manually clearing all caches for testing');
    this.clearAllCaches();
  }
}

export default CacheManager;
