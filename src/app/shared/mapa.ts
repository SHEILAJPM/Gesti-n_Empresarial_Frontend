import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, effect, input, output, signal, viewChild
} from '@angular/core';
import * as L from 'leaflet';

export interface Punto {
  lat: number;
  lng: number;
}

export interface Posicion extends Punto {
  precision: number;
}

/* Centro de Lima: vista inicial cuando la empresa aún no tiene ubicación */
const LIMA: L.LatLngTuple = [-12.0464, -77.0428];

/* Mapa (OpenStreetMap + Leaflet) con el punto de la empresa, su radio y, opcionalmente, la posición del usuario.
   Con editable=true, un clic en el mapa emite el punto elegido. */
@Component({
  selector: 'app-mapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #lienzo class="lienzo" [class.editable]="editable()"></div>`,
  styles: `
    :host { display: block; position: relative; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--border); }
    .lienzo { width: 100%; height: var(--alto-mapa, 320px); background: var(--surface-3); }
    .lienzo.editable { cursor: crosshair; }
  `
})
export class Mapa implements OnDestroy {
  private readonly lienzo = viewChild.required<ElementRef<HTMLElement>>('lienzo');

  readonly centro = input<Punto | null>(null);
  readonly radio = input(12);
  readonly posicion = input<Posicion | null>(null);
  readonly editable = input(false);
  readonly elegir = output<Punto>();

  private mapa: L.Map | null = null;
  private readonly capas = L.layerGroup();
  private readonly listo = signal(false);

  constructor() {
    afterNextRender(() => {
      const mapa = L.map(this.lienzo().nativeElement, { zoomControl: true, attributionControl: true })
        .setView(LIMA, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        maxNativeZoom: 19,
        attribution: '&copy; colaboradores de OpenStreetMap'
      }).addTo(mapa);
      this.capas.addTo(mapa);
      mapa.on('click', (e: L.LeafletMouseEvent) => {
        if (this.editable()) {
          this.elegir.emit({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      });
      this.mapa = mapa;
      this.listo.set(true);
      // El contenedor puede animarse al aparecer: recalcula el tamaño cuando ya está en su lugar
      setTimeout(() => mapa.invalidateSize(), 250);
    });

    effect(() => {
      if (!this.listo() || !this.mapa) {
        return;
      }
      this.dibujar(this.mapa, this.centro(), this.radio(), this.posicion());
    });
  }

  ngOnDestroy(): void {
    this.mapa?.remove();
  }

  private dibujar(mapa: L.Map, centro: Punto | null, radio: number, posicion: Posicion | null): void {
    this.capas.clearLayers();
    const estilo = getComputedStyle(document.documentElement);
    const marca = estilo.getPropertyValue('--brand').trim() || '#0b6e69';
    const info = estilo.getPropertyValue('--info').trim() || '#2457c5';

    const limites: L.LatLngExpression[] = [];
    if (centro) {
      const punto: L.LatLngTuple = [centro.lat, centro.lng];
      L.circle(punto, { radius: radio, color: marca, weight: 2, fillColor: marca, fillOpacity: 0.15 })
        .bindTooltip(`Zona permitida: ${radio} m`).addTo(this.capas);
      L.circleMarker(punto, { radius: 7, color: '#fff', weight: 2, fillColor: marca, fillOpacity: 1 })
        .bindTooltip('Punto de la empresa').addTo(this.capas);
      limites.push(punto);
    }
    if (posicion) {
      const yo: L.LatLngTuple = [posicion.lat, posicion.lng];
      L.circle(yo, { radius: posicion.precision, color: info, weight: 1, dashArray: '4 4', fillColor: info, fillOpacity: 0.08 })
        .addTo(this.capas);
      L.circleMarker(yo, { radius: 7, color: '#fff', weight: 2, fillColor: info, fillOpacity: 1 })
        .bindTooltip(`Tú (±${Math.round(posicion.precision)} m)`).addTo(this.capas);
      limites.push(yo);
    }

    if (limites.length === 2) {
      mapa.fitBounds(L.latLngBounds(limites).pad(0.6), { maxZoom: 19 });
    } else if (limites.length === 1) {
      mapa.setView(limites[0], Math.max(mapa.getZoom(), 18));
    }
  }
}
