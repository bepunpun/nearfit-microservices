export interface GymHours {
  is24h: boolean;
  open: string | null;
  close: string | null;
  unknown?: boolean;
  /** The raw OpenStreetMap opening_hours tag, when there is one. */
  raw?: string | null;
}

export interface Gym {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  address: string;
  hours: GymHours;
  priceLevel: number | null;
  amenities: string[];
  description: string;
  source: 'osm' | 'fallback';
  phone?: string | null;
  website?: string | null;
  distanceKm: number;
  openNow: boolean | null;
  reviewCount: number;
  averageRating: number | null;
}

export interface NearbyGymsResponse {
  dataSource: 'osm' | 'fallback';
  count: number;
  gyms: Gym[];
}

export interface Review {
  id: string;
  gymId: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface ReviewSummary {
  gymId: string;
  count: number;
  average: number | null;
  reviews: Review[];
}

export interface NewReview {
  gymId: string;
  author: string;
  rating: number;
  comment: string;
}
