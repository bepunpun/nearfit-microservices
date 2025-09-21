import { Gym } from '../models/gym.model';
import { directionsUrl, priceLabel, reviewCountLabel, safeWebsiteUrl, stars, statusLabel, telHref } from './gym-format';

function gym(overrides: Partial<Gym> = {}): Gym {
  return {
    id: 'g1',
    name: 'Test Gym',
    color: '#000',
    lat: 1,
    lng: 2,
    address: 'Somewhere',
    hours: { is24h: false, open: null, close: null, unknown: true },
    priceLevel: null,
    amenities: [],
    description: '',
    source: 'osm',
    distanceKm: 1,
    openNow: null,
    reviewCount: 0,
    averageRating: null,
    ...overrides,
  };
}

describe('statusLabel', () => {
  it('reports 24 hour gyms', () => {
    expect(statusLabel(gym({ hours: { is24h: true, open: null, close: null }, openNow: true }))).toBe('Open 24 hours');
  });

  it('shows the closing time while open', () => {
    expect(statusLabel(gym({ openNow: true, hours: { is24h: false, open: '06:00', close: '22:00' } }))).toBe('Open til 10pm');
    expect(statusLabel(gym({ openNow: true, hours: { is24h: false, open: '06:00', close: '21:30' } }))).toBe('Open til 9:30pm');
  });

  it('shows the next opening time while closed', () => {
    expect(statusLabel(gym({ openNow: false, hours: { is24h: false, open: '06:00', close: null } }))).toBe('Opens 6am');
    expect(statusLabel(gym({ openNow: false, hours: { is24h: false, open: '12:00', close: null } }))).toBe('Opens 12pm');
    expect(statusLabel(gym({ openNow: false, hours: { is24h: false, open: '00:30', close: null } }))).toBe('Opens 12:30am');
  });

  it('handles closed with no more openings today, and unknown hours', () => {
    expect(statusLabel(gym({ openNow: false }))).toBe('Closed now');
    expect(statusLabel(gym({ openNow: true }))).toBe('Open now');
    expect(statusLabel(gym())).toBe('Hours unknown');
  });

  it('renders a midnight close as am', () => {
    expect(statusLabel(gym({ openNow: true, hours: { is24h: false, open: '08:00', close: '00:00' } }))).toBe('Open til 12am');
  });
});

describe('small formatters', () => {
  it('labels review counts', () => {
    expect(reviewCountLabel(0)).toBe('No reviews yet');
    expect(reviewCountLabel(1)).toBe('1 review');
    expect(reviewCountLabel(7)).toBe('7 reviews');
  });

  it('renders stars, rounding and clamping', () => {
    expect(stars(null)).toBe('☆☆☆☆☆');
    expect(stars(4.4)).toBe('★★★★☆');
    expect(stars(4.5)).toBe('★★★★★');
    expect(stars(9)).toBe('★★★★★');
  });

  it('renders price levels', () => {
    expect(priceLabel(null)).toBe('');
    expect(priceLabel(2)).toBe('$$');
    expect(priceLabel(9)).toBe('$$$');
  });

  it('builds a directions link', () => {
    expect(directionsUrl({ lat: 36.8, lng: 10.18 })).toContain('destination=36.8,10.18');
  });
});

describe('safeWebsiteUrl', () => {
  it('accepts http(s) and adds a scheme when missing', () => {
    expect(safeWebsiteUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeWebsiteUrl('example.com')).toBe('https://example.com/');
    expect(safeWebsiteUrl(' http://example.com ')).toBe('http://example.com/');
  });

  it('rejects other schemes and empty values', () => {
    expect(safeWebsiteUrl('javascript:alert(1)')).toBeNull();
    expect(safeWebsiteUrl('data:text/html,hi')).toBeNull();
    expect(safeWebsiteUrl('')).toBeNull();
    expect(safeWebsiteUrl(null)).toBeNull();
  });
});

describe('telHref', () => {
  it('keeps digits and a leading plus only', () => {
    expect(telHref('+216 71 123 456')).toBe('tel:+216 71 123 456'.replace(/ /g, ''));
    expect(telHref('(415) 555-0100')).toBe('tel:4155550100');
  });

  it('returns null for junk', () => {
    expect(telHref('n/a')).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});
