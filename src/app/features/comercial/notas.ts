import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { TASA_IGV_REFERENCIAL } from '../../core/config/constantes';
import { EstadoFacturacion, EstadoSunat, MotivosNota, Nota, TipoNota, Venta } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

interface LineaNota {
  clave: number;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  valorUnitario: number;
}

/* Motivos que revierten todo el comprobante: las líneas se copian de la venta y no se editan */
const MOTIVOS_TOTALES = ['01', '02', '06'];
let clave = 1;

/* Notas de crédito (devoluciones, descuentos, anulaciones) y de débito (intereses, aumentos) sobre facturas y boletas */
@Component({
  selector: 'app-notas',
  imports: [DatePipe, RouterLink, PageHeader, StatCard, Icon, Panel, Paginador, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notas.html',
  styleUrl: './notas.scss'
})
export class Notas {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly puedeEmitir = inject(AuthService).puede('notas.emitir');
  protected readonly soles = soles;

  /* ?venta=ID abre el formulario de nota para esa venta (botón «Nota» en Ventas) */
  readonly venta = input<string>();

  protected readonly cargando = signal(true);
  protected readonly notas = signal<Nota[]>([]);
  protected readonly motivos = signal<MotivosNota>({ CREDITO: {}, DEBITO: {} });
  protected readonly facturacion = signal<EstadoFacturacion | null>(null);
  protected readonly filtroTipo = signal('');
  protected readonly unidades = signal<Partial<Record<string, string>>>({});

  protected readonly tabla = new TablaEstado(this.notas, (n) => `${n.numero} ${n.numeroAfectado} ${n.nombreCliente} ${n.motivo}`, 10,
    computed(() => {
      const tipo = this.filtroTipo();
      return (n: Nota) => !tipo || n.tipo === tipo;
    }));
  protected readonly totalCredito = computed(() => this.notas().filter((n) => n.tipo === 'CREDITO').reduce((s, n) => s + n.montoTotal, 0));
  protected readonly totalDebito = computed(() => this.notas().filter((n) => n.tipo === 'DEBITO').reduce((s, n) => s + n.montoTotal, 0));

  // ---------- Emisión ----------
  protected readonly ventaAfectada = signal<Venta | null>(null);
  protected readonly notasDeLaVenta = signal<Nota[]>([]);
  protected readonly tipo = signal<TipoNota>('CREDITO');
  protected readonly motivo = signal('07');
  protected readonly sustento = signal('');
  protected readonly lineas = signal<LineaNota[]>([]);
  protected readonly emitiendo = signal(false);

  protected readonly listaMotivos = computed(() => Object.entries(this.motivos()[this.tipo()] ?? {}).map(([codigo, texto]) => ({ codigo, texto })));
  protected readonly esTotal = computed(() => this.tipo() === 'CREDITO' && MOTIVOS_TOTALES.includes(this.motivo()));
  protected readonly saldo = computed(() => {
    const v = this.ventaAfectada();
    if (!v) return 0;
    return redondear(this.notasDeLaVenta().reduce((s, n) => s + (n.tipo === 'DEBITO' ? n.montoTotal : -n.montoTotal), v.montoTotal));
  });
  protected readonly vistaPrevia = computed(() => {
    const v = this.ventaAfectada();
    if (this.esTotal() && v) return { base: v.montoSinIgv, igv: v.igv, total: v.montoTotal };
    const base = redondear(this.lineas().reduce((s, l) => s + importe(l), 0));
    const igv = redondear(base * TASA_IGV_REFERENCIAL);
    return { base, igv, total: redondear(base + igv) };
  });
  protected readonly problemas = computed(() => {
    const p: string[] = [];
    if (!this.sustento().trim()) p.push('Escribe el sustento: por qué se emite la nota.');
    if (this.esTotal() && this.notasDeLaVenta().length) p.push('Este comprobante ya tiene notas: usa «Devolución por ítem» o «Disminución en el valor» por el saldo.');
    if (!this.esTotal()) {
      if (!this.lineas().length) p.push('Agrega al menos una línea.');
      if (this.lineas().some((l) => !l.descripcion.trim() || !(l.cantidad > 0))) p.push('Cada línea necesita descripción y cantidad.');
    }
    if (this.vistaPrevia().total <= 0) p.push('El importe debe ser mayor a cero.');
    if (this.tipo() === 'CREDITO' && this.vistaPrevia().total > this.saldo() + 0.001) {
      p.push(`La nota de crédito no puede superar el saldo del comprobante (${soles(this.saldo())}).`);
    }
    return p;
  });
  protected readonly importe = importe;

  // ---------- Vista / impresión ----------
  protected readonly vista = signal<Nota | null>(null);
  protected readonly cargandoVista = signal(false);

  constructor() {
    forkJoin({
      notas: this.api.notas.listar(),
      motivos: this.api.notas.motivos(),
      facturacion: this.api.facturacion.estado().pipe(catchError(() => of(null))),
      unidades: this.api.productos.unidades().pipe(catchError(() => of({} as Partial<Record<string, string>>)))
    }).subscribe({
      next: ({ notas, motivos, facturacion, unidades }) => {
        this.unidades.set(unidades);
        this.notas.set(notas);
        this.motivos.set(motivos);
        this.facturacion.set(facturacion);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
    effect(() => {
      const id = Number(this.venta());
      if (id && this.puedeEmitir) untracked(() => this.abrir(id));
    });
  }

  protected abrir(ventaId: number): void {
    forkJoin({ venta: this.api.ventas.obtener(ventaId), notas: this.api.notas.listar(ventaId) }).subscribe({
      next: ({ venta, notas }) => {
        if (venta.sunat.estado !== 'ACEPTADO') {
          this.toast.error(`${venta.numeroComprobante} aún no está aceptado por SUNAT: no se le puede emitir una nota.`);
          return;
        }
        this.ventaAfectada.set(venta);
        this.notasDeLaVenta.set(notas);
        this.sustento.set('');
        this.cambiarTipo('CREDITO');
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected cerrar(): void {
    this.ventaAfectada.set(null);
    // Quita ?venta= para que recargar la página no vuelva a abrir el formulario
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected cambiarTipo(tipo: TipoNota): void {
    this.tipo.set(tipo);
    this.cambiarMotivo(tipo === 'CREDITO' ? (this.notasDeLaVenta().length ? '07' : '01') : '01');
  }

  /* Al cambiar el motivo se proponen líneas: las de la venta para devoluciones/descuentos, una libre para débitos */
  protected cambiarMotivo(codigo: string): void {
    this.motivo.set(codigo);
    const v = this.ventaAfectada();
    if (this.tipo() === 'DEBITO') {
      const texto = this.motivos().DEBITO[codigo] ?? 'Cargo adicional';
      this.lineas.set([{ clave: clave++, codigo: null, descripcion: texto, unidad: 'ZZ', cantidad: 1, valorUnitario: 0 }]);
    } else if (['04', '09'].includes(codigo)) {
      const texto = this.motivos().CREDITO[codigo] ?? 'Descuento';
      this.lineas.set([{ clave: clave++, codigo: null, descripcion: texto, unidad: 'ZZ', cantidad: 1, valorUnitario: 0 }]);
    } else if (v) {
      const items = v.items.length ? v.items : [{ codigo: null, descripcion: 'Venta de bienes y/o servicios', unidad: 'ZZ', cantidad: 1, valorUnitario: v.montoSinIgv }];
      this.lineas.set(items.map((i) => ({ clave: clave++, codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad, valorUnitario: i.valorUnitario })));
    }
  }

  protected cambiarLinea(c: number, cambios: Partial<LineaNota>): void {
    this.lineas.update((l) => l.map((x) => (x.clave === c ? { ...x, ...cambios } : x)));
  }

  protected quitarLinea(c: number): void {
    this.lineas.update((l) => l.filter((x) => x.clave !== c));
  }

  protected emitir(): void {
    const v = this.ventaAfectada();
    const problema = this.problemas()[0];
    if (!v || problema) {
      if (problema) this.toast.error(problema);
      return;
    }
    this.emitiendo.set(true);
    this.api.notas.emitir({
      ventaId: v.id,
      tipo: this.tipo(),
      motivoCodigo: this.motivo(),
      sustento: this.sustento().trim(),
      items: this.esTotal() ? undefined : this.lineas().map((l) => ({
        productoId: null, codigo: l.codigo, descripcion: l.descripcion.trim(), unidad: l.unidad,
        cantidad: Number(l.cantidad), valorUnitario: Number(l.valorUnitario)
      }))
    }).subscribe({
      next: (nota) => {
        this.notas.update((l) => [nota, ...l]);
        const nombre = nota.tipo === 'CREDITO' ? 'Nota de crédito' : 'Nota de débito';
        if (['RECHAZADO', 'ERROR', 'EXCEPCION'].includes(nota.sunat.estado)) {
          this.toast.error(`${nombre} ${nota.numero} registrada, pero SUNAT: ${nota.sunat.mensaje}`);
        } else {
          this.toast.exito(`${nombre} ${nota.numero} por ${soles(nota.montoTotal)} · SUNAT: ${this.etiquetaSunat(nota.sunat.estado).texto.toLowerCase()}.`);
        }
        this.emitiendo.set(false);
        this.cerrar();
        this.ver(nota);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.emitiendo.set(false);
      }
    });
  }

  protected ver(n: Nota): void {
    this.vista.set(n);
    this.cargandoVista.set(true);
    this.api.notas.obtener(n.id).subscribe({
      next: (completa) => {
        this.vista.set(completa);
        this.notas.update((l) => l.map((x) => (x.id === completa.id ? { ...x, sunat: completa.sunat } : x)));
        this.cargandoVista.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargandoVista.set(false);
      }
    });
  }

  protected reenviar(n: Nota): void {
    this.api.notas.reenviarSunat(n.id).subscribe({
      next: (r) => {
        this.vista.set(r);
        this.notas.update((l) => l.map((x) => (x.id === r.id ? { ...x, sunat: r.sunat } : x)));
        this.toast.info(`SUNAT: ${this.etiquetaSunat(r.sunat.estado).texto}.`);
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected imprimir(): void {
    const raiz = document.documentElement;
    raiz.classList.add('imprimiendo-comprobante');
    const quitar = () => raiz.classList.remove('imprimiendo-comprobante');
    window.addEventListener('afterprint', quitar, { once: true });
    window.print();
    setTimeout(quitar, 1000);
  }

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
}

function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function importe(l: LineaNota): number {
  return redondear((Number(l.cantidad) || 0) * (Number(l.valorUnitario) || 0));
}
