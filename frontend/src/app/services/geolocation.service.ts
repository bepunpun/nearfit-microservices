import { Injectable } from '@angular/core';

export interface Coords {
  lat: number;
  lng: number;
}

export interface LocationResult {
  coords: Coords;
  /** True when we couldn't get the user's real position and used the default. */
  isDefault: boolean;
}

// Downtown San Francisco. Used whenever the browser can't or won't give us a
// real position (denied permission, no geolocation support, non-HTTPS, etc).
export const DEFAULT_COORDS: Coords = { lat: 37.7749, lng: -122.4194 };

@Injectable({ providedIn: 'root' })
export class GeolocationService {
  getCurrentPosition(): Promise<LocationResult> {
    return new Promise((resolve) => {
      const fallback = () => resolve({ coords: DEFAULT_COORDS, isDefault: true });

      if (!('geolocation' in navigator)) {
        fallback();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, isDefault: false }),
        fallback,
        { timeout: 8000 }
      );
    });
  }
}
