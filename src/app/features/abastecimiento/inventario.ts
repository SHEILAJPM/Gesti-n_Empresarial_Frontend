import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import {
  CompraParaIngreso, EstadoStock, Kardex, MotivoMovimiento, MotivosInventario, OperacionInventario, ProductoStock
} from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

type Filtro = 'todos' | 'bajo' | 'sin';

interface LineaMovimiento {
  clave: number;
  productoId: number | null;
  cantidad: number | null;
}

const CANTIDAD = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 });
let siguienteClave = 1;

/* Inventario: stock de cada producto, su kárdex y los movimientos que registra Almacén.
   Las ventas descuentan solas y las notas de crédito por devolución lo regresan. */
@Component({
  selector: 'app-inventario',
  imports: [DatePipe, PageHeader, StatCard, Icon, Panel, Paginador, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inventario.html',
  styleUrl: './inventario.scss'
})
export class Inventario {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly puedeMover = inject(AuthService).puede('inventario.mover');

  protected readonly cargando = signal(true);
  protected readonly productos = signal<ProductoStock[]>([]);
  protected readonly unidades = signal<Partial<Record<string, string>>>({});
  protected readonly motivos = signal<MotivosInventario>({ entrada: {}, salida: {} });
  protected readonly compras = signal<CompraParaIngreso[]>([]);
  protected readonly filtro = signal<Filtro>('todos');

  // Los desactivados solo se muestran mientras les quede stock
  private readonly controlados = computed(() => this.productos().filter((p) => p.activo || p.stock > 0));
  protected readonly conStock = computed(() => this.controlados().filter((p) => p.stock > 0).length);
  protected readonly bajos = computed(() => this.controlados().filter((p) => p.estado === 'BAJO').length);
  protected readonly sinStock = computed(() => this.controlados().filter((p) => p.estado === 'SIN_STOCK').length);
  private readonly porId = computed(() => new Map(this.productos().map((p) => [p.id, p])));

  protected readonly tabla = new TablaEstado(this.controlados, (p) => `${p.codigo} ${p.descripcion}`, 12,
    computed(() => {
      const f = this.filtro();
      return (p: ProductoStock) => f === 'todos' || (f === 'bajo' ? p.estado === 'BAJO' : p.estado === 'SIN_STOCK');
    }));

  // ---------- Kárdex ----------
  protected readonly kardex = signal<Kardex | null>(null);
  protected readonly cargandoKardex = signal(false);

  // ---------- Registro de movimientos ----------
  protected readonly panelMovimiento = signal(false);
  protected readonly operacion = signal<OperacionInventario>('ENTRADA');
  protected readonly motivo = signal<MotivoMovimiento | null>(null);
  protected readonly compraId = signal<number | null>(null);
  protected readonly referencia = signal('');
  protected readonly observacion = signal('');
  protected readonly lineas = signal<LineaMovimiento[]>([]);
  protected readonly guardando = signal(false);
  private comprasCargadas = false;
  private kardexAlTerminar: number | null = null;

  protected readonly listaMotivos = computed(() => {
    const lista = this.operacion() === 'SALIDA' ? this.motivos().salida : this.motivos().entrada;
    return Object.entries(lista).map(([codigo, texto]) => ({ codigo: codigo as MotivoMovimiento, texto: texto ?? codigo }));
  });
  // Solo se ingresa stock a productos activos; se puede sacar o contar lo que quede de uno desactivado
  protected readonly opcionesProducto = computed(() => {
    const entrada = this.operacion() === 'ENTRADA';
    return this.productos().filter((p) => (entrada ? p.activo : p.activo || p.stock > 0));
  });
  protected readonly compraElegida = computed(() => this.compras().find((c) => c.id === this.compraId()) ?? null);

  protected readonly problemas = computed(() => {
    const lista: string[] = [];
    const op = this.operacion();
    const lineas = this.lineas();
    if (op !== 'AJUSTE' && !this.motivo()) lista.push('Elige el motivo.');
    if (!lineas.length) lista.push('Agrega al menos un producto.');
    if (lineas.some((l) => !l.productoId)) lista.push('Elige el producto de cada línea.');
    const ids = lineas.filter((l) => l.productoId).map((l) => l.productoId);
    if (new Set(ids).size !== ids.length) lista.push('Un producto aparece en dos líneas: júntalas en una sola.');
    const valida = (c: number | null) => c !== null && !isNaN(c) && (op === 'AJUSTE' ? c >= 0 : c > 0);
    if (lineas.some((l) => !valida(l.cantidad))) {
      lista.push(op === 'AJUSTE' ? 'Escribe el conteo de cada producto (0 si no hay).' : 'Las cantidades deben ser mayores a cero.');
    }
    if (op === 'SALIDA') {
      for (const l of lineas) {
        const p = l.productoId ? this.porId().get(l.productoId) : undefined;
        if (p && (l.cantidad ?? 0) > p.stock) lista.push(`No hay stock suficiente de ${p.descripcion} (quedan ${this.cantidad(p.stock)}).`);
      }
    }
    if (op === 'ENTRADA' && this.motivo() === 'COMPRA' && !this.compraId() && !this.referencia().trim()) {
      lista.push('Elige la compra o escribe el número de guía o factura del proveedor.');
    }
    if (this.motivo() === 'OTRO' && op !== 'AJUSTE' && !this.observacion().trim()) lista.push('Explica el motivo en la observación.');
    return lista;
  });

  constructor() {
    this.cargar();
    forkJoin({
      unidades: this.api.productos.unidades().pipe(catchError(() => of({}))),
      motivos: this.api.inventario.motivos().pipe(catchError(() => of({ entrada: {}, salida: {} } as MotivosInventario)))
    }).subscribe(({ unidades, motivos }) => {
      this.unidades.set(unidades);
      this.motivos.set(motivos);
    });
  }

  protected cargar(): void {
    this.api.inventario.listar().subscribe({
      next: (lista) => {
        this.productos.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected cantidad(valor: number | null | undefined): string {
    return CANTIDAD.format(valor ?? 0);
  }

  protected nombreUnidad(codigo: string): string {
    return (this.unidades()[codigo] ?? codigo).toLowerCase();
  }

  protected etiqueta(e: EstadoStock): { texto: string; clase: string } {
    return e === 'SIN_STOCK' ? { texto: 'Sin stock', clase: 'badge-peligro' }
      : e === 'BAJO' ? { texto: 'Stock bajo', clase: 'badge-alerta' } : { texto: 'Disponible', clase: 'badge-exito' };
  }

  /* Barra de nivel: lleno al doble del mínimo; sin mínimo no se dibuja */
  protected nivel(p: ProductoStock): number {
    return p.stockMinimo > 0 ? Math.min(100, (p.stock / (p.stockMinimo * 2)) * 100) : 0;
  }

  // ---------- Kárdex ----------

  protected abrirKardex(id: number): void {
    this.cargandoKardex.set(true);
    this.kardex.set(null);
    this.api.inventario.kardex(id).subscribe({
      next: (k) => {
        this.kardex.set(k);
        this.cargandoKardex.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargandoKardex.set(false);
      }
    });
  }

  protected cerrarKardex(): void {
    this.kardex.set(null);
    this.cargandoKardex.set(false);
  }

  /* CSV con punto y coma y BOM: Excel en español lo abre con columnas y tildes correctas */
  protected descargarKardex(): void {
    const k = this.kardex();
    if (!k) return;
    const celda = (v: string | number) => {
      const texto = String(v);
      return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const numero = (v: number) => String(v).replace('.', ',');
    const filas = [
      ['Fecha', 'Movimiento', 'Referencia', 'Observación', 'Entrada', 'Salida', 'Saldo', 'Usuario'],
      ...[...k.movimientos].reverse().map((m) => [
        m.fecha.replace('T', ' ').slice(0, 16), m.motivoTexto, m.referencia ?? '', m.observacion ?? '',
        m.tipo === 'ENTRADA' ? numero(m.cantidad) : '', m.tipo === 'SALIDA' ? numero(m.cantidad) : '', numero(m.saldo),
        m.registradoPor ?? ''
      ])
    ];
    const contenido = '﻿' + filas.map((fila) => fila.map(celda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `kardex-${k.producto.codigo}.csv`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Movimientos ----------

  protected abrirMovimiento(op: OperacionInventario, producto?: ProductoStock): void {
    // Si se abre desde el kárdex, al terminar se vuelve a mostrar actualizado
    this.kardexAlTerminar = this.kardex()?.producto.id ?? null;
    this.cerrarKardex();
    this.operacion.set(op);
    this.motivo.set(this.motivoInicial(op));
    this.compraId.set(null);
    this.referencia.set('');
    this.observacion.set('');
    this.lineas.set([{ clave: siguienteClave++, productoId: producto?.id ?? null, cantidad: op === 'AJUSTE' ? producto?.stock ?? null : null }]);
    this.panelMovimiento.set(true);
    if (!this.comprasCargadas) {
      this.comprasCargadas = true;
      this.api.inventario.compras().pipe(catchError(() => of([] as CompraParaIngreso[]))).subscribe((c) => this.compras.set(c));
    }
  }

  protected cerrarMovimiento(): void {
    this.panelMovimiento.set(false);
    const volver = this.kardexAlTerminar;
    this.kardexAlTerminar = null;
    if (volver) this.abrirKardex(volver);
  }

  /* Sin movimientos todavía, lo primero es cargar el inventario inicial */
  private motivoInicial(op: OperacionInventario): MotivoMovimiento | null {
    if (op === 'AJUSTE') return null;
    if (op === 'SALIDA') return 'MERMA';
    return this.productos().some((p) => p.ultimoMovimiento) ? 'COMPRA' : 'SALDO_INICIAL';
  }

  protected cambiarOperacion(op: OperacionInventario): void {
    if (op === this.operacion()) return;
    this.operacion.set(op);
    this.motivo.set(this.motivoInicial(op));
    this.compraId.set(null);
    // En un conteo se parte del stock del sistema; en ingresos y salidas, de una cantidad vacía
    this.lineas.update((ls) => ls.map((l) => ({
      ...l,
      cantidad: op === 'AJUSTE' && l.productoId ? this.porId().get(l.productoId)?.stock ?? null : null
    })));
  }

  protected elegirMotivo(valor: string): void {
    this.motivo.set((valor || null) as MotivoMovimiento | null);
    if (valor !== 'COMPRA') this.compraId.set(null);
  }

  protected elegirCompra(valor: string): void {
    this.compraId.set(valor ? Number(valor) : null);
  }

  protected agregarLinea(): void {
    this.lineas.update((ls) => [...ls, { clave: siguienteClave++, productoId: null, cantidad: null }]);
  }

  protected quitarLinea(clave: number): void {
    this.lineas.update((ls) => ls.filter((l) => l.clave !== clave));
  }

  protected elegirProducto(clave: number, valor: string): void {
    const id = valor ? Number(valor) : null;
    const p = id ? this.porId().get(id) : undefined;
    this.lineas.update((ls) => ls.map((l) => (l.clave === clave
      ? { ...l, productoId: id, cantidad: this.operacion() === 'AJUSTE' ? p?.stock ?? null : l.cantidad }
      : l)));
  }

  protected cambiarCantidad(clave: number, valor: string): void {
    const cantidad = valor === '' ? null : Number(valor);
    this.lineas.update((ls) => ls.map((l) => (l.clave === clave ? { ...l, cantidad } : l)));
  }

  /* Conteo general: una línea por producto activo, partiendo de lo que dice el sistema */
  protected contarTodo(): void {
    this.lineas.set(this.opcionesProducto().map((p) => ({ clave: siguienteClave++, productoId: p.id, cantidad: p.stock })));
  }

  protected producto(id: number | null): ProductoStock | undefined {
    return id ? this.porId().get(id) : undefined;
  }

  /* Cómo queda el stock con esta línea */
  protected resultado(l: LineaMovimiento): number | null {
    const p = this.producto(l.productoId);
    if (!p || l.cantidad === null || isNaN(l.cantidad)) return null;
    const op = this.operacion();
    return op === 'ENTRADA' ? p.stock + l.cantidad : op === 'SALIDA' ? p.stock - l.cantidad : l.cantidad;
  }

  protected diferencia(l: LineaMovimiento): number | null {
    const p = this.producto(l.productoId);
    return p && l.cantidad !== null && !isNaN(l.cantidad) ? l.cantidad - p.stock : null;
  }

  protected registrar(): void {
    if (this.problemas().length || this.guardando()) return;
    const op = this.operacion();
    const motivo = op === 'AJUSTE' ? null : this.motivo();
    const compraId = op === 'ENTRADA' && motivo === 'COMPRA' ? this.compraId() : null;
    this.guardando.set(true);
    this.api.inventario.registrar({
      operacion: op,
      motivo,
      compraId,
      referencia: this.referencia().trim() || null,
      observacion: this.observacion().trim() || null,
      lineas: this.lineas().map((l) => ({ productoId: l.productoId as number, cantidad: Number(l.cantidad) }))
    }).subscribe({
      next: (hechos) => {
        const n = hechos.length;
        const plural = (texto: string) => `${n} ${texto}${n === 1 ? '' : 's'}`;
        this.toast.exito(op === 'ENTRADA' ? `Ingreso registrado: ${plural('producto')}.`
          : op === 'SALIDA' ? `Salida registrada: ${plural('producto')}.`
            : n ? `Ajuste registrado: ${plural('diferencia')} corregida${n === 1 ? '' : 's'}.`
              : 'El conteo coincide con el sistema: no hubo cambios.');
        if (compraId) this.compras.update((cs) => cs.map((c) => (c.id === compraId ? { ...c, ingresada: true } : c)));
        this.guardando.set(false);
        this.cargar();
        this.cerrarMovimiento();
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }
}
