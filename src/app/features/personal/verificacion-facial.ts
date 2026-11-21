import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, output, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { MarcacionPorVerificar, RostroRegistrado } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { FotoAsistencia } from '../../shared/foto-asistencia';
import { Icon } from '../../shared/icon';

/* RRHH: aprueba las fotos de referencia y revisa las marcaciones cuyo rostro no coincidió o no se detectó.
   Una marcación pendiente no cuenta para la asistencia ni la planilla hasta que se aprueba. */
@Component({
  selector: 'app-verificacion-facial',
  imports: [DatePipe, DecimalPipe, Icon, FotoAsistencia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rostrosPendientes().length || marcaciones().length) {
      <article class="card entrada verificacion">
        <header class="card-cabecera">
          <div>
            <h3><app-icon name="usuario" [size]="17" /> Verificación facial</h3>
            <p class="muted">Compara las fotos y decide. Lo pendiente no cuenta para la asistencia ni la planilla.</p>
          </div>
        </header>

        @if (rostrosPendientes().length) {
          <h4>Fotos de referencia por aprobar <span class="contador num">{{ rostrosPendientes().length }}</span></h4>
          <div class="grilla">
            @for (r of rostrosPendientes(); track r.trabajadorId) {
              <div class="item">
                @if (fotos()[r.trabajadorId]; as url) { <img [src]="url" alt="Rostro de referencia" /> } @else { <div class="foto-vacia"></div> }
                <div class="datos">
                  <strong>{{ r.nombres }}</strong>
                  <small class="muted">DNI {{ r.documento }} · {{ r.registradoEn | date: 'd MMM, HH:mm' }}</small>
                  <small class="muted">Compárala con su DNI o con la persona.</small>
                  <div class="botones">
                    <button type="button" class="btn btn-sm btn-primario" (click)="resolverRostro(r, true)"><app-icon name="check" [size]="14" /> Aprobar</button>
                    <button type="button" class="btn btn-sm" (click)="resolverRostro(r, false)">Rechazar</button>
                  </div>
                </div>
              </div>
            }
          </div>
        }

        @if (marcaciones().length) {
          <h4>Marcaciones por verificar <span class="contador num">{{ marcaciones().length }}</span></h4>
          <div class="grilla">
            @for (m of marcaciones(); track m.id) {
              <div class="item doble">
                <div class="fotos">
                  <figure><app-foto-asistencia [fotoId]="m.fotoId" alt="Foto al marcar" /><figcaption>Al marcar</figcaption></figure>
                  <figure>
                    @if (fotos()[m.trabajadorId]; as url) { <img [src]="url" alt="Rostro de referencia" /> } @else { <div class="foto-vacia">Sin referencia</div> }
                    <figcaption>Referencia</figcaption>
                  </figure>
                </div>
                <div class="datos">
                  <strong>{{ m.nombres }}</strong>
                  <small class="muted">{{ m.tipo === 'ENTRADA' ? 'Entrada' : 'Salida' }} · {{ m.fechaHora | date: 'EEE d MMM, HH:mm' }}</small>
                  <small style="color: var(--danger)">{{ m.motivo }}@if (m.distanciaFacial !== null) { (distancia {{ m.distanciaFacial | number: '1.2-2' }}; mismo rostro &lt; 0.50) }</small>
                  <div class="botones">
                    <button type="button" class="btn btn-sm btn-primario" (click)="resolverMarcacion(m, true)"><app-icon name="check" [size]="14" /> Es el trabajador</button>
                    <button type="button" class="btn btn-sm btn-peligro" (click)="resolverMarcacion(m, false)">No es</button>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </article>
    }
  `,
  styles: `
    .verificacion { border-color: var(--accent); padding-bottom: 14px; }
    h3 { display: flex; gap: 8px; align-items: center; margin: 0; }
    header p { margin: 4px 0 0; font-size: 13px; }
    h4 { margin: 6px 20px 10px; font-size: 14px; display: flex; gap: 8px; align-items: center; }
    .grilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; padding: 0 20px 8px; }
    .item { display: flex; gap: 12px; border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; }
    .item.doble { flex-direction: column; }
    .fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    figure { margin: 0; display: flex; flex-direction: column; gap: 4px; }
    figcaption { font-size: 11.5px; color: var(--ink-3); text-align: center; }
    img, .foto-vacia { width: 100%; max-width: 160px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 10px; background: var(--surface-2); }
    .item:not(.doble) img, .item:not(.doble) .foto-vacia { width: 96px; flex: none; }
    .foto-vacia { display: grid; place-items: center; font-size: 12px; color: var(--ink-3); }
    .datos { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .botones { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
  `
})
export class VerificacionFacial {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  /* Avisa al padre para que recargue la asistencia (una marcación aprobada empieza a contar) */
  readonly cambio = output<void>();

  protected readonly rostrosPendientes = signal<RostroRegistrado[]>([]);
  protected readonly marcaciones = signal<MarcacionPorVerificar[]>([]);
  protected readonly fotos = signal<Record<number, string>>({});
  private readonly urls: string[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.urls.forEach((u) => URL.revokeObjectURL(u)));
    this.cargar();
  }

  private cargar(): void {
    forkJoin({ rostros: this.api.verificacion.rostros(), marcaciones: this.api.verificacion.porVerificar() }).subscribe({
      next: ({ rostros, marcaciones }) => {
        this.rostrosPendientes.set(rostros.filter((r) => r.estado === 'PENDIENTE'));
        this.marcaciones.set(marcaciones);
        const conFoto = new Set(rostros.map((r) => r.trabajadorId));
        const ids = new Set([...this.rostrosPendientes().map((r) => r.trabajadorId), ...marcaciones.map((m) => m.trabajadorId)]);
        ids.forEach((id) => conFoto.has(id) && !this.fotos()[id] && this.cargarFoto(id));
      },
      error: () => {}
    });
  }

  private cargarFoto(trabajadorId: number): void {
    this.api.verificacion.fotoRostro(trabajadorId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.urls.push(url);
        this.fotos.update((f) => ({ ...f, [trabajadorId]: url }));
      },
      error: () => {}
    });
  }

  protected resolverRostro(r: RostroRegistrado, aprobar: boolean): void {
    const motivo = aprobar ? null : prompt('¿Por qué se rechaza? (el trabajador lo verá)', 'No se ve bien el rostro');
    if (!aprobar && !motivo) return;
    this.api.verificacion.resolverRostro(r.trabajadorId, aprobar, motivo).subscribe({
      next: () => {
        this.toast.exito(aprobar ? `Rostro de ${r.nombres} aprobado.` : 'Foto rechazada: se le pedirá otra.');
        this.cargar();
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected resolverMarcacion(m: MarcacionPorVerificar, aprobar: boolean): void {
    this.api.verificacion.resolverMarcacion(m.id, aprobar).subscribe({
      next: () => {
        this.toast.exito(aprobar ? 'Marcación aprobada: ya cuenta para la asistencia.' : 'Marcación rechazada: no cuenta.');
        this.marcaciones.update((l) => l.filter((x) => x.id !== m.id));
        this.cambio.emit();
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }
}
