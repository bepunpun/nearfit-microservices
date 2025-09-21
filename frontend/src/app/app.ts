import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { GymDetailComponent } from './components/gym-detail/gym-detail.component';
import { MapComponent } from './components/map/map.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { Gym, ReviewSummary } from './models/gym.model';
import { Coords, GeolocationService } from './services/geolocation.service';
import { GymApiService } from './services/gym-api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SidebarComponent, MapComponent, GymDetailComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private readonly gymApi = inject(GymApiService);
  private readonly geo = inject(GeolocationService);

  gyms = signal<Gym[]>([]);
  selectedGymId = signal<string | null>(null);
  loading = signal(true);
  error = signal(false);
  openNowOnly = signal(false);
  radiusKm = signal(5);
  userCoords = signal<Coords | null>(null);
  usingDefaultLocation = signal(false);
  dataSource = signal<'osm' | 'fallback'>('osm');

  // derived from the list, so it disappears if the selected gym drops out of the results
  selectedGym = computed(() => this.gyms().find((g) => g.id === this.selectedGymId()) ?? null);

  notices = computed(() => {
    const notices: string[] = [];
    if (this.usingDefaultLocation()) {
      notices.push("Couldn't get your location, so we're showing San Francisco. Allow location access to see gyms near you.");
    }
    if (this.dataSource() === 'fallback') {
      notices.push("Live gym data is unavailable right now, so you're seeing sample gyms.");
    }
    return notices;
  });

  private request?: Subscription;

  async ngOnInit() {
    const { coords, isDefault } = await this.geo.getCurrentPosition();
    this.userCoords.set(coords);
    this.usingDefaultLocation.set(isDefault);
    this.loadGyms();
  }

  ngOnDestroy() {
    this.request?.unsubscribe();
  }

  loadGyms() {
    const coords = this.userCoords();
    if (!coords) return;

    // a newer search supersedes any request still in flight
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set(false);

    this.request = this.gymApi
      .getNearbyGyms({
        lat: coords.lat,
        lng: coords.lng,
        radiusKm: this.radiusKm(),
        openNow: this.openNowOnly(),
      })
      .subscribe({
        next: (res) => {
          this.gyms.set(res.gyms);
          this.dataSource.set(res.dataSource);
          this.loading.set(false);
        },
        error: () => {
          this.gyms.set([]);
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  onOpenNowChange(value: boolean) {
    this.openNowOnly.set(value);
    this.loadGyms();
  }

  onRadiusChange(km: number) {
    this.radiusKm.set(km);
    this.loadGyms();
  }

  onGymSelected(gym: Gym) {
    this.selectedGymId.set(gym.id);
  }

  onDetailClosed() {
    this.selectedGymId.set(null);
  }

  /** Reflect a newly posted review in the list and on the map without refetching. */
  onReviewAdded(summary: ReviewSummary) {
    this.gyms.update((gyms) =>
      gyms.map((g) =>
        g.id === summary.gymId ? { ...g, reviewCount: summary.count, averageRating: summary.average } : g
      )
    );
  }
}
