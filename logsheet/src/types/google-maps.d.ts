declare namespace google {
  namespace maps {
    // Add minimal type definitions needed for your project
    class Map {
      constructor(mapDiv: Element, opts?: MapOptions);
    }
    
    interface MapOptions {
      center?: LatLng;
      zoom?: number;
      [key: string]: any;
    }
    
    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }
  }
}