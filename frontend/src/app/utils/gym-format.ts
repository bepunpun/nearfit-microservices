import { Gym } from '../models/gym.model';

function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 && h < 24 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, '0')}${period}`;
}

/** "Open til 10pm", "Opens 6am", "Open 24 hours", "Hours unknown", ... */
export function statusLabel(gym: Gym): string {
  if (gym.hours.is24h) return 'Open 24 hours';
  if (gym.openNow === true) {
    return gym.hours.close ? `Open til ${formatClock(gym.hours.close)}` : 'Open now';
  }
  if (gym.openNow === false) {
    return gym.hours.open ? `Opens ${formatClock(gym.hours.open)}` : 'Closed now';
  }
  return 'Hours unknown';
}

/** "1 review" / "3 reviews" / "No reviews yet" */
export function reviewCountLabel(count: number): string {
  if (count === 0) return 'No reviews yet';
  return count === 1 ? '1 review' : `${count} reviews`;
}

/** Rating as a five-character star string, e.g. 4.4 -> "★★★★☆". */
export function stars(rating: number | null): string {
  const filled = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

/** "$" .. "$$$" for a 1-3 price level; empty when unknown. */
export function priceLabel(level: number | null): string {
  return level && level >= 1 ? '$'.repeat(Math.min(level, 3)) : '';
}

/**
 * Turn an OpenStreetMap website tag into a safe link, or null. Only http(s)
 * is allowed, so a hostile tag can't smuggle in a javascript: URL.
 */
export function safeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Digits and a leading + only, for a tel: link. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return digits.length >= 5 ? `tel:${digits}` : null;
}

export function directionsUrl(gym: Pick<Gym, 'lat' | 'lng'>): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lng}`;
}
