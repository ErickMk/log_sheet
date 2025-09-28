declare namespace google {
  namespace maps {
    // Add minimal type definitions needed for your project
    class Map {
      constructor(mapDiv: Element, opts?: MapOptions);
    }
    
    interface MapOptions {
      center?: LatLng | {lat: number, lng: number};
      zoom?: (() => number) | number;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
      [key: string]: any;
    }
    
    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }

    class DirectionsService {
      constructor();
      route(request: any, callback: (result: any, status: any) => void): void;
    }

    class DirectionsRenderer {
      constructor(opts?: {map?: Map});
      setDirections(directions: any): void;
      setMap(map: Map | null): void;
    }

    class TrafficLayer {
      constructor();
      setMap(map: Map | null): void;
    }

    class TransitLayer {
      constructor();
      setMap(map: Map | null): void;
    }

    class Geocoder {
      constructor();
      geocode(request: any, callback: (results: any, status: any) => void): void;
    }

    class Marker {
      constructor(opts?: {position?: LatLng | {lat: number, lng: number}, map?: Map, title?: string});
      setMap(map: Map | null): void;
    }

    namespace places {
      class AutocompleteService {
        constructor();
        getPlacePredictions(request: any, callback: (predictions: any, status: any) => void): void;
      }
      
      class PlacesService {
        constructor(attrContainer: Map | Element);
        getDetails(request: any, callback: (place: any, status: any) => void): void;
      }
    }
  }
}