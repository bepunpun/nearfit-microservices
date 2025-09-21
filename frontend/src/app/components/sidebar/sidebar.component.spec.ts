import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Gym } from '../../models/gym.model';
import { SidebarComponent } from './sidebar.component';

function gym(id: string, name: string, distanceKm: number, averageRating: number | null, reviewCount: number): Gym {
  return {
    id,
    name,
    color: '#123456',
    lat: 0,
    lng: 0,
    address: `${name} Street`,
    hours: { is24h: false, open: null, close: null, unknown: true },
    priceLevel: null,
    amenities: [],
    description: '',
    source: 'osm',
    distanceKm,
    openNow: null,
    reviewCount,
    averageRating,
  };
}

const GYMS = [
  gym('a', 'Alpha Gym', 0.5, null, 0),
  gym('b', 'Beta Fitness', 1.2, 4.5, 2),
  gym('c', 'Gamma Club', 2.0, 5, 1),
];

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;
  let el: HTMLElement;

  const names = () => [...el.querySelectorAll('.gym-name')].map((n) => n.textContent?.trim());
  const flush = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SidebarComponent] }).compileComponents();
    fixture = TestBed.createComponent(SidebarComponent);
    el = fixture.nativeElement;
    fixture.componentRef.setInput('gyms', GYMS);
    await flush();
  });

  it('lists gyms nearest-first with km distances and ratings', () => {
    expect(names()).toEqual(['Alpha Gym', 'Beta Fitness', 'Gamma Club']);
    const rows = el.querySelectorAll('.gym-row');
    expect(rows[0].textContent).toContain('0.5 km');
    expect(rows[0].textContent).not.toContain(' mi');
    expect(rows[0].textContent).toContain('No reviews');
    expect(rows[1].textContent).toContain('4.5');
    expect(rows[1].textContent).toContain('(2)');
  });

  it('sorts by rating, unrated gyms last', async () => {
    (el.querySelectorAll('.filter-group .pill')[1] as HTMLButtonElement).click();
    await flush();
    expect(names()).toEqual(['Gamma Club', 'Beta Fitness', 'Alpha Gym']);
  });

  it('filters by name or address', async () => {
    const input = el.querySelector('input[type=search]') as HTMLInputElement;
    input.value = 'beta';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(names()).toEqual(['Beta Fitness']);

    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(names()).toEqual([]);
    expect(el.querySelector('.status-text')?.textContent).toContain('No gyms match "zzz"');
  });

  it('emits the selected gym', async () => {
    const selected: Gym[] = [];
    fixture.componentInstance.gymSelected.subscribe((g) => selected.push(g));
    (el.querySelectorAll('.gym-row')[1] as HTMLButtonElement).click();
    expect(selected.map((g) => g.id)).toEqual(['b']);
  });

  it('emits filter and radius changes', async () => {
    const openNow: boolean[] = [];
    const radius: number[] = [];
    fixture.componentInstance.openNowOnlyChange.subscribe((v) => openNow.push(v));
    fixture.componentInstance.radiusKmChange.subscribe((v) => radius.push(v));

    (el.querySelectorAll('.filter-group .pill')[0] as HTMLButtonElement).click();
    const select = el.querySelector('#radius') as HTMLSelectElement;
    select.value = '10';
    select.dispatchEvent(new Event('change'));

    expect(openNow).toEqual([true]);
    expect(radius).toEqual([10]);
  });

  it('shows loading, error and empty states', async () => {
    fixture.componentRef.setInput('gyms', []);
    fixture.componentRef.setInput('loading', true);
    await flush();
    expect(el.querySelector('.status-text')?.textContent).toContain('Finding gyms');

    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('error', true);
    await flush();
    expect(el.querySelector('.status-text')?.textContent).toContain("Couldn't load gyms");

    let retried = false;
    fixture.componentInstance.retry.subscribe(() => (retried = true));
    (el.querySelector('.retry') as HTMLButtonElement).click();
    expect(retried).toBe(true);

    fixture.componentRef.setInput('error', false);
    fixture.componentRef.setInput('radiusKm', 2);
    await flush();
    expect(el.querySelector('.status-text')?.textContent).toContain('within 2 km');

    fixture.componentRef.setInput('openNowOnly', true);
    await flush();
    expect(el.querySelector('.status-text')?.textContent).toContain('open right now');
  });

  it('renders notices', async () => {
    fixture.componentRef.setInput('notices', ['Using sample data']);
    await flush();
    expect(el.querySelector('.notice')?.textContent).toContain('Using sample data');
  });
});
