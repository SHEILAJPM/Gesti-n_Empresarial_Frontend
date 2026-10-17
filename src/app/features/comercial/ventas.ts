import { DatePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { TASA_IGV_REFERENCIAL } from '../../core/config/constantes';
import { Cliente, EstadoFacturacion, EstadoSunat, Venta } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { colorAvatar, hoyIso, iniciales, soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

@Component({
  selector: 'app-ventas',
  imports: [DatePipe, TitleCasePipe, ReactiveFormsModule, RouterLink, PageHeader, StatCard, Icon, Panel, Paginador, Vacio, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ventas.html',
  styleUrl: './ventas.scss'
})
export class Ventas {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly auth = inject(AuthService);
  protected readonly puedeEditar = this.auth.puede('ventas.editar');
  protected readonly puedeAnular = this.auth.puede('ventas.anular');
  protected readonly soles = soles;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;
  protected readonly hoy = hoyIso();

  /* ?nuevo=1 abre el formulario directamente (accesos rápidos del panel) */
  readonly nuevo = input<string>();

  protected readonly cargando = signal(true);
  protected readonly ventas = signal<Venta[]>([]);
  protected readonly facturacion = signal<EstadoFacturacion | null>(null);
  protected readonly detalleSunat = signal<Venta | null>(null);
  protected readonly procesandoSunat = signal(false);
  protected readonly clientes = signal<Cliente[]>([]);

  protected readonly filtroTipo = signal('');
  protected readonly filtroEstado = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');

  protected readonly tabla = new TablaEstado(
    this.ventas,
    (v) => `${v.numeroComprobante} ${v.nombreCliente} ${v.documentoCliente}`,
    10,
    computed(() => {
      const tipo = this.filtroTipo();
      const estado = this.filtroEstado();
      const desde = this.desde();
      const hasta = this.hasta();
      return (v: Venta) =>
        (!tipo || v.tipoComprobante === tipo) && (!estado || v.estado === estado) &&
        (!desde || v.fecha >= desde) && (!hasta || v.fecha <= hasta);
    })
  );

  private readonly emitidas = computed(() => this.tabla.filtradas().filter((v) => v.estado === 'EMITIDA'));
  protected readonly totalEmitido = computed(() => this.emitidas().reduce((s, v) => s + v.montoTotal, 0));
  protected readonly igvVentas = computed(() => this.emitidas().reduce((s, v) => s + v.igv, 0));
  protected readonly ticketPromedio = computed(() => (this.emitidas().length ? this.totalEmitido() / this.emitidas().length : 0));
  protected readonly anuladas = computed(() => this.tabla.filtradas().filter((v) => v.estado === 'ANULADA').length);
  protected readonly aceptadas = computed(() => this.ventas().filter((v) => v.sunat?.estado === 'ACEPTADO').length);
  protected readonly conProblemas = computed(
    () => this.ventas().filter((v) => v.estado === 'EMITIDA' && ['RECHAZADO', 'ERROR', 'EXCEPCION'].includes(v.sunat.estado)).length
  );
  protected readonly hayFiltros = computed(() => !!(this.filtroTipo() || this.filtroEstado() || this.desde() || this.hasta()));

  // ---------- Formulario ----------
  protected readonly panelAbierto = signal(false);
  protected readonly guardando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    documentoCliente: ['', Validators.required],
    numeroComprobante: ['', [Validators.required, Validators.pattern(/^[FB]\d{3}-\d{1,10}$/)]],
    montoSinIgv: [0, [Validators.required, Validators.min(0.01)]],
    fecha: [hoyIso(), Validators.required]
  });

  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly clienteElegido = computed(
    () => this.clientes().find((c) => c.documento === this.valores().documentoCliente) ?? null
  );
  protected readonly tipoComprobante = computed(() => (this.clienteElegido()?.tipoDocumento === 'RUC' ? 'FACTURA' : 'BOLETA'));
  protected readonly vistaPrevia = computed(() => {
    const base = Number(this.valores().montoSinIgv) || 0;
    const igv = Math.round(base * TASA_IGV_REFERENCIAL * 100) / 100;
    return { base, igv, total: base + igv };
  });

  constructor() {
    this.cargar();
    effect(() => {
      if (this.nuevo() && this.puedeEditar) {
        this.abrir();
      }
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    forkJoin({
      ventas: this.api.ventas.listar(),
      clientes: this.api.clientes.listar(),
      facturacion: this.api.facturacion.estado().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ ventas, clientes, facturacion }) => {
        this.facturacion.set(facturacion);
        this.ventas.set(ventas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
        this.clientes.set(clientes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected limpiarFiltros(): void {
    this.filtroTipo.set('');
    this.filtroEstado.set('');
    this.desde.set('');
    this.hasta.set('');
    this.tabla.buscar('');
  }

  protected abrir(): void {
    this.form.reset({ documentoCliente: '', numeroComprobante: '', montoSinIgv: 0, fecha: hoyIso() });
    this.panelAbierto.set(true);
  }

  /* Al elegir el cliente pide al backend el siguiente número libre de la serie F001 o B001
     (considera lo ya emitido en el proveedor de facturación, para no duplicar) */
  protected alElegirCliente(): void {
    const tipo = this.tipoComprobante();
    this.api.ventas.siguienteNumero(tipo).subscribe({
      next: ({ numero }) => this.form.controls.numeroComprobante.setValue(numero),
      error: () => {
        const prefijo = tipo === 'FACTURA' ? 'F001' : 'B001';
        const usados = this.ventas()
          .map((v) => v.numeroComprobante)
          .filter((n) => n.startsWith(`${prefijo}-`))
          .map((n) => Number(n.split('-')[1]) || 0);
        this.form.controls.numeroComprobante.setValue(`${prefijo}-${(usados.length ? Math.max(...usados) : 0) + 1}`);
      }
    });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const datos = this.form.getRawValue();
    const letra = this.tipoComprobante() === 'FACTURA' ? 'F' : 'B';
    if (!datos.numeroComprobante.startsWith(letra)) {
      this.toast.error(`Este cliente requiere ${this.tipoComprobante().toLowerCase()}: el número debe empezar con ${letra}.`);
      return;
    }
    this.guardando.set(true);
    this.api.ventas.registrar({ ...datos, montoSinIgv: Number(datos.montoSinIgv) }).subscribe({
      next: (venta) => {
        this.ventas.update((lista) => [venta, ...lista]);
        const tipo = venta.tipoComprobante === 'FACTURA' ? 'Factura' : 'Boleta';
        const sunat = this.etiquetaSunat(venta.sunat.estado).texto.toLowerCase();
        if (['RECHAZADO', 'ERROR', 'EXCEPCION'].includes(venta.sunat.estado)) {
          this.toast.error(`${tipo} ${venta.numeroComprobante} registrada, pero SUNAT: ${venta.sunat.mensaje}`);
        } else {
          this.toast.exito(`${tipo} ${venta.numeroComprobante} por ${soles(venta.montoTotal)} · SUNAT: ${sunat}.`);
        }
        this.panelAbierto.set(false);
        this.guardando.set(false);
        if (venta.sunat.estado === 'PENDIENTE') {
          this.seguirPendiente(venta.id, 1);
        }
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }

  protected async anular(v: Venta): Promise<void> {
    const ok = await this.confirm.preguntar({
      titulo: `Anular ${v.numeroComprobante}`,
      mensaje: `La venta a ${v.nombreCliente} por ${soles(v.montoTotal)} dejará de contar en el IGV del periodo.`,
      accion: 'Anular venta',
      peligro: true
    });
    if (!ok) {
      return;
    }
    this.api.ventas.anular(v.id).subscribe({
      next: (anulada) => {
        this.ventas.update((lista) => lista.map((x) => (x.id === anulada.id ? anulada : x)));
        this.toast.exito(`${v.numeroComprobante} fue anulada.`);
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  // ---------- Comprobante electrónico ----------
  protected etiquetaSunat(estado: EstadoSunat | undefined): { texto: string; clase: string } {
    switch (estado) {
      case 'ACEPTADO': return { texto: 'Aceptado', clase: 'badge-exito' };
      case 'PENDIENTE': return { texto: 'Pendiente', clase: 'badge-alerta' };
      case 'RECHAZADO': return { texto: 'Rechazado', clase: 'badge-peligro' };
      case 'EXCEPCION': return { texto: 'Excepción', clase: 'badge-peligro' };
      case 'ERROR': return { texto: 'Error de envío', clase: 'badge-peligro' };
      default: return { texto: 'No enviado', clase: '' };
    }
  }

  protected verSunat(v: Venta): void {
    this.detalleSunat.set(v);
  }

  protected consultarSunat(v: Venta): void {
    this.procesandoSunat.set(true);
    this.api.ventas.consultarSunat(v.id).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.procesandoSunat.set(false);
        this.toast.info(`SUNAT: ${this.etiquetaSunat(actualizada.sunat.estado).texto}.`);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.procesandoSunat.set(false);
      }
    });
  }

  protected reenviarSunat(v: Venta): void {
    this.procesandoSunat.set(true);
    this.api.ventas.reenviarSunat(v.id).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.procesandoSunat.set(false);
        const e = actualizada.sunat.estado;
        if (e === 'ACEPTADO' || e === 'PENDIENTE') {
          this.toast.exito(`Comprobante reenviado · SUNAT: ${this.etiquetaSunat(e).texto.toLowerCase()}.`);
        } else {
          this.toast.error(`SUNAT: ${actualizada.sunat.mensaje}`);
        }
        if (e === 'PENDIENTE') this.seguirPendiente(actualizada.id, 1);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.procesandoSunat.set(false);
      }
    });
  }

  /* El proveedor responde PENDIENTE y valida en segundos: se vuelve a consultar unas veces */
  private seguirPendiente(id: number, intento: number): void {
    if (intento > 4) return;
    setTimeout(() => {
      this.api.ventas.consultarSunat(id).subscribe({
        next: (v) => {
          this.reemplazar(v);
          if (v.sunat.estado === 'PENDIENTE') this.seguirPendiente(id, intento + 1);
        }
      });
    }, 2500 * intento);
  }

  private reemplazar(v: Venta): void {
    this.ventas.update((lista) => lista.map((x) => (x.id === v.id ? v : x)));
    if (this.detalleSunat()?.id === v.id) this.detalleSunat.set(v);
  }
}
