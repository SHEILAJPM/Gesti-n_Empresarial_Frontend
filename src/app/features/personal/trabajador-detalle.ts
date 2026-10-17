import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { Documento, Marcacion, Pago, Trabajador } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { Paginador, Vacio } from '../../shared/bloques';
import { antiguedad, colorAvatar, diasHasta, edad, hoyIso, iniciales, soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { TablaEstado } from '../../shared/tabla';
import { CeseTrabajador } from './cese-trabajador';
import { FormTrabajador } from './form-trabajador';

type Pestana = 'ficha' | 'asistencia' | 'documentos' | 'pagos';

@Component({
  selector: 'app-trabajador-detalle',
  imports: [DatePipe, RouterLink, Icon, Paginador, Vacio, FormTrabajador, CeseTrabajador],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trabajador-detalle.html',
  styleUrl: './trabajador-detalle.scss'
})
export class TrabajadorDetalle {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly puedeEditar = this.auth.puede('personal.editar');
  protected readonly puedeVerPagos = this.auth.puede('pagos.ver');
  protected readonly soles = soles;
  protected readonly antiguedad = antiguedad;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;
  protected readonly diasHasta = diasHasta;

  /* Viene de la ruta /personal/:id */
  readonly id = input.required<string>();

  protected readonly cargando = signal(true);
  protected readonly noEncontrado = signal(false);
  protected readonly trabajador = signal<Trabajador | null>(null);
  protected readonly marcaciones = signal<Marcacion[]>([]);
  protected readonly documentos = signal<Documento[]>([]);
  protected readonly pagos = signal<Pago[]>([]);
  protected readonly pestana = signal<Pestana>('ficha');

  protected readonly formAbierto = signal(false);
  protected readonly ceseAbierto = signal(false);

  protected readonly edad = computed(() => edad(this.trabajador()?.fechaNacimiento ?? null));
  protected readonly activo = computed(() => this.trabajador()?.estado === 'ACTIVO');

  /* Campos de la ficha sin completar (para el aviso) */
  protected readonly pendientes = computed(() => {
    const t = this.trabajador();
    if (!t) {
      return [];
    }
    const faltan: string[] = [];
    if (!t.fechaIngreso) faltan.push('fecha de ingreso');
    if (t.sueldo === null) faltan.push('sueldo');
    if (!t.sistemaPension) faltan.push('sistema de pensiones');
    if (!t.numeroCuenta) faltan.push('cuenta bancaria');
    if (!t.telefono && !t.correo) faltan.push('un medio de contacto');
    return faltan;
  });

  private readonly marcacionesOrdenadas = computed(() =>
    [...this.marcaciones()].sort((a, b) => b.fechaHora.localeCompare(a.fechaHora))
  );
  protected readonly tablaAsistencia = new TablaEstado(this.marcacionesOrdenadas, (m) => m.fechaHora, 10);

  protected readonly resumenMes = computed(() => {
    const mes = hoyIso().slice(0, 7);
    const delMes = this.marcaciones().filter((m) => m.fechaHora.startsWith(mes));
    return {
      dias: new Set(delMes.filter((m) => m.tipo === 'ENTRADA').map((m) => m.fechaHora.slice(0, 10))).size,
      entradas: delMes.filter((m) => m.tipo === 'ENTRADA').length,
      ultima: this.marcacionesOrdenadas()[0] ?? null
    };
  });

  protected readonly documentosOrdenados = computed(() =>
    [...this.documentos()].sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
  );

  protected readonly pagosOrdenados = computed(() =>
    [...this.pagos()].sort((a, b) => b.fechaProgramada.localeCompare(a.fechaProgramada))
  );
  protected readonly totalPagado = computed(() =>
    this.pagos().filter((p) => p.estado === 'PAGADO').reduce((s, p) => s + p.monto, 0)
  );

  protected readonly pestanas = computed(() => {
    const lista: { id: Pestana; titulo: string; cantidad: number | null }[] = [
      { id: 'ficha', titulo: 'Ficha', cantidad: null },
      { id: 'asistencia', titulo: 'Asistencia', cantidad: this.marcaciones().length },
      { id: 'documentos', titulo: 'Documentos', cantidad: this.documentos().length }
    ];
    if (this.puedeVerPagos) {
      lista.push({ id: 'pagos', titulo: 'Pagos', cantidad: this.pagos().length });
    }
    return lista;
  });

  constructor() {
    effect(() => this.cargar(Number(this.id())));
  }

  private cargar(id: number): void {
    this.cargando.set(true);
    this.noEncontrado.set(false);
    forkJoin({
      trabajador: this.api.personal.obtener(id),
      marcaciones: this.api.asistencia.porTrabajador(id).pipe(catchError(() => of([] as Marcacion[]))),
      documentos: this.api.documentos.porTrabajador(id).pipe(catchError(() => of([] as Documento[]))),
      pagos: this.puedeVerPagos ? this.api.pagos.porTrabajador(id).pipe(catchError(() => of([] as Pago[]))) : of([] as Pago[])
    }).subscribe({
      next: (datos) => {
        this.trabajador.set(datos.trabajador);
        this.marcaciones.set(datos.marcaciones);
        this.documentos.set(datos.documentos);
        this.pagos.set(datos.pagos);
        this.cargando.set(false);
      },
      error: () => {
        this.noEncontrado.set(true);
        this.cargando.set(false);
      }
    });
  }

  protected alGuardar(t: Trabajador): void {
    this.trabajador.set(t);
    this.formAbierto.set(false);
    this.ceseAbierto.set(false);
  }

  protected async reactivar(): Promise<void> {
    const t = this.trabajador();
    if (!t) return;
    const ok = await this.confirm.preguntar({
      titulo: `Reactivar a ${t.nombres}`,
      mensaje: 'Volverá a figurar como activo y podrá registrar asistencia.',
      accion: 'Reactivar'
    });
    if (!ok) return;
    this.api.personal.reactivar(t.id).subscribe({
      next: (r) => {
        this.trabajador.set(r);
        this.toast.exito(`${r.nombres} fue reactivado.`);
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected async eliminar(): Promise<void> {
    const t = this.trabajador();
    if (!t) return;
    const ok = await this.confirm.preguntar({
      titulo: 'Eliminar registro',
      mensaje: `Solo es posible si ${t.nombres} no tiene asistencias, documentos ni pagos. Si los tiene, dalo de baja.`,
      accion: 'Eliminar',
      peligro: true
    });
    if (!ok) return;
    this.api.personal.eliminar(t.id).subscribe({
      next: () => {
        this.toast.exito('Registro eliminado.');
        this.router.navigate(['/personal']);
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected estadoDocumento(d: Documento): { texto: string; clase: string } {
    const dias = diasHasta(d.fechaVencimiento);
    if (dias < 0) return { texto: `Vencido hace ${Math.abs(dias)} d`, clase: 'badge-peligro' };
    if (dias <= 30) return { texto: dias === 0 ? 'Vence hoy' : `Vence en ${dias} d`, clase: 'badge-alerta' };
    return { texto: 'Vigente', clase: 'badge-exito' };
  }
}
