import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { EstadoTarea, Tarea } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Vacio } from '../../shared/bloques';
import { Icon } from '../../shared/icon';
import { TEXTO_ESTADO_TAREA, TEXTO_PRIORIDAD } from '../tareas/tareas';

/* Tareas que RRHH o el jefe de área le asignaron al trabajador */
@Component({
  selector: 'app-mis-tareas',
  imports: [DatePipe, PageHeader, Icon, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila">
      <app-page-header seccion="Mi espacio" titulo="Mis tareas"
        descripcion="Lo que te asignaron RRHH o tu jefe. Márcalas en proceso cuando empieces y como terminadas al acabar." />

      @if (cargando()) {
        <div class="pila">@for (i of [1, 2, 3]; track i) { <div class="skeleton" style="height: 96px; border-radius: 16px"></div> }</div>
      } @else {
        <section class="pila">
          <h2 class="subtitulo">Por hacer <span class="contador num">{{ abiertas().length }}</span></h2>
          @for (t of abiertas(); track t.id; let i = $index) {
            <article class="card tarea entrada" [style.--i]="i" [class.vencida]="t.vencida">
              <div class="cabeza">
                <div>
                  <strong>{{ t.titulo }}</strong>
                  @if (t.descripcion) { <p class="ink-2">{{ t.descripcion }}</p> }
                  <small class="muted">
                    Asignada por {{ t.creadaPor }} el {{ t.creadaEn | date: 'd MMM' }}
                    @if (t.fechaLimite) { · <span [style.color]="t.vencida ? 'var(--danger)' : null">límite {{ t.fechaLimite | date: 'EEEE d MMM' }}{{ t.vencida ? ' (vencida)' : '' }}</span> }
                  </small>
                </div>
                <div class="etiquetas">
                  <span class="badge" [class]="prioridades[t.prioridad].clase">{{ prioridades[t.prioridad].texto }}</span>
                  <span class="badge punto" [class]="estados[t.estado].clase">{{ estados[t.estado].texto }}</span>
                </div>
              </div>
              @if (cerrando() === t.id) {
                <div class="cierre">
                  <textarea #c class="control" rows="2" maxlength="500" placeholder="Comentario para quien te la asignó (opcional)"></textarea>
                  <div class="botones">
                    <button type="button" class="btn btn-sm" (click)="cerrando.set(null)">Volver</button>
                    <button type="button" class="btn btn-sm btn-primario" [disabled]="enviando() === t.id" (click)="avanzar(t, 'HECHA', c.value)">
                      <app-icon name="check" [size]="15" /> Confirmar terminada
                    </button>
                  </div>
                </div>
              } @else {
                <div class="botones">
                  @if (t.estado === 'PENDIENTE') {
                    <button type="button" class="btn btn-sm" [disabled]="enviando() === t.id" (click)="avanzar(t, 'EN_PROCESO', null)">
                      <app-icon name="reloj" [size]="15" /> Empezar
                    </button>
                  }
                  <button type="button" class="btn btn-sm btn-primario" (click)="cerrando.set(t.id)">
                    <app-icon name="checkCirculo" [size]="15" /> Terminé
                  </button>
                </div>
              }
            </article>
          } @empty {
            <article class="card"><app-vacio icono="checkCirculo" titulo="Estás al día" texto="No tienes tareas pendientes." /></article>
          }
        </section>

        @if (cerradas().length) {
          <section class="pila">
            <h2 class="subtitulo">Historial</h2>
            <article class="card">
              <ul class="historial">
                @for (t of cerradas(); track t.id) {
                  <li>
                    <span class="badge punto" [class]="estados[t.estado].clase">{{ estados[t.estado].texto }}</span>
                    <span><strong>{{ t.titulo }}</strong>
                      @if (t.comentario) { <small class="muted"> · {{ t.comentario }}</small> }</span>
                    <small class="muted nowrap">{{ (t.completadaEn ?? t.actualizadaEn) | date: 'd MMM' }}</small>
                  </li>
                }
              </ul>
            </article>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .subtitulo { font-size: 15px; font-weight: 650; display: flex; align-items: center; gap: 8px; margin: 4px 0 0; }
    .tarea { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
    .tarea.vencida { border-color: var(--danger); }
    .cabeza { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .cabeza p { margin: 4px 0; font-size: 13.5px; }
    .etiquetas { display: flex; gap: 6px; align-items: flex-start; flex-wrap: wrap; }
    .botones { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
    .cierre { display: flex; flex-direction: column; gap: 8px; }
    .historial { list-style: none; margin: 0; padding: 6px 18px; }
    .historial li { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 10px 0;
      border-bottom: 1px solid var(--border); }
    .historial li:last-child { border-bottom: 0; }
  `
})
export class MisTareas {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly estados = TEXTO_ESTADO_TAREA;
  protected readonly prioridades = TEXTO_PRIORIDAD;

  protected readonly cargando = signal(true);
  protected readonly tareas = signal<Tarea[]>([]);
  protected readonly cerrando = signal<number | null>(null);
  protected readonly enviando = signal<number | null>(null);

  private readonly orden: Record<string, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
  protected readonly abiertas = computed(() =>
    this.tareas()
      .filter((t) => t.estado === 'PENDIENTE' || t.estado === 'EN_PROCESO')
      .sort((a, b) => Number(b.vencida) - Number(a.vencida) || this.orden[a.prioridad] - this.orden[b.prioridad]
        || (a.fechaLimite ?? '9').localeCompare(b.fechaLimite ?? '9'))
  );
  protected readonly cerradas = computed(() => this.tareas().filter((t) => t.estado === 'HECHA' || t.estado === 'CANCELADA'));

  constructor() {
    this.api.portal.misTareas().subscribe({
      next: (t) => {
        this.tareas.set(t);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected avanzar(t: Tarea, estado: EstadoTarea, comentario: string | null): void {
    this.enviando.set(t.id);
    this.api.portal.avanzarTarea(t.id, estado, comentario?.trim() || null).subscribe({
      next: (r) => {
        this.tareas.update((lista) => lista.map((x) => (x.id === r.id ? r : x)));
        this.toast.exito(estado === 'HECHA' ? '¡Tarea terminada!' : 'Tarea en proceso.');
        this.cerrando.set(null);
        this.enviando.set(null);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.enviando.set(null);
      }
    });
  }
}
