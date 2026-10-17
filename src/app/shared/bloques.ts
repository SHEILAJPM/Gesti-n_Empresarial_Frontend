import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Icon, NombreIcono } from './icon';

/* Cabecera de cada página: etiqueta de sección, título, descripción y acciones a la derecha */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="texto">
      @if (seccion()) { <span class="seccion">{{ seccion() }}</span> }
      <h1>{{ titulo() }}</h1>
      @if (descripcion()) { <p>{{ descripcion() }}</p> }
    </div>
    <div class="acciones"><ng-content /></div>
  `,
  styles: `
    :host { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; animation: subir .5s var(--ease-out) both; }
    .seccion { font-size: 11.5px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--brand); }
    h1 { font-size: 28px; margin-top: 4px; }
    p { color: var(--ink-3); margin-top: 4px; max-width: 640px; }
    .acciones { display: flex; gap: 10px; flex-wrap: wrap; }
  `
})
export class PageHeader {
  readonly titulo = input.required<string>();
  readonly seccion = input('');
  readonly descripcion = input('');
}

/* Estado vacío para tablas y listas */
@Component({
  selector: 'app-vacio',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="icono"><app-icon [name]="icono()" [size]="26" [grosor]="1.5" /></span>
    <strong>{{ titulo() }}</strong>
    @if (texto()) { <p>{{ texto() }}</p> }
    <ng-content />
  `,
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 48px 24px; animation: subir .5s var(--ease-out) both; }
    .icono { display: grid; place-items: center; width: 60px; height: 60px; border-radius: 18px; background: var(--surface-3); color: var(--ink-3); margin-bottom: 8px; }
    strong { font-family: var(--font-display); font-size: 16px; }
    p { color: var(--ink-3); font-size: 13.5px; max-width: 340px; margin-bottom: 8px; }
  `
})
export class Vacio {
  readonly icono = input<NombreIcono>('bandeja');
  readonly titulo = input.required<string>();
  readonly texto = input('');
}

/* Mensaje de validación debajo de un campo */
@Component({
  selector: 'app-error-campo',
  changeDetection: ChangeDetectionStrategy.Default,
  template: `@if (mensaje(); as m) { <span class="error-campo">{{ m }}</span> }`
})
export class ErrorCampo {
  readonly control = input.required<AbstractControl>();
  readonly mensajes = input<Record<string, string>>({});

  protected mensaje(): string | null {
    const c = this.control();
    if (!c.errors || !c.touched) {
      return null;
    }
    const clave = Object.keys(c.errors)[0];
    const propios = this.mensajes();
    if (propios[clave]) {
      return propios[clave];
    }
    switch (clave) {
      case 'required': return 'Este campo es obligatorio.';
      case 'min': return `Debe ser mayor o igual a ${c.errors['min'].min}.`;
      case 'max': return `Debe ser menor o igual a ${c.errors['max'].max}.`;
      case 'maxlength': return `Máximo ${c.errors['maxlength'].requiredLength} caracteres.`;
      case 'minlength': return `Mínimo ${c.errors['minlength'].requiredLength} caracteres.`;
      case 'pattern': return 'El formato no es válido.';
      default: return 'Valor no válido.';
    }
  }
}

/* Paginación de tablas */
@Component({
  selector: 'app-paginador',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="muted">{{ rango() }}</span>
    <div class="botones">
      <button type="button" class="btn btn-sm btn-icono" [disabled]="pagina() <= 1" (click)="cambiar.emit(pagina() - 1)" aria-label="Página anterior">
        <app-icon name="izquierda" [size]="16" />
      </button>
      <span class="num">{{ pagina() }} / {{ paginas() }}</span>
      <button type="button" class="btn btn-sm btn-icono" [disabled]="pagina() >= paginas()" (click)="cambiar.emit(pagina() + 1)" aria-label="Página siguiente">
        <app-icon name="derecha" [size]="16" />
      </button>
    </div>
  `,
  styles: `
    :host { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--border); font-size: 13px; }
    .botones { display: flex; align-items: center; gap: 10px; }
  `
})
export class Paginador {
  readonly pagina = input.required<number>();
  readonly paginas = input.required<number>();
  readonly total = input.required<number>();
  readonly tamano = input.required<number>();
  readonly cambiar = output<number>();

  protected readonly rango = computed(() => {
    if (!this.total()) {
      return 'Sin resultados';
    }
    const desde = (this.pagina() - 1) * this.tamano() + 1;
    const hasta = Math.min(this.total(), this.pagina() * this.tamano());
    return `Mostrando ${desde}–${hasta} de ${this.total()}`;
  });
}
