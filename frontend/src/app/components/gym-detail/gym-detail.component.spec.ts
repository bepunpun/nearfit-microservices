import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { Gym, ReviewSummary } from '../../models/gym.model';
import { GymDetailComponent } from './gym-detail.component';

const GYM: Gym = {
  id: 'osm-way-1',
  name: 'Iron <b>House</b>',
  color: '#123456',
  lat: 36.8,
  lng: 10.18,
  address: '1 Main St',
  hours: { is24h: false, open: '06:00', close: '22:00', raw: 'Mo-Su 06:00-22:00' },
  priceLevel: 2,
  amenities: ['Fitness center', 'Showers'],
  description: '',
  source: 'osm',
  phone: '+216 71 123 456',
  website: 'javascript:alert(1)',
  distanceKm: 1.2,
  openNow: true,
  reviewCount: 1,
  averageRating: 4,
};

const url = (path: string) => `${environment.apiUrl}${path}`;
const summary = (reviews: ReviewSummary['reviews']): ReviewSummary => ({
  gymId: GYM.id,
  count: reviews.length,
  average: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null,
  reviews,
});
const review = (id: string, rating: number, comment: string) => ({
  id,
  gymId: GYM.id,
  author: 'Sam',
  rating,
  comment,
  createdAt: '2026-01-02T10:00:00.000Z',
});

describe('GymDetailComponent', () => {
  let fixture: ComponentFixture<GymDetailComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const flush = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const type = (selector: string, value: string) => {
    const field = el.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GymDetailComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GymDetailComponent);
    el = fixture.nativeElement;
    fixture.componentRef.setInput('gym', GYM);
    await flush();
    http.expectOne(url(`/reviews/gym/${GYM.id}`)).flush(summary([review('r1', 4, 'Solid gym.')]));
    await flush();
  });

  afterEach(() => http.verify());

  it('shows the gym facts and loaded reviews, escaping any markup in text', () => {
    expect(el.querySelector('h2')?.textContent).toBe('Iron <b>House</b>');
    expect(el.querySelector('h2 b')).toBeNull();
    expect(el.textContent).toContain('Open til 10pm');
    expect(el.textContent).toContain('1.2 km away');
    expect(el.textContent).toContain('Mo-Su 06:00-22:00');
    expect(el.textContent).toContain('Showers');
    expect(el.querySelectorAll('.review').length).toBe(1);
    expect(el.querySelector('.review')?.textContent).toContain('Solid gym.');
  });

  it('only links safe websites', () => {
    expect(el.querySelector('a[href^="javascript"]')).toBeNull();
    expect(el.textContent).not.toContain('Website');
    expect(el.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe('tel:+21671123456');
  });

  it('keeps the post button disabled until the form is complete', async () => {
    const submit = el.querySelector('.submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    type('input[type=text]', 'Alex');
    type('textarea', 'Great place');
    await flush();
    expect(submit.disabled).toBe(true); // no rating yet

    (el.querySelectorAll('.star-btn')[4] as HTMLButtonElement).click();
    await flush();
    expect(submit.disabled).toBe(false);

    type('textarea', '   ');
    await flush();
    expect(submit.disabled).toBe(true);
  });

  it('posts a review, reloads the list and announces the new summary', async () => {
    const announced: ReviewSummary[] = [];
    fixture.componentInstance.reviewAdded.subscribe((s) => announced.push(s));

    type('input[type=text]', '  Alex ');
    type('textarea', ' Great place ');
    (el.querySelectorAll('.star-btn')[4] as HTMLButtonElement).click();
    await flush();
    (el.querySelector('.submit') as HTMLButtonElement).click();

    const post = http.expectOne(url('/reviews'));
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ gymId: GYM.id, author: 'Alex', rating: 5, comment: 'Great place' });
    post.flush(review('r2', 5, 'Great place'));

    const updated = summary([review('r2', 5, 'Great place'), review('r1', 4, 'Solid gym.')]);
    http.expectOne(url(`/reviews/gym/${GYM.id}`)).flush(updated);
    await flush();

    expect(el.querySelectorAll('.review').length).toBe(2);
    expect(announced).toEqual([updated]);
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('shows the server error when a review is rejected', async () => {
    type('input[type=text]', 'Alex');
    type('textarea', 'x');
    (el.querySelectorAll('.star-btn')[0] as HTMLButtonElement).click();
    await flush();
    (el.querySelector('.submit') as HTMLButtonElement).click();

    http.expectOne(url('/reviews')).flush({ error: 'comment is too long' }, { status: 400, statusText: 'Bad Request' });
    await flush();

    expect(el.querySelector('.review-form .error')?.textContent).toContain('comment is too long');
    expect((el.querySelector('.submit') as HTMLButtonElement).disabled).toBe(false); // can retry
  });

  it('offers a retry when reviews fail to load', async () => {
    fixture.componentRef.setInput('gym', { ...GYM, id: 'other' });
    await flush();
    http.expectOne(url('/reviews/gym/other')).flush('nope', { status: 500, statusText: 'Server Error' });
    await flush();
    expect(el.querySelector('.reviews .error')?.textContent).toContain("Couldn't load reviews");

    (el.querySelector('.reviews .error .link') as HTMLButtonElement).click();
    http.expectOne(url('/reviews/gym/other')).flush(summary([]));
    await flush();
    expect(el.textContent).toContain('Be the first');
  });

  it('closes on request', () => {
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));
    (el.querySelector('.close') as HTMLButtonElement).click();
    expect(closed).toBe(true);
  });
});
