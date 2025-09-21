import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { Gym, Review, ReviewSummary } from '../../models/gym.model';
import { GymApiService } from '../../services/gym-api.service';
import {
  directionsUrl,
  priceLabel,
  reviewCountLabel,
  safeWebsiteUrl,
  stars,
  statusLabel,
  telHref,
} from '../../utils/gym-format';

export const MAX_AUTHOR_LENGTH = 40;
export const MAX_COMMENT_LENGTH = 500;

@Component({
  selector: 'app-gym-detail',
  standalone: true,
  templateUrl: './gym-detail.component.html',
  styleUrl: './gym-detail.component.css',
})
export class GymDetailComponent implements OnDestroy {
  gym = input.required<Gym>();

  closed = output<void>();
  /** Emitted after a review is posted, with the gym's fresh count and average. */
  reviewAdded = output<ReviewSummary>();

  readonly maxAuthor = MAX_AUTHOR_LENGTH;
  readonly maxComment = MAX_COMMENT_LENGTH;
  readonly ratingOptions = [1, 2, 3, 4, 5];

  reviews = signal<Review[]>([]);
  loadingReviews = signal(true);
  reviewsError = signal(false);

  author = signal('');
  rating = signal(0);
  comment = signal('');
  submitting = signal(false);
  submitError = signal<string | null>(null);

  canSubmit = computed(
    () =>
      !this.submitting() &&
      this.author().trim().length > 0 &&
      this.comment().trim().length > 0 &&
      this.rating() >= 1
  );

  status = computed(() => statusLabel(this.gym()));
  price = computed(() => priceLabel(this.gym().priceLevel));
  website = computed(() => safeWebsiteUrl(this.gym().website));
  tel = computed(() => telHref(this.gym().phone));
  directions = computed(() => directionsUrl(this.gym()));
  ratingStars = computed(() => stars(this.gym().averageRating));
  reviewCountText = computed(() => reviewCountLabel(this.gym().reviewCount));

  readonly stars = stars;

  private readonly api = inject(GymApiService);
  private readonly gymId = computed(() => this.gym().id);
  private loadSub?: Subscription;
  private submitSub?: Subscription;

  constructor() {
    // (re)load reviews and reset the form whenever a different gym is opened
    effect(() => {
      const id = this.gymId();
      untracked(() => {
        this.resetForm();
        this.loadReviews(id);
      });
    });
  }

  ngOnDestroy() {
    this.loadSub?.unsubscribe();
    this.submitSub?.unsubscribe();
  }

  onAuthorInput(event: Event) {
    this.author.set((event.target as HTMLInputElement).value);
  }

  onCommentInput(event: Event) {
    this.comment.set((event.target as HTMLTextAreaElement).value);
  }

  submit() {
    if (!this.canSubmit()) return;

    const gymId = this.gymId();
    this.submitting.set(true);
    this.submitError.set(null);

    this.submitSub?.unsubscribe();
    this.submitSub = this.api
      .addReview({
        gymId,
        author: this.author().trim(),
        rating: this.rating(),
        comment: this.comment().trim(),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.comment.set('');
          this.rating.set(0);
          this.loadReviews(gymId, true);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.submitError.set(err.error?.error ?? "Couldn't post your review. Please try again.");
        },
      });
  }

  loadReviews(gymId: string, announce = false) {
    this.loadSub?.unsubscribe();
    this.loadingReviews.set(true);
    this.reviewsError.set(false);

    this.loadSub = this.api.getReviews(gymId).subscribe({
      next: (summary) => {
        this.reviews.set(summary.reviews);
        this.loadingReviews.set(false);
        if (announce) this.reviewAdded.emit(summary);
      },
      error: () => {
        this.reviewsError.set(true);
        this.loadingReviews.set(false);
      },
    });
  }

  private resetForm() {
    this.reviews.set([]);
    this.comment.set('');
    this.rating.set(0);
    this.submitError.set(null);
    this.submitting.set(false);
    // keep the author name: people reviewing several gyms shouldn't retype it
  }

  formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
