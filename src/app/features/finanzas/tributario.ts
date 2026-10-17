import { DatePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Subject, catchError, debounceTime, forkJoin, of, switchMap } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { Compra, ConfiguracionTributaria, ResumenTributario, Simulacion, Venta } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader } from '../../shared/bloques';
import { Contador } from '../../shared/contador';
import { soles } from '../../shared/formato';
import { GraficoBarras, PuntoBarras, SerieBarras } from '../../shared/grafico-barras';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-tributario',
  imports: [DatePipe, TitleCasePipe, PageHeader, Icon, Contador, GraficoBarras],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tributario.html',
  styleUrl: './tributario.scss'
})
export class Tributario {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly puedeConfigurar = inject(AuthService).puede('tributario.configurar');
  protected readonly soles = soles;

  protected readonly periodo = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected readonly resumen = signal<ResumenTributario | null>(null);
  protected readonly cargandoResumen = signal(true);

  private readonly ventas = signal<Venta[]>([]);
  private readonly compras = signal<Compra[]>([]);

  protected readonly configuracion = signal<ConfiguracionTributaria[]>([]);
  protected readonly editandoTasa = signal(false);
  protected readonly guardandoTasa = signal(false);

  protected readonly montoSimulado = signal(1000);
  protected readonly incluyeIgv = signal(false);
  protected readonly simulacion = signal<Simulacion | null>(null);
  private readonly simular$ = new Subject<void>();

  protected readonly esMesActual = computed(() => {
    const hoy = new Date();
    return this.periodo().getFullYear() === hoy.getFullYear() && this.periodo().getMonth() === hoy.getMonth();
  });

  protected readonly tasaIgv = computed(() => this.configuracion().find((c) => c.codigo === 'IGV')?.tasa ?? null);

  /* Débito vs crédito fiscal de los 6 meses que terminan en el periodo elegido */
  protected readonly historial = computed<PuntoBarras[]>(() => {
    const fin = this.periodo();
    return Array.from({ length: 6 }, (_, i) => {
      const fecha = new Date(fin.getFullYear(), fin.getMonth() - (5 - i), 1);
      const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      const debito = this.ventas().filter((v) => v.estado === 'EMITIDA' && v.fecha.startsWith(clave)).reduce((s, v) => s + v.igv, 0);
      const credito = this.compras().filter((c) => c.fecha.startsWith(clave)).reduce((s, c) => s + c.igv, 0);
      return { etiqueta: fecha.toLocaleDateString('es-PE', { month: 'short' }).replace('.', ''), valores: [debito, credito] };
    });
  });
  protected readonly seriesHistorial: SerieBarras[] = [
    { nombre: 'Débito fiscal', color: 'var(--chart-1)' },
    { nombre: 'Crédito fiscal', color: 'var(--chart-3)' }
  ];

  protected readonly balanza = computed(() => {
    const r = this.resumen();
    const mayor = Math.max(r?.igvVentas ?? 0, r?.igvCompras ?? 0) || 1;
    return { debito: ((r?.igvVentas ?? 0) / mayor) * 100, credito: ((r?.igvCompras ?? 0) / mayor) * 100 };
  });

  constructor() {
    const sub = this.simular$
      .pipe(
        debounceTime(300),
        switchMap(() =>
          this.montoSimulado() > 0
            ? this.api.tributario.calcular(this.montoSimulado(), this.incluyeIgv()).pipe(catchError(() => of(null)))
            : of(null)
        )
      )
      .subscribe((s) => this.simulacion.set(s));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());

    // Arranca en el último mes con movimientos para que la vista no salga vacía
    forkJoin({
      ventas: this.api.ventas.listar().pipe(catchError(() => of([] as Venta[]))),
      compras: this.api.compras.listar().pipe(catchError(() => of([] as Compra[]))),
      configuracion: this.api.tributario.configuracion().pipe(catchError(() => of([] as ConfiguracionTributaria[])))
    }).subscribe(({ ventas, compras, configuracion }) => {
      this.ventas.set(ventas);
      this.compras.set(compras);
      this.configuracion.set(configuracion);
      const ultima = [...ventas.map((v) => v.fecha), ...compras.map((c) => c.fecha)].sort().at(-1);
      if (ultima) {
        const [a, m] = ultima.split('-').map(Number);
        this.periodo.set(new Date(a, m - 1, 1));
      }
      this.cargarResumen();
    });
    this.simular$.next();
  }

  protected moverMes(delta: number): void {
    const p = this.periodo();
    this.periodo.set(new Date(p.getFullYear(), p.getMonth() + delta, 1));
    this.cargarResumen();
  }

  private cargarResumen(): void {
    this.cargandoResumen.set(true);
    const p = this.periodo();
    this.api.tributario.resumenMensual(p.getFullYear(), p.getMonth() + 1).subscribe({
      next: (r) => {
        this.resumen.set(r);
        this.cargandoResumen.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargandoResumen.set(false);
      }
    });
  }

  protected cambiarMonto(valor: string): void {
    this.montoSimulado.set(Number(valor) || 0);
    this.simular$.next();
  }

  protected alternarIncluyeIgv(): void {
    this.incluyeIgv.update((v) => !v);
    this.simular$.next();
  }

  protected guardarTasa(porcentaje: string): void {
    const tasa = Math.round((Number(porcentaje) / 100) * 10000) / 10000;
    if (!(tasa >= 0 && tasa <= 1)) {
      this.toast.error('La tasa debe estar entre 0 % y 100 %.');
      return;
    }
    this.guardandoTasa.set(true);
    this.api.tributario.actualizarTasa('IGV', tasa).subscribe({
      next: (c) => {
        this.configuracion.update((lista) => lista.map((x) => (x.codigo === c.codigo ? c : x)));
        this.toast.exito(`Tasa de IGV actualizada a ${(c.tasa * 100).toFixed(2)} %. Aplica a los nuevos comprobantes.`);
        this.editandoTasa.set(false);
        this.guardandoTasa.set(false);
        this.simular$.next();
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardandoTasa.set(false);
      }
    });
  }
}
