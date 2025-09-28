// Lightweight Google Maps JS API loader using Vite env var
// Ensures a single load and resolves when window.google.maps is available

// Add Google Maps types
declare global {
  interface Window {
    google: {
      maps: any;
    };
  }
}

let mapsLoadingPromise: Promise<any> | null = null;

export function loadGoogleMaps(libraries: Array<'places'> = ['places']): Promise<any> {
	if (typeof window !== 'undefined' && (window as any).google?.maps) {
		return Promise.resolve((window as any).google.maps);
	}

	if (mapsLoadingPromise) return mapsLoadingPromise;

	const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
	if (!apiKey) {
		return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY is missing'));
	}

	mapsLoadingPromise = new Promise((resolve, reject) => {
		const existing = document.querySelector('script[data-gmaps-loader="true"]') as HTMLScriptElement | null;
		if (existing) {
			existing.addEventListener('load', () => resolve((window as any).google.maps));
			existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
			return;
		}

		const params = new URLSearchParams({
			key: apiKey,
			libraries: libraries.join(','),
			v: 'weekly'
		});
		const script = document.createElement('script');
		script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
		script.async = true;
		script.defer = true;
		script.dataset.gmapsLoader = 'true';
		script.onload = () => {
			if ((window as any).google?.maps) {
				resolve((window as any).google.maps);
			} else {
				reject(new Error('Google Maps loaded but google.maps is undefined'));
			}
		};
		script.onerror = () => reject(new Error('Failed to load Google Maps script'));
		document.head.appendChild(script);
	});

	return mapsLoadingPromise;
}


