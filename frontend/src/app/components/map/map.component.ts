import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { Gym } from '../../models/gym.model';
import { Coords } from '../../services/geolocation.service';

// Standard OpenStreetMap tiles: free and keyless for light use, with attribution.
// They are darkened with a CSS filter (see styles.css) to match the app's theme.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

@Component({
  selector: 'app-map',
  standalone: true,
  template: `<div #mapEl class="map" role="application" aria-label="Map of nearby gyms"></div>`,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .map {
      width: 100%;
      height: 100%;
    }
  `,
})
export class MapComponent implements AfterViewInit, OnDestroy {
  gyms = input<Gym[]>([]);
  selectedGymId = input<string | null>(null);
  userCoords = input<Coords | null>(null);

  gymSelected = output<Gym>();

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private readonly ready = signal(false);

  private map?: L.Map;
  private resizeObserver?: ResizeObserver;
  private userMarker?: L.Marker;
  private readonly markers = new Map<string, L.Marker>();
  private readonly gymsById = new Map<string, Gym>();
  private lastFitKey: string | null = null;

  constructor() {
    // keep the gym markers in sync with the list, and re-frame the map when it changes
    effect(() => {
      if (!this.ready()) return;
      const gyms = this.gyms();
      const selectedId = untracked(() => this.selectedGymId());
      this.renderGymMarkers(gyms, selectedId);
      untracked(() => this.fitToResults(gyms));
    });

    effect(() => {
      if (!this.ready()) return;
      const coords = this.userCoords();
      untracked(() => this.renderUserMarker(coords));
    });

    // highlight the selected pin and bring it into view
    effect(() => {
      if (!this.ready()) return;
      const selectedId = this.selectedGymId();
      untracked(() => this.highlight(selectedId));
    });
  }

  ngAfterViewInit() {
    const el = this.mapEl().nativeElement;
    this.map = L.map(el, { zoomControl: false, attributionControl: true }).setView([37.7749, -122.4194], 13);
    L.control.zoom({ position: 'bottomleft' }).addTo(this.map);
    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(this.map);

    // the map area resizes with the window and when the layout stacks on small screens
    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
    this.resizeObserver.observe(el);

    this.ready.set(true);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private renderGymMarkers(gyms: Gym[], selectedId: string | null) {
    const map = this.map;
    if (!map) return;

    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    this.gymsById.clear();

    for (const gym of gyms) {
      const marker = L.marker([gym.lat, gym.lng], {
        icon: this.pinIcon(gym, gym.id === selectedId),
        title: gym.name,
        keyboard: true,
      });
      // build the tooltip from a text node: gym names come from OpenStreetMap
      // and must never be interpreted as HTML
      const label = document.createElement('span');
      label.textContent = gym.name;
      marker.bindTooltip(label, { direction: 'top', offset: [0, -14] });
      marker.on('click', () => {
        const current = this.gymsById.get(gym.id);
        if (current) this.gymSelected.emit(current);
      });
      marker.addTo(map);

      this.markers.set(gym.id, marker);
      this.gymsById.set(gym.id, gym);
    }
  }

  private renderUserMarker(coords: Coords | null) {
    const map = this.map;
    if (!map) return;

    this.userMarker?.remove();
    this.userMarker = undefined;
    if (!coords) return;

    const dot = document.createElement('span');
    dot.className = 'nf-user-dot';
    this.userMarker = L.marker([coords.lat, coords.lng], {
      icon: L.divIcon({ className: 'nf-user-wrap', html: dot, iconSize: [18, 18], iconAnchor: [9, 9] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: -1000,
    }).addTo(map);
  }

  private fitToResults(gyms: Gym[]) {
    const map = this.map;
    if (!map) return;

    // only re-frame when the set of gyms changes, not when one is merely updated
    // (e.g. its review count after someone posts a review)
    const key = gyms.map((g) => g.id).join(',');
    if (key === this.lastFitKey) return;
    this.lastFitKey = key;

    const points: L.LatLngExpression[] = gyms.map((g) => [g.lat, g.lng]);
    const user = this.userCoords();
    if (user) points.push([user.lat, user.lng]);

    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], gyms.length === 0 ? 13 : 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
  }

  private highlight(selectedId: string | null) {
    for (const [id, marker] of this.markers) {
      const gym = this.gymsById.get(id);
      if (gym) marker.setIcon(this.pinIcon(gym, id === selectedId));
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
    }

    const selected = selectedId ? this.gymsById.get(selectedId) : undefined;
    if (selected && this.map) {
      this.map.flyTo([selected.lat, selected.lng], Math.max(this.map.getZoom(), 15), { duration: 0.6 });
    }
  }

  private pinIcon(gym: Gym, selected: boolean): L.DivIcon {
    const pin = document.createElement('span');
    pin.className = selected ? 'nf-pin selected' : 'nf-pin';
    pin.style.setProperty('--pin', gym.color);
    pin.textContent = gym.name.trim().charAt(0).toUpperCase() || '?';
    const size = selected ? 42 : 34;
    return L.divIcon({
      className: 'nf-pin-wrap',
      html: pin,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }
}
