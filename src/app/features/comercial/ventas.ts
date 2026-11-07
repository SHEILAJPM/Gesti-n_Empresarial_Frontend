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
import { Cliente, EstadoFacturacion, EstadoSunat, FormaPago, Producto, Venta } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { colorAvatar, hoyIso, iniciales, isoLocal, soles } from '../../shared/formato';
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
  protected readonly puedeNotas = this.auth.puede('notas.emitir');
  protected readonly puedeGuias = this.auth.puede('guias.emitir');
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
    fecha: [hoyIso(), Validators.required]
  });

  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly clienteElegido = computed(
    () => this.clientes().find((c) => c.documento === this.valores().documentoCliente) ?? null
  );
  protected readonly tipoComprobante = computed(() => (this.clienteElegido()?.tipoDocumento === 'RUC' ? 'FACTURA' : 'BOLETA'));

  // Detalle del comprobante
  protected readonly productos = signal<Producto[]>([]);
  protected readonly productosActivos = computed(() => this.productos().filter((p) => p.activo));
  protected readonly unidades = signal<Partial<Record<string, string>>>({ NIU: 'Unidad', ZZ: 'Servicio' });
  protected readonly listaUnidades = computed(() => Object.entries(this.unidades()).map(([codigo, nombre]) => ({ codigo, nombre })));
  protected readonly lineas = signal<LineaForm[]>([]);
  protected readonly observaciones = signal('');
  protected readonly formaPago = signal<FormaPago>('CONTADO');
  protected readonly cuotas = signal<CuotaForm[]>([]);
  protected readonly numeroCuotas = signal(2);

  /* Mismo cálculo que el backend: importe = cantidad × precio; IGV total sobre la suma */
  protected readonly vistaPrevia = computed(() => {
    const base = redondear(this.lineas().reduce((s, l) => s + importe(l), 0));
    const igv = redondear(base * TASA_IGV_REFERENCIAL);
    return { base, igv, total: redondear(base + igv) };
  });
  protected readonly sumaCuotas = computed(() => redondear(this.cuotas().reduce((s, c) => s + (Number(c.monto) || 0), 0)));
  protected readonly importe = importe;

  // Comprobante (vista e impresión)
  protected readonly comprobante = signal<Venta | null>(null);
  protected readonly cargandoComprobante = signal(false);

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
      facturacion: this.api.facturacion.estado().pipe(catchError(() => of(null))),
      productos: this.api.productos.listar().pipe(catchError(() => of([] as Producto[]))),
      unidades: this.api.productos.unidades().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ ventas, clientes, facturacion, productos, unidades }) => {
        this.facturacion.set(facturacion);
        this.productos.set(productos);
        if (unidades) this.unidades.set(unidades);
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
    this.form.reset({ documentoCliente: '', numeroComprobante: '', fecha: hoyIso() });
    this.lineas.set([nuevaLinea()]);
    this.observaciones.set('');
    this.formaPago.set('CONTADO');
    this.cuotas.set([]);
    this.panelAbierto.set(true);
  }

  // ---------- Líneas del detalle ----------
  protected agregarLinea(): void {
    this.lineas.update((l) => [...l, nuevaLinea()]);
  }

  protected quitarLinea(clave: number): void {
    this.lineas.update((l) => (l.length > 1 ? l.filter((x) => x.clave !== clave) : [nuevaLinea()]));
  }

  /* Producto con stock de la línea (no aplica a servicios ni a líneas escritas a mano) */
  protected conStock(l: LineaForm): Producto | null {
    const p = l.productoId ? this.productos().find((x) => x.id === l.productoId) : undefined;
    return p?.manejaStock ? p : null;
  }

  protected cantidadTexto(valor: number): string {
    return CANTIDAD.format(valor);
  }

  protected cambiarLinea(clave: number, cambios: Partial<LineaForm>): void {
    this.lineas.update((l) => l.map((x) => (x.clave === clave ? { ...x, ...cambios } : x)));
  }

  /* Elegir del catálogo llena descripción, unidad y precio; "a mano" deja la línea libre */
  protected elegirProducto(clave: number, id: string): void {
    const p = this.productos().find((x) => x.id === Number(id));
    this.cambiarLinea(clave, p
      ? { productoId: p.id, codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad, valorUnitario: p.valorUnitario }
      : { productoId: null, codigo: null });
  }

  // ---------- Forma de pago ----------
  protected cambiarFormaPago(forma: FormaPago): void {
    this.formaPago.set(forma);
    if (forma === 'CREDITO' && !this.cuotas().length) this.repartirCuotas();
  }

  /* Divide el total en N cuotas mensuales; la última absorbe los céntimos */
  protected repartirCuotas(): void {
    const n = Math.min(36, Math.max(1, this.numeroCuotas()));
    const total = this.vistaPrevia().total;
    const parte = Math.floor((total / n) * 100) / 100;
    const base = new Date(`${this.form.getRawValue().fecha}T12:00:00`);
    this.cuotas.set(Array.from({ length: n }, (_, i) => {
      const fecha = new Date(base);
      fecha.setMonth(fecha.getMonth() + i + 1);
      return { clave: i + 1, fechaVencimiento: isoLocal(fecha), monto: i === n - 1 ? redondear(total - parte * (n - 1)) : parte };
    }));
  }

  protected cambiarCuota(clave: number, cambios: Partial<CuotaForm>): void {
    this.cuotas.update((l) => l.map((x) => (x.clave === clave ? { ...x, ...cambios } : x)));
  }

  /* Problemas que impiden emitir; el backend vuelve a validar todo */
  protected readonly problemas = computed(() => {
    const lista: string[] = [];
    const lineas = this.lineas();
    if (lineas.some((l) => !l.descripcion.trim())) lista.push('Cada línea necesita una descripción.');
    if (lineas.some((l) => !(Number(l.cantidad) > 0))) lista.push('Las cantidades deben ser mayores a cero.');
    if (lineas.some((l) => !(Number(l.valorUnitario) >= 0))) lista.push('Revisa los precios.');
    // Mismo control que el backend: lo que se vende de cada producto no puede superar su stock
    const pedido = new Map<number, number>();
    for (const l of lineas) {
      if (l.productoId) pedido.set(l.productoId, (pedido.get(l.productoId) ?? 0) + (Number(l.cantidad) || 0));
    }
    for (const [id, cantidad] of pedido) {
      const p = this.productos().find((x) => x.id === id);
      if (p?.manejaStock && cantidad > p.stock) {
        lista.push(p.stock > 0 ? `Solo quedan ${CANTIDAD.format(p.stock)} de ${p.descripcion}.` : `${p.descripcion} no tiene stock.`);
      }
    }
    if (this.vistaPrevia().total <= 0) lista.push('El total debe ser mayor a cero.');
    if (this.formaPago() === 'CREDITO') {
      if (this.tipoComprobante() !== 'FACTURA') lista.push('Al crédito solo se emiten facturas (cliente con RUC).');
      if (!this.cuotas().length) lista.push('Agrega al menos una cuota.');
      else if (Math.abs(this.sumaCuotas() - this.vistaPrevia().total) > 0.001) {
        lista.push(`Las cuotas suman ${soles(this.sumaCuotas())} y deben sumar ${soles(this.vistaPrevia().total)}.`);
      }
    }
    return lista;
  });

  // ---------- Comprobante ----------
  protected verComprobante(v: Venta): void {
    this.cargandoComprobante.set(true);
    this.comprobante.set(v);
    this.api.ventas.obtener(v.id).subscribe({
      next: (completa) => {
        this.comprobante.set(completa);
        this.cargandoComprobante.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargandoComprobante.set(false);
      }
    });
  }

  /* Mientras se imprime solo se ve el comprobante (ver @media print en _base.scss) */
  protected imprimir(): void {
    const raiz = document.documentElement;
    raiz.classList.add('imprimiendo-comprobante');
    const quitar = () => raiz.classList.remove('imprimiendo-comprobante');
    window.addEventListener('afterprint', quitar, { once: true });
    window.print();
    setTimeout(quitar, 1000);
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
    const problema = this.problemas()[0];
    if (problema) {
      this.toast.error(problema);
      return;
    }
    const credito = this.formaPago() === 'CREDITO';
    this.guardando.set(true);
    this.api.ventas.registrar({
      ...datos,
      items: this.lineas().map((l) => ({
        productoId: l.productoId, codigo: l.codigo, descripcion: l.descripcion.trim(), unidad: l.unidad,
        cantidad: Number(l.cantidad), valorUnitario: Number(l.valorUnitario)
      })),
      formaPago: this.formaPago(),
      cuotas: credito ? this.cuotas().map((c) => ({ fechaVencimiento: c.fechaVencimiento, monto: Number(c.monto) })) : [],
      observaciones: this.observaciones().trim() || null
    }).subscribe({
      next: (venta) => {
        this.ventas.update((lista) => [venta, ...lista]);
        this.api.productos.listar().subscribe({ next: (productos) => this.productos.set(productos), error: () => undefined });
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
        const mensaje = mensajeDeError(e);
        // Otra persona usó ese número mientras se llenaba el formulario: se carga el siguiente libre para reintentar
        const libre = /siguiente número libre es ([FB]\d{3}-\d+)/.exec(mensaje)?.[1];
        if (libre) {
          this.form.controls.numeroComprobante.setValue(libre);
          this.toast.info(`Ese número ya se usó. Te dejamos el siguiente libre: ${libre}. Pulsa guardar otra vez.`);
        } else {
          this.toast.error(mensaje);
        }
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

interface LineaForm {
  clave: number;
  productoId: number | null;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  valorUnitario: number;
}

interface CuotaForm {
  clave: number;
  fechaVencimiento: string;
  monto: number;
}

let siguienteClave = 1;
const CANTIDAD = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 });

function nuevaLinea(): LineaForm {
  return { clave: siguienteClave++, productoId: null, codigo: null, descripcion: '', unidad: 'NIU', cantidad: 1, valorUnitario: 0 };
}

function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function importe(l: LineaForm): number {
  return redondear((Number(l.cantidad) || 0) * (Number(l.valorUnitario) || 0));
}
