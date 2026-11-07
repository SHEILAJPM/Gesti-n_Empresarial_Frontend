import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { NOMBRES_ROL } from '../../core/auth/permisos';
import { Marcacion, MiPerfil } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { Paginador, Vacio } from '../../shared/bloques';
import { FotoAsistencia } from '../../shared/foto-asistencia';
import { colorAvatar, distanciaMetros, hoyIso, iniciales } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Mapa, Posicion } from '../../shared/mapa';
import { Panel } from '../../shared/panel';
import { TablaEstado } from '../../shared/tabla';
import { CamaraMarcacion, DatosSello, FotoCapturada } from './camara-marcacion';

type EstadoGps = 'buscando' | 'listo' | 'denegado' | 'no-disponible' | 'inseguro';

/* El trabajador marca su entrada/salida con la ubicación del celular y una foto tomada en ese momento.
   Aquí solo se muestra una vista previa de la distancia; el backend vuelve a calcularla y decide. */
@Component({
  selector: 'app-mi-asistencia',
  imports: [DatePipe, DecimalPipe, Icon, Mapa, Paginador, Vacio, CamaraMarcacion, Panel, FotoAsistencia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mi-asistencia.html',
  styleUrl: './mi-asistencia.scss'
})
export class MiAsistencia {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;
  protected readonly nombresRol = NOMBRES_ROL;

  protected readonly ahora = signal(new Date());
  protected readonly cargando = signal(true);
  protected readonly perfil = signal<MiPerfil | null>(null);
  protected readonly historial = signal<Marcacion[]>([]);
  protected readonly tabla = new TablaEstado(this.historial, (m) => m.fechaHora, 8);

  protected readonly estadoGps = signal<EstadoGps>('buscando');
  protected readonly posicion = signal<Posicion | null>(null);
  private ultimaLectura = 0;

  protected readonly marcando = signal(false);
  protected readonly camaraAbierta = signal(false);
  protected readonly fotoVista = signal<Marcacion | null>(null);
  protected readonly resultado = signal<{ ok: boolean; texto: string; hora?: string } | null>(null);

  protected readonly sede = computed(() => this.perfil()?.sede ?? null);
  protected readonly centro = computed(() => {
    const s = this.sede();
    return s ? { lat: s.latitud, lng: s.longitud } : null;
  });

  /* Vista previa: distancia actual al punto de la empresa */
  protected readonly distancia = computed(() => {
    const s = this.sede();
    const p = this.posicion();
    return s && p ? distanciaMetros(s.latitud, s.longitud, p.lat, p.lng) : null;
  });
  protected readonly dentro = computed(() => {
    const s = this.sede();
    const d = this.distancia();
    const p = this.posicion();
    return !!s && d !== null && !!p && d <= s.radioMetros && p.precision <= s.precisionMaxima;
  });

  protected readonly siguiente = computed(() => this.perfil()?.siguienteMarcacion ?? 'ENTRADA');

  /* Lo que se imprime sobre la foto: se actualiza en vivo mientras el GPS se mueve */
  protected readonly sello = computed<DatosSello | null>(() => {
    const p = this.perfil();
    const s = this.sede();
    if (!p || !s) return null;
    return {
      nombre: p.trabajador.nombres,
      documento: p.trabajador.documentoIdentidad,
      tipo: this.siguiente(),
      sede: s,
      posicion: this.posicion(),
      distancia: this.distancia(),
      dentro: this.dentro()
    };
  });
  protected readonly marcacionesHoy = computed(() => {
    const hoy = hoyIso();
    return [...this.historial()].filter((m) => m.fechaHora.startsWith(hoy)).reverse();
  });
  protected readonly horasHoy = computed(() => {
    // Suma los tramos entrada→salida del día (el tramo abierto cuenta hasta ahora)
    let ms = 0;
    let entrada: number | null = null;
    for (const m of this.marcacionesHoy()) {
      const t = new Date(m.fechaHora).getTime();
      if (m.tipo === 'ENTRADA') entrada = t;
      else if (entrada !== null) { ms += t - entrada; entrada = null; }
    }
    if (entrada !== null) ms += this.ahora().getTime() - entrada;
    const min = Math.max(0, Math.floor(ms / 60000));
    return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
  });

  constructor() {
    const destroy = inject(DestroyRef);
    const reloj = setInterval(() => this.ahora.set(new Date()), 1000);
    destroy.onDestroy(() => clearInterval(reloj));
    this.cargar();
    this.seguirUbicacion(destroy);
  }

  protected cargar(): void {
    this.cargando.set(true);
    forkJoin({ perfil: this.api.portal.perfil(), historial: this.api.portal.misMarcaciones() }).subscribe({
      next: ({ perfil, historial }) => {
        this.perfil.set(perfil);
        this.historial.set(historial);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  private seguirUbicacion(destroy: DestroyRef): void {
    if (!window.isSecureContext) {
      this.estadoGps.set('inseguro');
      return;
    }
    if (!('geolocation' in navigator)) {
      this.estadoGps.set('no-disponible');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => this.recibir(p),
      (e) => this.estadoGps.set(e.code === e.PERMISSION_DENIED ? 'denegado' : 'no-disponible'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    destroy.onDestroy(() => navigator.geolocation.clearWatch(id));
  }

  private recibir(p: GeolocationPosition): void {
    this.posicion.set({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy });
    this.ultimaLectura = Date.now();
    this.estadoGps.set('listo');
  }

  /* Usa la última lectura si es reciente; si no, pide una nueva antes de enviar */
  private obtenerPosicion(): Promise<Posicion> {
    const actual = this.posicion();
    if (actual && Date.now() - this.ultimaLectura < 10_000) {
      return Promise.resolve(actual);
    }
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (p) => {
          this.recibir(p);
          resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy });
        },
        (e) => reject(e),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      )
    );
  }

  /* Minutos después de la hora de entrada, si pasó la tolerancia de la sede (0 si llegó a tiempo) */
  private minutosTarde(fechaHora: string): number {
    const s = this.sede();
    if (!s?.horaEntrada) return 0;
    const [h, m] = s.horaEntrada.split(':').map(Number);
    const llegada = new Date(fechaHora);
    const minutos = llegada.getHours() * 60 + llegada.getMinutes() - (h * 60 + m);
    return minutos > (s.toleranciaMinutos ?? 0) ? minutos : 0;
  }

  /* Paso 1: ubicación. Paso 2: la foto (se abre la cámara con el sello en vivo). */
  protected async marcar(): Promise<void> {
    if (this.marcando() || this.camaraAbierta()) return;
    this.resultado.set(null);
    try {
      await this.obtenerPosicion();
      this.camaraAbierta.set(true);
    } catch {
      this.resultado.set({ ok: false, texto: 'No se pudo obtener tu ubicación. Activa el GPS y el permiso de ubicación.' });
    }
  }

  /* Se envían la posición con la que se selló la foto y la foto misma; el servidor decide */
  protected enviar(captura: FotoCapturada): void {
    const p = captura.posicion;
    this.marcando.set(true);
    this.api.portal.marcar({ latitud: p.lat, longitud: p.lng, precision: p.precision, foto: captura.foto }).subscribe({
      next: (m) => {
        const tipo = m.tipo === 'ENTRADA' ? 'Entrada' : 'Salida';
        this.camaraAbierta.set(false);
        const tarde = m.tipo === 'ENTRADA' ? this.minutosTarde(m.fechaHora) : 0;
        this.resultado.set({
          ok: true,
          texto: tarde > 0 ? `${tipo} registrada · ${tarde} min tarde` : `${tipo} registrada`,
          hora: m.fechaHora
        });
        this.toast.exito(`${tipo} registrada a ${Math.round(m.distanciaMetros ?? 0)} m de la empresa.`);
        this.marcando.set(false);
        this.cargar();
      },
      error: (e: HttpErrorResponse) => {
        this.marcando.set(false);
        if (e.status === 400) {
          // Problema con la foto (oscura, dañada…): la cámara sigue abierta para repetirla
          this.toast.error(mensajeDeError(e));
          return;
        }
        this.camaraAbierta.set(false);
        this.resultado.set({ ok: false, texto: mensajeDeError(e) });
      }
    });
  }
}
