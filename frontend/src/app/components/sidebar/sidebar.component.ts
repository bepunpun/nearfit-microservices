import { Component, computed, input, output, signal } from '@angular/core';
import { Gym } from '../../models/gym.model';
import { reviewCountLabel, statusLabel } from '../../utils/gym-format';

export type SortMode = 'nearest' | 'rating';

export const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 25];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  gyms = input<Gym[]>([]);
  selectedGymId = input<string | null>(null);
  loading = input(false);
  error = input(false);
  openNowOnly = input(false);
  radiusKm = input(5);
  notices = input<string[]>([]);

  gymSelected = output<Gym>();
  openNowOnlyChange = output<boolean>();
  radiusKmChange = output<number>();
  retry = output<void>();

  readonly radiusOptions = RADIUS_OPTIONS_KM;
  readonly statusLabel = statusLabel;
  readonly reviewCountLabel = reviewCountLabel;

  searchTerm = signal('');
  sortMode = signal<SortMode>('nearest');

  filteredGyms = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const matching = term
      ? this.gyms().filter((g) => `${g.name} ${g.address}`.toLowerCase().includes(term))
      : this.gyms();

    // the API already returns nearest-first; "top rated" re-sorts, unrated gyms last
    if (this.sortMode() === 'rating') {
      return [...matching].sort(
        (a, b) =>
          (b.averageRating ?? -1) - (a.averageRating ?? -1) ||
          b.reviewCount - a.reviewCount ||
          a.distanceKm - b.distanceKm
      );
    }
    return matching;
  });

  emptyMessage = computed(() => {
    const term = this.searchTerm().trim();
    if (term) return `No gyms match "${term}".`;
    if (this.openNowOnly()) {
      return "No gyms are known to be open right now. Many gyms don't list their hours, so try \"All gyms\".";
    }
    return `No gyms found within ${this.radiusKm()} km. Try a bigger radius.`;
  });

  onSearchInput(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  onToggleOpenNow() {
    this.openNowOnlyChange.emit(!this.openNowOnly());
  }

  onToggleSort() {
    this.sortMode.update((mode) => (mode === 'nearest' ? 'rating' : 'nearest'));
  }

  onRadiusChange(event: Event) {
    this.radiusKmChange.emit(Number((event.target as HTMLSelectElement).value));
  }

  initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }
}
