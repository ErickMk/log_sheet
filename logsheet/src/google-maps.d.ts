declare namespace google {
  namespace maps {
    class Map {
      constructor(element: HTMLElement, options?: MapOptions);
    }

    interface MapOptions {
      center?: LatLng;
      zoom?: number;
      mapTypeId?: string;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
    }

    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }

    namespace places {
      class Autocomplete {
        constructor(inputElement: HTMLInputElement | null, options?: AutocompleteOptions);
        addListener(eventName: string, handler: Function): void;
        getPlace(): any;
      }

      interface AutocompleteOptions {
        fields?: string[];
      }

      class AutocompleteService {
        getPlacePredictions(request: any, callback: (predictions: any, status: any) => void): void;
      }

      class PlacesService {
        constructor(attrContainer: Map | HTMLElement);
        getDetails(request: any, callback: (result: any, status: any) => void): void;
      }
    }

    class DirectionsService {
      route(request: any, callback: (result: any, status: any) => void): void;
    }

    class DirectionsRenderer {
      constructor(options?: any);
      setMap(map: Map | null): void;
      setDirections(directions: any): void;
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
      geocode(request: any, callback: (results: any, status: any) => void): void;
    }

    class Marker {
      constructor(options?: any);
      setMap(map: Map | null): void;
      setPosition(latLng: LatLng): void;
    }
  }
}