import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output,
  signal, untracked, viewChild
} from '@angular/core';
import { SISTEMA } from '../../core/config/constantes';
import { Sede, TipoMarcacion } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Posicion } from '../../shared/mapa';

/* Lo que se imprime sobre la foto */
export interface DatosSello {
  nombre: string;
  documento: string;
  tipo: TipoMarcacion;
  sede: Sede;
  posicion: Posicion | null;
  distancia: number | null;
  dentro: boolean;
}

export interface FotoCapturada {
  foto: string;
  posicion: Posicion;
}

/* Lado mayor de la foto final: alcanza para reconocer a la persona y leer el sello, y pesa unos 40-90 KB.
   Las fotos se guardan en la base (Neon): mientras más livianas, más meses caben en el plan. */
const LADO_MAXIMO = 720;
const CALIDAD_JPEG = 0.75;
const ZONA = 'America/Lima';

/* Paso de la foto al marcar: cámara frontal en vivo, captura y vista previa con el sello
   (tipo, hora, nombre, coordenadas, distancia a la sede y dirección). Solo usa la cámara: no deja elegir de la galería. */
@Component({
  selector: 'app-camara-marcacion',
  imports: [DecimalPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': '!enviando() && cancelar.emit()' },
  templateUrl: './camara-marcacion.html',
  styleUrl: './camara-marcacion.scss'
})
export class CamaraMarcacion {
  readonly datos = input.required<DatosSello>();
  readonly enviando = input(false);
  readonly confirmar = output<FotoCapturada>();
  readonly cancelar = output<void>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly estado = signal<'iniciando' | 'lista' | 'error'>('iniciando');
  protected readonly error = signal('');
  protected readonly vistaPrevia = signal<string | null>(null);
  protected readonly direccion = signal<string | null>(null);
  protected readonly ahora = signal(new Date());
  protected readonly hora = computed(() => formatoHora(this.ahora()));

  private capturada: FotoCapturada | null = null;
  private stream: MediaStream | null = null;
  private direccionPedida = false;

  constructor() {
    const destroy = inject(DestroyRef);
    const reloj = setInterval(() => this.ahora.set(new Date()), 1000);
    destroy.onDestroy(() => {
      clearInterval(reloj);
      this.apagar();
    });
    afterNextRender(() => this.iniciar());

    // La dirección se busca una sola vez, con la primera posición disponible
    effect(() => {
      const p = this.datos().posicion;
      if (p && !this.direccionPedida) {
        this.direccionPedida = true;
        untracked(() => buscarDireccion(p).then((d) => this.direccion.set(d)));
      }
    });
  }

  protected async iniciar(): Promise<void> {
    this.estado.set('iniciando');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fallar('Este navegador no permite usar la cámara. Abre el sistema en Chrome o Safari actualizados.');
      return;
    }
    try {
      this.apagar();
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      });
      const v = this.video().nativeElement;
      v.srcObject = this.stream;
      await v.play();
      this.estado.set('lista');
    } catch (e) {
      const nombre = e instanceof DOMException ? e.name : '';
      this.fallar(
        nombre === 'NotAllowedError'
          ? 'Diste «no» al permiso de la cámara. Actívalo en la configuración del navegador para poder marcar.'
          : nombre === 'NotFoundError' || nombre === 'OverconstrainedError'
            ? 'No encontramos una cámara en este dispositivo.'
            : nombre === 'NotReadableError'
              ? 'Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo.'
              : 'No se pudo abrir la cámara. Inténtalo de nuevo.'
      );
    }
  }

  protected capturar(): void {
    const datos = this.datos();
    const posicion = datos.posicion;
    const v = this.video().nativeElement;
    if (!posicion || !v.videoWidth) return;

    const escala = Math.min(1, LADO_MAXIMO / Math.max(v.videoWidth, v.videoHeight));
    const ancho = Math.round(v.videoWidth * escala);
    const alto = Math.round(v.videoHeight * escala);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(v, 0, 0, ancho, alto);
    sellar(ctx, ancho, alto, datos, posicion, new Date(), this.direccion());

    const foto = lienzo.toDataURL('image/jpeg', CALIDAD_JPEG);
    this.capturada = { foto, posicion: { ...posicion } };
    this.vistaPrevia.set(foto);
  }

  protected repetir(): void {
    this.capturada = null;
    this.vistaPrevia.set(null);
  }

  protected enviar(): void {
    if (this.capturada && !this.enviando()) {
      this.confirmar.emit(this.capturada);
    }
  }

  private fallar(mensaje: string): void {
    this.error.set(mensaje);
    this.estado.set('error');
  }

  private apagar(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

function formatoHora(fecha: Date): string {
  return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: ZONA })
    .format(fecha);
}

function formatoFecha(fecha: Date): string {
  const texto = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA })
    .format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/* Dirección aproximada del punto (OpenStreetMap). Si tarda o falla, la foto lleva solo las coordenadas. */
async function buscarDireccion(p: Posicion): Promise<string | null> {
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), 5000);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=es&lat=${p.lat}&lon=${p.lng}`;
    const respuesta = await fetch(url, { signal: control.signal });
    if (!respuesta.ok) return null;
    const datos = (await respuesta.json()) as { display_name?: string; address?: Record<string, string> };
    const a = datos.address ?? {};
    const calle = [a['road'] ?? a['pedestrian'] ?? a['footway'], a['house_number']].filter(Boolean).join(' ');
    const zona = a['neighbourhood'] ?? a['suburb'] ?? a['quarter'] ?? a['city_district'];
    const ciudad = a['city'] ?? a['town'] ?? a['village'] ?? a['county'];
    // Sin nombre de calle (plazas, parques, edificios) se usa el lugar más cercano que da OpenStreetMap
    if (!calle && datos.display_name) {
      return datos.display_name.split(',').map((p) => p.trim()).slice(0, 4).join(', ');
    }
    const partes = [calle, zona, ciudad].filter(Boolean);
    return partes.length ? [...new Set(partes)].join(', ') : null;
  } catch {
    return null;
  } finally {
    clearTimeout(limite);
  }
}

/* Dibuja el sello: marca del sistema arriba y una franja abajo con la marcación, la persona y la ubicación */
function sellar(ctx: CanvasRenderingContext2D, ancho: number, alto: number, d: DatosSello, p: Posicion, fecha: Date,
                direccion: string | null): void {
  const u = Math.max(11, Math.round(ancho / 42));
  const margen = Math.round(u * 0.9);
  const fuente = (peso: number, tam: number) => `${peso} ${Math.round(tam)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const anchoUtil = ancho - margen * 2;

  // Marca del sistema
  ctx.font = fuente(700, u * 0.85);
  const marca = `${SISTEMA.nombre} · Control de asistencia`;
  const anchoMarca = ctx.measureText(marca).width + u;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  rectRedondeado(ctx, margen, margen, anchoMarca, u * 1.6, u * 0.5);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(marca, margen + u / 2, margen + u * 0.8);

  // Franja inferior
  const lineas: { texto: string; color: string; peso: number }[] = [
    { texto: formatoFecha(fecha), color: '#fff', peso: 600 },
    { texto: `${d.nombre} · DNI ${d.documento}`, color: '#fff', peso: 500 },
    { texto: `Lat ${p.lat.toFixed(6)}  Lon ${p.lng.toFixed(6)}  (±${Math.round(p.precision)} m)`, color: '#e2e8f0', peso: 500 },
    {
      texto: d.distancia !== null
        ? `A ${Math.round(d.distancia)} m de ${d.sede.nombre} · ${d.dentro ? 'dentro de la zona' : `fuera de la zona (máx. ${d.sede.radioMetros} m)`}`
        : d.sede.nombre,
      color: d.dentro ? '#86efac' : '#fca5a5',
      peso: 600
    }
  ];
  if (direccion) lineas.push({ texto: direccion, color: '#e2e8f0', peso: 400 });

  const altoTitulo = u * 1.9;
  const altoLinea = u * 1.38;
  const altoFranja = margen * 2 + altoTitulo + lineas.length * altoLinea;
  const inicio = alto - altoFranja;
  const degradado = ctx.createLinearGradient(0, inicio - u * 2, 0, alto);
  degradado.addColorStop(0, 'rgba(0, 0, 0, 0)');
  degradado.addColorStop(0.25, 'rgba(0, 0, 0, 0.62)');
  degradado.addColorStop(1, 'rgba(0, 0, 0, 0.82)');
  ctx.fillStyle = degradado;
  ctx.fillRect(0, inicio - u * 2, ancho, altoFranja + u * 2);

  // Título: ENTRADA / SALIDA y la hora
  let y = inicio + margen + altoTitulo / 2;
  const etiqueta = d.tipo === 'ENTRADA' ? 'ENTRADA' : 'SALIDA';
  ctx.font = fuente(800, u * 1.05);
  const anchoEtiqueta = ctx.measureText(etiqueta).width + u * 1.2;
  ctx.fillStyle = d.tipo === 'ENTRADA' ? '#16a34a' : '#c2410c';
  rectRedondeado(ctx, margen, y - u * 0.8, anchoEtiqueta, u * 1.6, u * 0.4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(etiqueta, margen + u * 0.6, y);
  ctx.font = fuente(700, u * 1.5);
  ctx.fillText(formatoHora(fecha), margen + anchoEtiqueta + u * 0.6, y);

  y += altoTitulo / 2 + altoLinea / 2;
  for (const linea of lineas) {
    ctx.font = fuente(linea.peso, u * 0.95);
    ctx.fillStyle = linea.color;
    ctx.fillText(recortar(ctx, linea.texto, anchoUtil), margen, y);
    y += altoLinea;
  }
}

function recortar(ctx: CanvasRenderingContext2D, texto: string, maximo: number): string {
  if (ctx.measureText(texto).width <= maximo) return texto;
  let corto = texto;
  while (corto.length > 1 && ctx.measureText(`${corto}…`).width > maximo) corto = corto.slice(0, -1);
  return `${corto.trimEnd()}…`;
}

function rectRedondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
