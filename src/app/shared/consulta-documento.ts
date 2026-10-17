import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { Subject, catchError, debounceTime, distinctUntilChanged, filter, map, of, switchMap, tap } from 'rxjs';
import { ApiService } from '../core/api/api.service';
import { mensajeDeError } from '../core/api/errores';
import { DocumentoConsultado } from '../core/models';
import { Icon } from './icon';

type FaseConsulta = 'inactivo' | 'buscando' | 'encontrado' | 'error';

/* Busca en RENIEC (DNI) o SUNAT (RUC) apenas se termina de escribir el número y avisa con alEncontrar.
   Se dispara solo con lo que teclea el usuario (llamar escribir() desde (input)), no al abrir un registro existente. */
export class ConsultaDocumento {
  private readonly api = inject(ApiService);
  private readonly numeros = new Subject<string>();

  readonly estado = signal<FaseConsulta>('inactivo');
  readonly resultado = signal<DocumentoConsultado | null>(null);
  readonly mensaje = signal('');

  constructor(patron: RegExp, alEncontrar: (datos: DocumentoConsultado) => void) {
    const suscripcion = this.numeros
      .pipe(
        map((n) => n.trim()),
        tap((n) => {
          if (!patron.test(n)) {
            this.estado.set('inactivo');
            this.resultado.set(null);
          }
        }),
        // Una pausa corta: al escribir un RUC no se gasta una consulta de DNI al pasar por el 8.º dígito
        debounceTime(350),
        filter((n) => patron.test(n)),
        distinctUntilChanged(),
        tap(() => this.estado.set('buscando')),
        switchMap((n) =>
          this.api.consultas.documento(n).pipe(
            map((datos) => ({ datos, error: null as unknown })),
            catchError((error: unknown) => of({ datos: null, error }))
          )
        )
      )
      .subscribe(({ datos, error }) => {
        if (datos) {
          this.resultado.set(datos);
          this.estado.set('encontrado');
          alEncontrar(datos);
        } else {
          this.resultado.set(null);
          this.estado.set('error');
          this.mensaje.set(
            error instanceof HttpErrorResponse && error.status === 404
              ? 'No se encontró; escribe el nombre a mano.'
              : mensajeDeError(error)
          );
        }
      });
    inject(DestroyRef).onDestroy(() => suscripcion.unsubscribe());
  }

  escribir(numero: string): void {
    this.numeros.next(numero);
  }

  /* Al abrir el formulario: olvida la consulta anterior */
  reiniciar(): void {
    this.estado.set('inactivo');
    this.resultado.set(null);
    this.numeros.next('');
  }
}

/* Línea de estado bajo el campo del documento */
@Component({
  selector: 'app-estado-consulta',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (consulta().estado()) {
      @case ('buscando') {
        <span class="ayuda" style="display: inline-flex; align-items: center; gap: 6px">
          <span class="spinner" style="width: 12px; height: 12px"></span> Buscando en {{ fuente() }}…
        </span>
      }
      @case ('encontrado') {
        @if (consulta().resultado(); as r) {
          <span class="ayuda" [class.text-success]="!observado()" [style.color]="observado() ? 'var(--accent)' : null"
            style="display: inline-flex; align-items: center; gap: 6px">
            <app-icon [name]="observado() ? 'alerta' : 'checkCirculo'" [size]="14" />
            Encontrado en {{ fuente() }}
            @if (r.estado) { · {{ r.estado }} }
            @if (r.condicion) { · {{ r.condicion }} }
          </span>
        }
      }
      @case ('error') {
        <span class="ayuda text-danger">{{ consulta().mensaje() }}</span>
      }
    }
  `
})
export class EstadoConsulta {
  readonly consulta = input.required<ConsultaDocumento>();

  protected readonly fuente = computed(() => {
    const r = this.consulta().resultado();
    return r?.tipo === 'RUC' ? 'SUNAT' : r?.tipo === 'DNI' ? 'RENIEC' : 'RENIEC/SUNAT';
  });

  /* Un RUC dado de baja o no habido merece atención antes de facturarle o comprarle */
  protected readonly observado = computed(() => {
    const r = this.consulta().resultado();
    return !!r && r.tipo === 'RUC' && ((!!r.estado && r.estado !== 'ACTIVO') || (!!r.condicion && r.condicion !== 'HABIDO'));
  });
}
