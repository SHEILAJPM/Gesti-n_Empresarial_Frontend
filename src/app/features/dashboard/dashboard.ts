import { DatePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { NOMBRES_ROL, Permiso } from '../../core/auth/permisos';
import {
  Cliente, Compra, Documento, Marcacion, Pago, Proveedor, ResumenTributario, Trabajador, Venta
} from '../../core/models';
import { Contador } from '../../shared/contador';
import { colorAvatar, diasHasta, hoyIso, iniciales, soles } from '../../shared/formato';
import { GraficoBarras, PuntoBarras, SerieBarras } from '../../shared/grafico-barras';
import { GraficoDona, SegmentoDona } from '../../shared/grafico-dona';
import { Icon, NombreIcono } from '../../shared/icon';
import { StatCard, Tono } from '../../shared/stat-card';
import { Formato } from '../../shared/formato';

interface Datos {
  ventas: Venta[] | null;
  compras: Compra[] | null;
  trabajadores: Trabajador[] | null;
  marcaciones: Marcacion[] | null;
  pagos: Pago[] | null;
  documentos: Documento[] | null;
  clientes: Cliente[] | null;
  proveedores: Proveedor[] | null;
}

interface Kpi {
  titulo: string;
  valor: number;
  icono: NombreIcono;
  tono: Tono;
  formato: Formato;
  detalle: string;
  serie: number[];
}

const MESES = 6;

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, TitleCasePipe, StatCard, GraficoBarras, GraficoDona, Icon, Contador],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly soles = soles;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;

  protected readonly hoy = new Date();
  protected readonly cargando = signal(true);
  protected readonly datos = signal<Datos>({
    ventas: null, compras: null, trabajadores: null, marcaciones: null,
    pagos: null, documentos: null, clientes: null, proveedores: null
  });
  protected readonly resumenIgv = signal<ResumenTributario | null>(null);

  protected readonly saludo = computed(() => {
    const hora = this.hoy.getHours();
    return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  });
  protected readonly nombreRol = computed(() => {
    const rol = this.auth.rol();
    return rol ? NOMBRES_ROL[rol] : '';
  });

  /* Últimos 6 meses (incluido el actual) para gráficos y mini curvas */
  private readonly meses = computed(() =>
    Array.from({ length: MESES }, (_, i) => {
      const fecha = new Date(this.hoy.getFullYear(), this.hoy.getMonth() - (MESES - 1 - i), 1);
      return {
        clave: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`,
        etiqueta: fecha.toLocaleDateString('es-PE', { month: 'short' }).replace('.', '')
      };
    })
  );

  private readonly ventasEmitidas = computed(() => (this.datos().ventas ?? []).filter((v) => v.estado === 'EMITIDA'));

  private readonly ventasPorMes = computed(() => this.sumarPorMes(this.ventasEmitidas()));
  private readonly comprasPorMes = computed(() => this.sumarPorMes(this.datos().compras ?? []));

  protected readonly barras = computed<PuntoBarras[]>(() =>
    this.meses().map((m, i) => ({ etiqueta: m.etiqueta, valores: [this.ventasPorMes()[i], this.comprasPorMes()[i]] }))
  );
  protected readonly seriesBarras: SerieBarras[] = [
    { nombre: 'Ventas', color: 'var(--chart-1)' },
    { nombre: 'Compras', color: 'var(--chart-2)' }
  ];

  protected readonly comprobantes = computed<SegmentoDona[]>(() => {
    const ventas = this.ventasEmitidas();
    return [
      { etiqueta: 'Facturas', valor: ventas.filter((v) => v.tipoComprobante === 'FACTURA').length, color: 'var(--chart-1)' },
      { etiqueta: 'Boletas', valor: ventas.filter((v) => v.tipoComprobante === 'BOLETA').length, color: 'var(--chart-3)' },
      { etiqueta: 'Anuladas', valor: (this.datos().ventas ?? []).filter((v) => v.estado === 'ANULADA').length, color: 'var(--chart-2)' }
    ];
  });

  protected readonly personalPorArea = computed<SegmentoDona[]>(() => {
    const colores = ['var(--chart-1)', 'var(--chart-3)', 'var(--info)', 'var(--chart-2)', 'var(--danger)'];
    const conteo = new Map<string, number>();
    for (const t of this.datos().trabajadores ?? []) {
      const area = t.area?.trim() || 'Sin área';
      conteo.set(area, (conteo.get(area) ?? 0) + 1);
    }
    return [...conteo.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([etiqueta, valor], i) => ({ etiqueta, valor, color: colores[i] }));
  });

  protected readonly ultimasVentas = computed(() =>
    [...(this.datos().ventas ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id).slice(0, 5)
  );

  protected readonly pagosPendientes = computed(() =>
    (this.datos().pagos ?? [])
      .filter((p) => p.estado === 'PENDIENTE')
      .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada))
  );

  protected readonly documentosPorVencer = computed(() =>
    [...(this.datos().documentos ?? [])]
      .map((d) => ({ ...d, dias: diasHasta(d.fechaVencimiento), diasAtraso: Math.abs(diasHasta(d.fechaVencimiento)) }))
      .filter((d) => d.dias <= 30)
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 6)
  );

  protected readonly marcacionesHoy = computed(() => {
    const hoy = hoyIso();
    return (this.datos().marcaciones ?? [])
      .filter((m) => m.fechaHora.startsWith(hoy))
      .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
  });

  protected readonly nombreTrabajador = computed(() => {
    const mapa = new Map((this.datos().trabajadores ?? []).map((t) => [t.id, t.nombres]));
    return (id: number | null) => (id !== null && mapa.get(id)) || `Trabajador #${id}`;
  });

  protected readonly kpis = computed<Kpi[]>(() => {
    const d = this.datos();
    const ventas = this.ventasEmitidas();
    const pendientes = this.pagosPendientes();
    const hoy = this.marcacionesHoy();
    const docs = d.documentos ?? [];
    const pagosVencidos = pendientes.filter((p) => diasHasta(p.fechaProgramada) < 0).length;
    const igvNeto = ventas.reduce((s, v) => s + v.igv, 0) - (d.compras ?? []).reduce((s, c) => s + c.igv, 0);

    const disponibles: Record<string, Kpi | null> = {
      ventas: d.ventas && { titulo: 'Ventas emitidas', valor: ventas.reduce((s, v) => s + v.montoTotal, 0), icono: 'recibo',
        tono: 'brand', formato: 'soles', detalle: `${ventas.length} comprobantes`, serie: this.ventasPorMes() },
      compras: d.compras && { titulo: 'Compras registradas', valor: d.compras.reduce((s, c) => s + c.montoTotal, 0),
        icono: 'carrito', tono: 'info', formato: 'soles', detalle: `${d.compras.length} facturas de proveedores`,
        serie: this.comprasPorMes() },
      igv: d.ventas && d.compras && { titulo: igvNeto >= 0 ? 'IGV neto acumulado' : 'Saldo a favor (IGV)',
        valor: Math.abs(igvNeto), icono: 'porcentaje', tono: igvNeto >= 0 ? 'alerta' : 'exito', formato: 'soles',
        detalle: 'débito − crédito fiscal', serie: [] },
      pagos: d.pagos && { titulo: 'Pagos pendientes', valor: pendientes.reduce((s, p) => s + p.monto, 0),
        icono: 'billetera', tono: pagosVencidos ? 'peligro' : 'alerta', formato: 'soles',
        detalle: `${pendientes.length} por pagar${pagosVencidos ? ` · ${pagosVencidos} vencidos` : ''}`, serie: [] },
      trabajadores: d.trabajadores && { titulo: 'Trabajadores activos',
        valor: d.trabajadores.filter((t) => t.estado?.toUpperCase() === 'ACTIVO').length, icono: 'usuarios',
        tono: 'brand', formato: 'entero', detalle: `de ${d.trabajadores.length} registrados`, serie: [] },
      marcaciones: d.marcaciones && { titulo: 'Marcaciones de hoy', valor: hoy.length, icono: 'reloj', tono: 'info',
        formato: 'entero', serie: [],
        detalle: `${hoy.filter((m) => m.tipo === 'ENTRADA').length} entradas · ${hoy.filter((m) => m.tipo === 'SALIDA').length} salidas` },
      docsPorVencer: d.documentos && { titulo: 'Documentos por vencer', icono: 'documento', tono: 'alerta',
        valor: docs.filter((x) => { const dias = diasHasta(x.fechaVencimiento); return dias >= 0 && dias <= 30; }).length,
        formato: 'entero', detalle: 'en los próximos 30 días', serie: [] },
      docsVencidos: d.documentos && { titulo: 'Documentos vencidos', icono: 'alerta', tono: 'peligro',
        valor: docs.filter((x) => diasHasta(x.fechaVencimiento) < 0).length, formato: 'entero',
        detalle: 'requieren renovación', serie: [] },
      clientes: d.clientes && { titulo: 'Clientes', valor: d.clientes.length, icono: 'cliente', tono: 'info',
        formato: 'entero', detalle: `${d.clientes.filter((c) => c.tipoDocumento === 'RUC').length} empresas con RUC`, serie: [] },
      proveedores: d.proveedores && { titulo: 'Proveedores', valor: d.proveedores.length, icono: 'camion', tono: 'brand',
        formato: 'entero', detalle: 'registrados con RUC', serie: [] }
    };

    // Los 4 indicadores más útiles para cada rol
    const prioridad: Record<string, string[]> = {
      ADMIN: ['ventas', 'compras', 'pagos', 'trabajadores'],
      RRHH: ['trabajadores', 'marcaciones', 'docsPorVencer', 'docsVencidos'],
      CONTABILIDAD: ['ventas', 'compras', 'igv', 'pagos'],
      ADMINISTRACION: ['ventas', 'compras', 'clientes', 'proveedores']
    };
    return (prioridad[this.auth.rol() ?? ''] ?? Object.keys(disponibles))
      .map((clave) => disponibles[clave])
      .filter((k): k is Kpi => !!k)
      .slice(0, 4);
  });

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    const si = <T>(permiso: Permiso, fuente: () => Observable<T>): Observable<T | null> =>
      this.auth.puede(permiso) ? fuente().pipe(catchError(() => of(null))) : of(null);

    forkJoin({
      ventas: si('ventas.ver', () => this.api.ventas.listar()),
      compras: si('compras.ver', () => this.api.compras.listar()),
      trabajadores: si('personal.listar', () => this.api.personal.listar()),
      marcaciones: si('asistencia.ver', () => this.api.asistencia.listar()),
      pagos: si('pagos.ver', () => this.api.pagos.listar()),
      documentos: si('documentos.ver', () => this.api.documentos.listar()),
      clientes: si('clientes.ver', () => this.api.clientes.listar()),
      proveedores: si('proveedores.ver', () => this.api.proveedores.listar())
    }).subscribe((datos) => {
      this.datos.set(datos);
      this.cargando.set(false);
      this.cargarIgv(datos);
    });
  }

  /* Liquidación del mes más reciente con movimientos (o el mes actual si no hay ninguno) */
  private cargarIgv(datos: Datos): void {
    if (!this.auth.puede('tributario.ver')) {
      return;
    }
    const fechas = [...(datos.ventas ?? []).map((v) => v.fecha), ...(datos.compras ?? []).map((c) => c.fecha)].sort();
    const ultima = fechas.at(-1) ?? hoyIso();
    const [anio, mes] = ultima.split('-').map(Number);
    this.api.tributario.resumenMensual(anio, mes).pipe(catchError(() => of(null))).subscribe((r) => this.resumenIgv.set(r));
  }

  protected readonly puedeVer = (permiso: Permiso) => this.auth.puede(permiso);
  protected readonly vencido = (fecha: string) => diasHasta(fecha) < 0;

  protected proporcionIgv(r: ResumenTributario): number {
    return r.igvVentas ? Math.min(100, (r.igvCompras / r.igvVentas) * 100) : 0;
  }

  private sumarPorMes(filas: { fecha: string; montoTotal: number }[]): number[] {
    const claves = this.meses().map((m) => m.clave);
    const totales = claves.map(() => 0);
    for (const f of filas) {
      const i = claves.indexOf(f.fecha.slice(0, 7));
      if (i >= 0) {
        totales[i] += f.montoTotal;
      }
    }
    return totales;
  }
}
