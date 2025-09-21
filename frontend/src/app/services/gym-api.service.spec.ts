import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { GymApiService } from './gym-api.service';

describe('GymApiService', () => {
  let api: GymApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(GymApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('searches nearby gyms with location and radius', () => {
    api.getNearbyGyms({ lat: 1.5, lng: 2.5, radiusKm: 10 }).subscribe();
    const req = http.expectOne((r) => r.url === `${environment.apiUrl}/gyms/nearby`);
    expect(req.request.params.get('lat')).toBe('1.5');
    expect(req.request.params.get('lng')).toBe('2.5');
    expect(req.request.params.get('radius')).toBe('10');
    expect(req.request.params.has('openNow')).toBe(false);
    req.flush({ dataSource: 'osm', count: 0, gyms: [] });
  });

  it('defaults the radius to 5 km and passes the open-now filter', () => {
    api.getNearbyGyms({ lat: 1, lng: 2, openNow: true }).subscribe();
    const req = http.expectOne((r) => r.url === `${environment.apiUrl}/gyms/nearby`);
    expect(req.request.params.get('radius')).toBe('5');
    expect(req.request.params.get('openNow')).toBe('true');
    req.flush({ dataSource: 'osm', count: 0, gyms: [] });
  });

  it('loads reviews for a gym, encoding the id', () => {
    api.getReviews('osm-way/1').subscribe();
    http.expectOne(`${environment.apiUrl}/reviews/gym/osm-way%2F1`).flush({ gymId: 'osm-way/1', count: 0, average: null, reviews: [] });
  });

  it('posts a new review', () => {
    const review = { gymId: 'g', author: 'A', rating: 5, comment: 'c' };
    api.addReview(review).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/reviews`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(review);
    req.flush({ ...review, id: '1', createdAt: '2026-01-01T00:00:00.000Z' });
  });
});
