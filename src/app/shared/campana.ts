import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, interval, startWith, switchMap, catchError, of, merge } from 'rxjs';
import { ApiService } from '../core/api/api.service';
import { Notificacion } from '../core/models';
import { Icon, NombreIcono } from './icon';

const ICONO_NIVEL: Record<string, NombreIcono> = { peligro: 'alerta', alerta: 'reloj', info: 'info' };

/* Campana de la barra superior: avisos del rol (documentos por vencer, planillas por aprobar, tareas...).
   Se recalculan al cambiar de pantalla y cada minuto; desaparecen solos cuando se atiende lo que los causa. */
@Component({
  selector: 'app-campana',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'fuera($event)', '(document:keydown.escape)': 'abierto.set(false)' },
  template: `
    <button type="button" class="btn btn-fantasma btn-icono campana" (click)="abierto.set(!abierto())"
      [attr.aria-label]="total() ? total() + ' avisos' : 'Sin avisos'" [attr.aria-expanded]="abierto()">
      <app-icon name="campana" />
      @if (total()) { <span class="globo num" [class.peligro]="hayPeligro()">{{ total() > 99 ? '99+' : total() }}</span> }
    </button>
    @if (abierto()) {
      <div class="desplegable" role="menu" animate.enter="anim-pop-in">
        <header>Avisos</header>
        @for (a of avisos(); track a.codigo) {
          <a class="aviso" [routerLink]="a.ruta" (click)="abierto.set(false)" role="menuitem">
            <span class="icono" [class]="a.nivel"><app-icon [name]="icono(a.nivel)" [size]="16" /></span>
            <span class="texto"><strong>{{ a.titulo }}</strong><small>{{ a.cantidad }} {{ a.detalle }}</small></span>
            <span class="cantidad num">{{ a.cantidad }}</span>
          </a>
        } @empty {
          <p class="vacio"><app-icon name="checkCirculo" [size]="18" /> Todo al día.</p>
        }
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-flex; }
    .campana { position: relative; }
    .globo { position: absolute; top: 2px; right: 0; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 9px;
      background: var(--accent, var(--brand)); color: #fff; font-size: 10.5px; font-weight: 700; display: grid; place-items: center;
      line-height: 1; box-shadow: 0 0 0 2px var(--surface); }
    .globo.peligro { background: var(--danger); }
    .desplegable { position: absolute; right: 0; top: calc(100% + 8px); z-index: 60; width: min(340px, calc(100vw - 24px));
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
      padding: 6px; max-height: 70vh; overflow: auto; }
    header { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); padding: 8px 10px; }
    .aviso { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 9px 10px;
      border-radius: var(--radius-sm); color: inherit; text-decoration: none; }
    .aviso:hover { background: var(--surface-2); }
    .icono { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; }
    .icono.peligro { background: var(--danger-soft); color: var(--danger); }
    .icono.alerta { background: var(--accent-soft); color: var(--accent); }
    .icono.info { background: var(--info-soft); color: var(--info); }
    .texto { display: flex; flex-direction: column; min-width: 0; }
    .texto strong { font-size: 13.5px; }
    .texto small { color: var(--ink-3); font-size: 12px; }
    .cantidad { font-weight: 700; font-size: 13px; color: var(--ink-2); }
    .vacio { display: flex; gap: 8px; align-items: center; color: var(--ink-3); padding: 12px 10px; margin: 0; font-size: 13.5px; }
  `
})
export class Campana {
  private readonly api = inject(ApiService);
  private readonly el = inject(ElementRef<HTMLElement>);

  protected readonly abierto = signal(false);
  protected readonly avisos = signal<Notificacion[]>([]);
  protected readonly total = computed(() => this.avisos().reduce((s, a) => s + a.cantidad, 0));
  protected readonly hayPeligro = computed(() => this.avisos().some((a) => a.nivel === 'peligro'));

  constructor() {
    const navegaciones = inject(Router).events.pipe(filter((e) => e instanceof NavigationEnd));
    merge(navegaciones, interval(60_000))
      .pipe(
        startWith(null),
        switchMap(() => this.api.notificaciones.listar().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(inject(DestroyRef))
      )
      .subscribe((lista) => lista && this.avisos.set(lista));
  }

  protected icono(nivel: string): NombreIcono {
    return ICONO_NIVEL[nivel] ?? 'info';
  }

  protected fuera(evento: Event): void {
    if (this.abierto() && !this.el.nativeElement.contains(evento.target as Node)) {
      this.abierto.set(false);
    }
  }
}
