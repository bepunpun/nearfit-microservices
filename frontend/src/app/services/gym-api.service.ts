import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { NearbyGymsResponse, NewReview, Review, ReviewSummary } from '../models/gym.model';

export interface NearbySearchParams {
  lat: number;
  lng: number;
  radiusKm?: number;
  openNow?: boolean;
}

@Injectable({ providedIn: 'root' })
export class GymApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  getNearbyGyms(params: NearbySearchParams): Observable<NearbyGymsResponse> {
    let httpParams = new HttpParams()
      .set('lat', params.lat)
      .set('lng', params.lng)
      .set('radius', params.radiusKm ?? 5);

    if (params.openNow) {
      httpParams = httpParams.set('openNow', 'true');
    }

    return this.http.get<NearbyGymsResponse>(`${this.baseUrl}/gyms/nearby`, { params: httpParams });
  }

  getReviews(gymId: string): Observable<ReviewSummary> {
    return this.http.get<ReviewSummary>(`${this.baseUrl}/reviews/gym/${encodeURIComponent(gymId)}`);
  }

  addReview(review: NewReview): Observable<Review> {
    return this.http.post<Review>(`${this.baseUrl}/reviews`, review);
  }
}
