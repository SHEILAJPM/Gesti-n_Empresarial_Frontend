import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Despacho, LineaDespacho } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { Icon } from '../../shared/icon';
import { ESTADO_ALISTAMIENTO } from './despachos';

type Lector = { stop(): void };

/* Alistar un pedido con el celular: la cámara lee el código de barras (o QR) de cada producto que se saca del
   estante y lo suma a su línea. También acepta lectores USB/Bluetooth (escriben el código y Enter) y ajustes a mano. */
@Component({
  selector: 'app-alistar',
  imports: [DecimalPipe, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila alistar">
      <a routerLink="/despachos" class="volver"><app-icon name="izquierda" [size]="16" /> Pedidos</a>

      @if (despacho(); as d) {
        <header class="card cabecera">
          <div>
            <h1>{{ d.cliente }}</h1>
            <small class="muted">{{ d.numeroComprobante }} · DNI/RUC {{ d.documentoCliente }}</small>
          </div>
          <span class="badge punto" [class]="estados[d.estadoAlistamiento].clase">{{ estados[d.estadoAlistamiento].texto }}</span>
          <div class="avance">
            <div class="barra"><span [style.width.%]="porcentaje()"></span></div>
            <strong class="num">{{ d.unidadesAlistadas }} / {{ d.unidadesPedidas }}</strong>
          </div>
        </header>

        @if (d.estadoAlistamiento !== 'LISTO') {
          <section class="card escaner">
            <div class="video" [class.activo]="camaraActiva()" [class.ok]="destello() === 'ok'" [class.error]="destello() === 'error'">
              <video #video playsinline muted></video>
              @if (!camaraActiva()) {
                <button type="button" class="btn btn-primario grande" (click)="abrirCamara()" [disabled]="iniciando()">
                  @if (iniciando()) { <span class="spinner"></span> Abriendo cámara… } @else { <app-icon name="camara" [size]="20" /> Escanear con la cámara }
                </button>
              } @else {
                <div class="mira"></div>
                <button type="button" class="btn btn-sm cerrar" (click)="cerrarCamara()"><app-icon name="cerrar" [size]="15" /> Cerrar</button>
              }
            </div>
            @if (mensaje(); as m) {
              <p class="mensaje" [class.ok]="m.ok" [class.error]="!m.ok" role="status">{{ m.texto }}</p>
            }
            <form class="manual" (submit)="$event.preventDefault(); escribir(codigo.value); codigo.value = ''">
              <input #codigo class="control mono" placeholder="O escribe / usa el lector: código y Enter" autocomplete="off" />
              <button type="submit" class="btn">Agregar</button>
            </form>
          </section>
        }

        <section class="card lineas">
          @for (l of d.items; track l.orden) {
            <div class="linea" [class.completa]="l.alistado >= l.cantidad">
              <div class="estado-linea">
                @if (l.alistado >= l.cantidad) { <app-icon name="checkCirculo" [size]="22" /> } @else { <span class="num">{{ l.alistado | number: '1.0-3' }}</span> }
              </div>
              <div class="info">
                <strong>{{ l.descripcion }}</strong>
                <small class="muted mono">{{ l.codigoBarras || l.codigo || 'sin código' }}</small>
              </div>
              <div class="cantidad">
                <strong class="num">{{ l.alistado | number: '1.0-3' }} / {{ l.cantidad | number: '1.0-3' }}</strong>
                <small class="muted">{{ l.unidad }}</small>
                @if (d.estadoAlistamiento !== 'LISTO') {
                  <div class="ajuste">
                    <button type="button" class="btn btn-sm btn-icono" aria-label="Quitar uno" [disabled]="l.alistado <= 0" (click)="ajustar(l, -1)">−</button>
                    <button type="button" class="btn btn-sm btn-icono" aria-label="Sumar uno" [disabled]="l.alistado >= l.cantidad" (click)="ajustar(l, 1)">+</button>
                  </div>
                }
              </div>
            </div>
          }
        </section>

        <div class="acciones">
          @if (d.estadoAlistamiento === 'LISTO') {
            <button type="button" class="btn" (click)="reabrir()">Reabrir</button>
            <a class="btn btn-primario" routerLink="/guias" [queryParams]="{ venta: d.ventaId }"><app-icon name="camion" [size]="16" /> Crear guía de remisión</a>
          } @else {
            <button type="button" class="btn btn-primario grande" [disabled]="!completo() || terminando()" (click)="terminar()">
              <app-icon name="check" [size]="18" /> {{ completo() ? 'Pedido listo' : 'Faltan ' + (d.unidadesPedidas - d.unidadesAlistadas) + ' unidades' }}
            </button>
          }
        </div>
      } @else {
        <div class="skeleton" style="height: 320px; border-radius: 16px"></div>
      }
    </div>
  `,
  styles: `
    .alistar { max-width: 720px; margin: 0 auto; padding-bottom: 72px; }
    .volver { display: inline-flex; gap: 4px; align-items: center; color: var(--ink-2); text-decoration: none; font-size: 13.5px; }
    .cabecera { padding: 16px; display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: start; }
    .cabecera h1 { font-size: 20px; margin: 0; }
    .avance { grid-column: 1 / -1; display: flex; gap: 10px; align-items: center; }
    .barra { flex: 1; height: 10px; border-radius: 5px; background: var(--surface-2); overflow: hidden; }
    .barra span { display: block; height: 100%; background: var(--brand); transition: width .3s; }
    .escaner { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .video { position: relative; aspect-ratio: 4 / 3; max-height: 50vh; border-radius: 14px; overflow: hidden; background: #0b1320;
      display: grid; place-items: center; border: 3px solid transparent; transition: border-color .15s; }
    .video.ok { border-color: var(--success, #16a34a); }
    .video.error { border-color: var(--danger); }
    video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: none; }
    .video.activo video { display: block; }
    .mira { position: absolute; inset: 30% 12%; border: 2px dashed rgba(255,255,255,.8); border-radius: 10px; pointer-events: none; }
    .cerrar { position: absolute; top: 8px; right: 8px; }
    .grande { padding: 14px 20px; font-size: 15px; }
    .mensaje { margin: 0; padding: 10px 12px; border-radius: 10px; font-size: 14px; font-weight: 600; }
    .mensaje.ok { background: var(--success-soft); color: var(--success); }
    .mensaje.error { background: var(--danger-soft); color: var(--danger); }
    .manual { display: flex; gap: 8px; }
    .manual input { flex: 1; }
    .lineas { padding: 4px 0; }
    .linea { display: grid; grid-template-columns: 40px 1fr auto; gap: 12px; align-items: center; padding: 12px 16px;
      border-bottom: 1px solid var(--border); }
    .linea:last-child { border-bottom: 0; }
    .linea.completa { background: var(--success-soft); }
    .estado-linea { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2);
      font-weight: 700; color: var(--ink-2); }
    .linea.completa .estado-linea { background: transparent; color: var(--success); }
    .info { display: flex; flex-direction: column; min-width: 0; }
    .cantidad { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .ajuste { display: flex; gap: 4px; margin-top: 4px; }
    .acciones { display: flex; gap: 8px; justify-content: flex-end; position: sticky; bottom: 12px; }
  `
})
export class Alistar {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly ventaId = input.required<string>();

  protected readonly estados = ESTADO_ALISTAMIENTO;
  protected readonly despacho = signal<Despacho | null>(null);
  protected readonly camaraActiva = signal(false);
  protected readonly iniciando = signal(false);
  protected readonly terminando = signal(false);
  protected readonly mensaje = signal<{ ok: boolean; texto: string } | null>(null);
  protected readonly destello = signal<'ok' | 'error' | null>(null);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private lector: Lector | null = null;
  private ultimo = { codigo: '', hora: 0 };
  private enviando = false;
  private audio: AudioContext | null = null;

  protected readonly completo = computed(() => {
    const d = this.despacho();
    return !!d && d.items.every((l) => l.alistado >= l.cantidad);
  });
  protected readonly porcentaje = computed(() => {
    const d = this.despacho();
    return d && d.unidadesPedidas ? Math.min(100, (d.unidadesAlistadas / d.unidadesPedidas) * 100) : 0;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cerrarCamara());
    queueMicrotask(() => this.cargar());
  }

  private cargar(): void {
    this.api.despachos.obtener(Number(this.ventaId())).subscribe({
      next: (d) => this.despacho.set(d),
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.router.navigate(['/despachos']);
      }
    });
  }

  /* Cámara trasera; lee códigos de barras (EAN, Code 128…) y QR */
  protected async abrirCamara(): Promise<void> {
    const video = this.video()?.nativeElement;
    if (!video) return;
    this.iniciando.set(true);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const lector = new BrowserMultiFormatReader();
      this.lector = await lector.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video, (resultado) => {
        if (resultado) this.leido(resultado.getText());
      });
      this.camaraActiva.set(true);
    } catch {
      this.toast.error('No se pudo abrir la cámara. Da permiso de cámara al navegador (en el celular la página debe abrirse con https).');
    } finally {
      this.iniciando.set(false);
    }
  }

  protected cerrarCamara(): void {
    this.lector?.stop();
    this.lector = null;
    this.camaraActiva.set(false);
  }

  /* La cámara lee el mismo código muchas veces por segundo: se ignora la repetición durante 1.5 s */
  private leido(codigo: string): void {
    const ahora = Date.now();
    if (this.enviando || (codigo === this.ultimo.codigo && ahora - this.ultimo.hora < 1500)) return;
    this.ultimo = { codigo, hora: ahora };
    this.escanear(codigo);
  }

  protected escribir(codigo: string): void {
    if (codigo.trim()) this.escanear(codigo.trim());
  }

  private escanear(codigo: string): void {
    const d = this.despacho();
    if (!d) return;
    this.enviando = true;
    this.api.despachos.escanear(d.ventaId, codigo).subscribe({
      next: (r) => {
        this.despacho.set(r.despacho);
        this.avisar(true, `${r.producto}: ${r.alistado} de ${r.cantidad}${r.completo ? ' ✓ completo' : ''}`);
        this.enviando = false;
      },
      error: (e: HttpErrorResponse) => {
        this.avisar(false, mensajeDeError(e));
        this.enviando = false;
      }
    });
  }

  protected ajustar(l: LineaDespacho, cambio: number): void {
    const d = this.despacho();
    if (!d) return;
    const nueva = Math.max(0, Math.min(l.cantidad, Math.round((l.alistado + cambio) * 1000) / 1000));
    this.api.despachos.fijar(d.ventaId, l.orden, nueva).subscribe({
      next: (r) => this.despacho.set(r),
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected terminar(): void {
    const d = this.despacho();
    if (!d) return;
    this.terminando.set(true);
    this.api.despachos.listo(d.ventaId, null).subscribe({
      next: (r) => {
        this.despacho.set(r);
        this.cerrarCamara();
        this.toast.exito('Pedido listo. Ya puedes crear la guía de remisión.');
        this.terminando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.terminando.set(false);
      }
    });
  }

  protected reabrir(): void {
    const d = this.despacho();
    if (!d) return;
    this.api.despachos.reabrir(d.ventaId).subscribe({ next: (r) => this.despacho.set(r), error: (e) => this.toast.error(mensajeDeError(e)) });
  }

  /* Pitido, vibración y borde verde o rojo: el almacenero no necesita mirar la pantalla */
  private avisar(ok: boolean, texto: string): void {
    this.mensaje.set({ ok, texto });
    this.destello.set(ok ? 'ok' : 'error');
    setTimeout(() => this.destello.set(null), 600);
    navigator.vibrate?.(ok ? 80 : [200, 80, 200]);
    try {
      this.audio ??= new AudioContext();
      const osc = this.audio.createOscillator();
      const vol = this.audio.createGain();
      osc.frequency.value = ok ? 1200 : 220;
      vol.gain.value = 0.15;
      osc.connect(vol).connect(this.audio.destination);
      osc.start();
      osc.stop(this.audio.currentTime + (ok ? 0.12 : 0.35));
    } catch {
      /* sin audio: queda la vibración y el color */
    }
  }
}
