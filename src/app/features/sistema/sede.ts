import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader } from '../../shared/bloques';
import { Icon } from '../../shared/icon';
import { Mapa, Posicion, Punto } from '../../shared/mapa';

/* El administrador marca el punto de la empresa y el radio en que el personal puede marcar asistencia */
@Component({
  selector: 'app-sede',
  imports: [DecimalPipe, PageHeader, Icon, Mapa],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila">
      <app-page-header seccion="Sistema" titulo="Sede y ubicación"
        descripcion="Punto de la empresa desde el que se mide la distancia cuando el personal marca asistencia con su celular." />

      <div class="distribucion">
        <article class="card entrada">
          <header class="card-cabecera">
            <div>
              <h3>Punto de la empresa</h3>
              <p>{{ puedeEditar ? 'Haz clic en el mapa sobre la entrada de la empresa.' : 'Solo el administrador puede cambiarlo.' }}</p>
            </div>
            @if (puedeEditar) {
              <button type="button" class="btn btn-sm" [disabled]="ubicando()" (click)="usarMiUbicacion()">
                @if (ubicando()) { <span class="spinner"></span> } @else { <app-icon name="ubicacion" [size]="15" /> }
                Usar mi ubicación
              </button>
            }
          </header>
          <div class="card-cuerpo">
            <app-mapa [centro]="punto()" [radio]="radio()" [posicion]="miPosicion()" [editable]="puedeEditar" (elegir)="punto.set($event)" />
            @if (punto(); as p) {
              <p class="coordenadas num">{{ p.lat | number: '1.6-6' }}, {{ p.lng | number: '1.6-6' }}</p>
            } @else {
              <p class="ayuda" style="margin-top: 10px">Aún no hay un punto marcado.</p>
            }
          </div>
        </article>

        <article class="card entrada">
          <div class="card-cuerpo pila">
            <div class="campo">
              <label for="s-nombre">Nombre de la sede</label>
              <input id="s-nombre" #n class="control" [value]="nombre()" (input)="nombre.set(n.value)" [disabled]="!puedeEditar" />
            </div>
            <div class="campo">
              <label for="s-dir">Dirección <span class="muted">(opcional)</span></label>
              <input id="s-dir" #d class="control" [value]="direccion()" (input)="direccion.set(d.value)" [disabled]="!puedeEditar" />
            </div>
            <div class="campo">
              <label for="s-radio">Radio permitido: <b class="num">{{ radio() }} m</b></label>
              <input id="s-radio" #r type="range" min="5" max="100" step="1" [value]="radio()" (input)="radio.set(+r.value)" [disabled]="!puedeEditar" />
              <span class="ayuda">El personal solo puede marcar a esta distancia o menos del punto.
                @if (radio() < 20) { El GPS de un celular suele variar entre 5 y 20 m: si hay rechazos frecuentes, súbelo un poco. }</span>
            </div>
            <div class="campo">
              <label for="s-prec">Margen de error máximo del GPS: <b class="num">±{{ precision() }} m</b></label>
              <input id="s-prec" #pr type="range" min="5" max="100" step="1" [value]="precision()" (input)="precision.set(+pr.value)" [disabled]="!puedeEditar" />
              <span class="ayuda">Si el celular reporta un error mayor (por ejemplo, ubicación aproximada), la marcación se rechaza.</span>
            </div>
            <div class="horario">
              <div class="campo">
                <label for="s-entrada">Hora de entrada</label>
                <input id="s-entrada" #he type="time" class="control" [value]="horaEntrada()" (change)="horaEntrada.set(he.value)" [disabled]="!puedeEditar" />
              </div>
              <div class="campo">
                <label for="s-salida">Hora de salida</label>
                <input id="s-salida" #hs type="time" class="control" [value]="horaSalida()" (change)="horaSalida.set(hs.value)" [disabled]="!puedeEditar" />
              </div>
              <div class="campo">
                <label for="s-tol">Tolerancia</label>
                <select id="s-tol" #tl class="control" [value]="tolerancia()" (change)="tolerancia.set(+tl.value)" [disabled]="!puedeEditar">
                  @for (t of tolerancias; track t) { <option [value]="t">{{ t }} min</option> }
                </select>
              </div>
            </div>
            <span class="ayuda">Una entrada después de las {{ limiteTardanza() }} cuenta como tardanza en el resumen mensual de asistencia.</span>
            @if (puedeEditar) {
              <button type="button" class="btn btn-primario" [disabled]="guardando() || !punto() || !nombre().trim()" (click)="guardar()">
                @if (guardando()) { <span class="spinner"></span> Guardando… } @else { <app-icon name="check" [size]="17" /> Guardar ubicación }
              </button>
            }
          </div>
        </article>
      </div>
    </div>
  `,
  styles: `
    .distribucion { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 1000px) { .distribucion { grid-template-columns: 1fr; } }
    app-mapa { --alto-mapa: 440px; }
    .coordenadas { margin-top: 10px; font-size: 12.5px; color: var(--ink-3); }
    input[type=range] { width: 100%; accent-color: var(--brand); }
    .horario { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    @media (max-width: 480px) { .horario { grid-template-columns: 1fr 1fr; } }
  `
})
export class SedeUbicacion {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly puedeEditar = inject(AuthService).puede('sede.configurar');

  protected readonly punto = signal<Punto | null>(null);
  protected readonly nombre = signal('Sede principal');
  protected readonly direccion = signal('');
  protected readonly radio = signal(12);
  protected readonly precision = signal(25);
  protected readonly horaEntrada = signal('08:00');
  protected readonly horaSalida = signal('17:00');
  protected readonly tolerancia = signal(10);
  protected readonly tolerancias = [0, 5, 10, 15, 20, 30];
  protected readonly limiteTardanza = computed(() => {
    const [h, m] = this.horaEntrada().split(':').map(Number);
    const total = h * 60 + m + this.tolerancia();
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  });
  protected readonly guardando = signal(false);
  protected readonly ubicando = signal(false);
  protected readonly miPosicion = signal<Posicion | null>(null);

  protected readonly listo = computed(() => !!this.punto());

  constructor() {
    this.api.sede.obtener().subscribe({
      next: (s) => {
        if (!s) return;
        this.punto.set({ lat: s.latitud, lng: s.longitud });
        this.nombre.set(s.nombre);
        this.direccion.set(s.direccion ?? '');
        this.radio.set(s.radioMetros);
        this.precision.set(s.precisionMaxima);
        if (s.horaEntrada) this.horaEntrada.set(s.horaEntrada.slice(0, 5));
        if (s.horaSalida) this.horaSalida.set(s.horaSalida.slice(0, 5));
        if (s.toleranciaMinutos !== undefined && s.toleranciaMinutos !== null) this.tolerancia.set(s.toleranciaMinutos);
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected usarMiUbicacion(): void {
    if (!('geolocation' in navigator)) {
      this.toast.error('Este navegador no permite leer la ubicación.');
      return;
    }
    this.ubicando.set(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy };
        this.miPosicion.set(pos);
        this.punto.set({ lat: pos.lat, lng: pos.lng });
        this.ubicando.set(false);
        this.toast.info(`Ubicación tomada (±${Math.round(pos.precision)} m). Ajusta el punto con un clic si hace falta.`);
      },
      () => {
        this.ubicando.set(false);
        this.toast.error('No se pudo obtener tu ubicación. Revisa el permiso del navegador.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  protected guardar(): void {
    const p = this.punto();
    if (!p) return;
    this.guardando.set(true);
    this.api.sede.guardar({
      nombre: this.nombre().trim(),
      direccion: this.direccion().trim() || null,
      latitud: Number(p.lat.toFixed(7)),
      longitud: Number(p.lng.toFixed(7)),
      radioMetros: this.radio(),
      precisionMaxima: this.precision(),
      horaEntrada: `${this.horaEntrada()}:00`,
      horaSalida: `${this.horaSalida()}:00`,
      toleranciaMinutos: this.tolerancia()
    }).subscribe({
      next: () => {
        this.toast.exito(`Ubicación guardada: el personal podrá marcar a máximo ${this.radio()} m.`);
        this.guardando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }
}
