import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfirmService } from '../core/ui/confirm.service';
import { ToastService } from '../core/ui/toast.service';
import { Icon } from './icon';

/* Notificaciones (toasts) y diálogo de confirmación, montados una sola vez en App */
@Component({
  selector: 'app-avisos',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'confirm.pregunta()?.responder(false)' },
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="'toast-' + t.tipo" animate.enter="anim-toast-in" animate.leave="anim-toast-out">
          <span class="toast-icono">
            <app-icon [name]="t.tipo === 'exito' ? 'checkCirculo' : t.tipo === 'error' ? 'alerta' : 'info'" [size]="18" />
          </span>
          <p>{{ t.mensaje }}</p>
          <button type="button" class="btn btn-fantasma btn-icono btn-sm" (click)="toast.cerrar(t.id)" aria-label="Cerrar aviso">
            <app-icon name="cerrar" [size]="15" />
          </button>
          <span class="toast-progreso" [style.animation-duration.ms]="toast.duracion"></span>
        </div>
      }
    </div>

    @if (confirm.pregunta(); as p) {
      <div class="velo" animate.enter="anim-fade-in" animate.leave="anim-fade-out" (click)="p.responder(false)"></div>
      <div class="dialogo card" role="alertdialog" aria-modal="true" [attr.aria-label]="p.titulo"
        animate.enter="anim-pop-in" animate.leave="anim-pop-out">
        <span class="dialogo-icono" [class.peligro]="p.peligro">
          <app-icon [name]="p.peligro ? 'alerta' : 'info'" [size]="22" />
        </span>
        <h3>{{ p.titulo }}</h3>
        <p>{{ p.mensaje }}</p>
        <div class="dialogo-acciones">
          <button type="button" class="btn" (click)="p.responder(false)">Cancelar</button>
          <button type="button" class="btn" [class.btn-peligro]="p.peligro" [class.btn-primario]="!p.peligro"
            (click)="p.responder(true)">{{ p.accion ?? 'Confirmar' }}</button>
        </div>
      </div>
    }
  `,
  styles: `
    .toasts { position: fixed; left: 50%; translate: -50% 0; top: calc(var(--topbar-h) + 12px); z-index: 90; display: flex; flex-direction: column; gap: 10px; width: min(380px, calc(100vw - 32px)); }
    .toast {
      position: relative; overflow: hidden; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px;
      padding: 12px 10px 12px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border);
      box-shadow: var(--shadow-md); font-size: 13.5px;
    }
    .toast-icono { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: var(--c-suave); color: var(--c); }
    .toast-progreso { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--c); transform-origin: left; animation: progreso linear forwards; opacity: .7; }
    .toast-exito { --c: var(--success); --c-suave: var(--success-soft); }
    .toast-error { --c: var(--danger); --c-suave: var(--danger-soft); }
    .toast-info { --c: var(--info); --c-suave: var(--info-soft); }
    .velo { position: fixed; inset: 0; z-index: 80; background: rgba(8, 15, 26, .42); backdrop-filter: blur(3px); }
    .dialogo {
      position: fixed; z-index: 81; left: 50%; top: 50%; translate: -50% -50%;
      width: min(420px, calc(100vw - 32px)); padding: 26px; box-shadow: var(--shadow-lg);
    }
    .dialogo-icono { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 14px; background: var(--info-soft); color: var(--info); margin-bottom: 16px; }
    .dialogo-icono.peligro { background: var(--danger-soft); color: var(--danger); }
    h3 { font-size: 18px; }
    .dialogo p { color: var(--ink-2); margin-top: 6px; }
    .dialogo-acciones { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
  `
})
export class Avisos {
  protected readonly toast = inject(ToastService);
  protected readonly confirm = inject(ConfirmService);
}
