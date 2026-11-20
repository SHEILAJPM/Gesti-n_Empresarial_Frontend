import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { RegistroBitacora } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { descargarCsv } from '../../shared/csv';
import { colorAvatar, hoyIso, iniciales } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { TablaEstado } from '../../shared/tabla';

interface FilaBitacora extends RegistroBitacora {
  accion: string;
  modulo: string;
  exito: boolean;
}

/* Traducción de "método + ruta" a lo que hizo la persona. La primera regla que coincide gana. */
const REGLAS: [RegExp, string, string][] = [
  [/^POST \/api\/auth\/login$/, 'Sesión', 'Inició sesión'],
  [/^PUT \/api\/auth\/clave$/, 'Sesión', 'Cambió su contraseña'],
  [/^POST \/api\/auth\/olvide-clave$/, 'Sesión', 'Pidió restablecer su contraseña'],
  [/^POST \/api\/ventas$/, 'Ventas', 'Emitió un comprobante'],
  [/^PATCH \/api\/ventas\/\d+\/anular$/, 'Ventas', 'Anuló un comprobante'],
  [/^POST \/api\/ventas\/\d+\/sunat\/reenviar$/, 'Ventas', 'Reenvió un comprobante a SUNAT'],
  [/^POST \/api\/notas$/, 'Notas', 'Emitió una nota de crédito/débito'],
  [/^POST \/api\/guias$/, 'Guías', 'Emitió una guía de remisión'],
  [/^POST \/api\/cobranzas$/, 'Cobranzas', 'Registró un cobro'],
  [/^POST \/api\/inventario\/movimientos$/, 'Inventario', 'Registró un movimiento de stock'],
  [/^POST \/api\/planillas\/generar$/, 'Planillas', 'Generó una planilla'],
  [/^PATCH \/api\/planillas\/\d+\/aprobar$/, 'Planillas', 'Aprobó una planilla'],
  [/^DELETE \/api\/planillas\/\d+$/, 'Planillas', 'Eliminó un borrador de planilla'],
  [/^PUT \/api\/pagos\/\d+\/pagar$/, 'Pagos', 'Marcó un pago como pagado'],
  [/^POST \/api\/mi\/asistencia$/, 'Asistencia', 'Marcó asistencia desde el portal'],
  [/^POST \/api\/asistencia/, 'Asistencia', 'Registró una marcación'],
  [/^PATCH \/api\/personal\/\d+\/cesar$/, 'Personal', 'Cesó a un trabajador'],
  [/^PATCH \/api\/personal\/\d+\/reactivar$/, 'Personal', 'Reactivó a un trabajador'],
  [/^PUT \/api\/usuarios\/\d+\/clave$/, 'Usuarios', 'Restableció una contraseña'],
  [/^PATCH \/api\/usuarios\/\d+\/estado$/, 'Usuarios', 'Activó o desactivó una cuenta'],
  [/^PATCH \/api\/usuarios\/\d+\/trabajador$/, 'Usuarios', 'Vinculó una cuenta a una ficha'],
  [/^PUT \/api\/tributario\/configuracion/, 'Tributario', 'Cambió la tasa de IGV'],
  [/^PUT \/api\/sede$/, 'Sede', 'Cambió la sede o el horario'],
  [/^PATCH \/api\/mi\/tareas\/\d+\/estado$/, 'Tareas', 'Avanzó una tarea propia'],
  [/^PATCH \/api\/tareas\/\d+\/cancelar$/, 'Tareas', 'Canceló una tarea'],
  [/^POST \/api\/mi\/ausencias$/, 'Ausencias', 'Pidió vacaciones o un permiso'],
  [/^PATCH \/api\/mi\/ausencias\/\d+\/retirar$/, 'Ausencias', 'Retiró su solicitud'],
  [/^PATCH \/api\/ausencias\/\d+\/resolver$/, 'Ausencias', 'Aprobó o rechazó una solicitud'],
  [/^PATCH \/api\/ausencias\/\d+\/anular$/, 'Ausencias', 'Anuló una ausencia']
];

const MODULOS: Record<string, string> = {
  personal: 'Personal', documentos: 'Documentos', clientes: 'Clientes', productos: 'Productos', proveedores: 'Proveedores',
  compras: 'Compras', pagos: 'Pagos', usuarios: 'Usuarios', tareas: 'Tareas', ausencias: 'Ausencias'
};
const VERBOS: Record<string, string> = { POST: 'Registró', PUT: 'Editó', PATCH: 'Cambió', DELETE: 'Eliminó' };

export function describir(metodo: string, ruta: string): { modulo: string; accion: string } {
  const clave = `${metodo} ${ruta}`;
  const regla = REGLAS.find(([patron]) => patron.test(clave));
  if (regla) return { modulo: regla[1], accion: regla[2] };
  const recurso = ruta.split('/')[2] ?? '';
  const modulo = MODULOS[recurso] ?? recurso;
  return { modulo, accion: `${VERBOS[metodo] ?? metodo} en ${modulo.toLowerCase()}` };
}

/* Quién hizo qué y cuándo: cada cambio hecho en el sistema y cada inicio de sesión */
@Component({
  selector: 'app-bitacora',
  imports: [DatePipe, PageHeader, Icon, Paginador, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila">
      <app-page-header seccion="Sistema" titulo="Bitácora"
        descripcion="Cada cambio hecho en el sistema y cada intento de inicio de sesión: quién, cuándo, qué y si se pudo.">
        <button type="button" class="btn" [disabled]="!tabla.filtradas().length" (click)="exportar()">
          <app-icon name="bajada" [size]="16" /> Exportar CSV
        </button>
      </app-page-header>

      <article class="card entrada">
        <div class="filtros" style="flex-wrap: wrap; gap: 10px">
          <label class="campo-en-linea">Desde <input type="date" class="control" [value]="desde()" (change)="desde.set($any($event.target).value)" /></label>
          <label class="campo-en-linea">Hasta <input type="date" class="control" [value]="hasta()" (change)="hasta.set($any($event.target).value)" /></label>
          <input class="control" style="max-width: 180px" placeholder="Usuario (exacto)" [value]="usuario()" (change)="usuario.set($any($event.target).value)" />
          <button type="button" class="btn btn-primario" (click)="cargar()"><app-icon name="buscar" [size]="16" /> Buscar</button>
          <label class="campo-en-linea"><input type="checkbox" [checked]="soloFallidos()" (change)="soloFallidos.set($any($event.target).checked)" /> Solo rechazados</label>
          <div class="control-icono busqueda" style="margin-left: auto">
            <app-icon name="buscar" [size]="16" />
            <input #b class="control" placeholder="Filtrar por acción o módulo…" [value]="tabla.busqueda()" (input)="tabla.buscar(b.value)" />
          </div>
        </div>

        @if (cargando()) {
          <div class="card-cuerpo pila">@for (i of [1, 2, 3, 4]; track i) { <div class="skeleton" style="height: 40px"></div> }</div>
        } @else if (tabla.filtradas().length) {
          <div class="tabla-contenedor">
            <table class="tabla">
              <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Resultado</th><th>Detalle técnico</th></tr></thead>
              <tbody>
                @for (r of tabla.visibles(); track r.id; let i = $index) {
                  <tr [style.--i]="i">
                    <td class="nowrap num">{{ r.fecha | date: 'd MMM y, HH:mm:ss' }}</td>
                    <td>
                      @if (r.usuario) {
                        <div class="celda-persona">
                          <span class="avatar" [style.background]="colorAvatar(r.usuario)">{{ iniciales(r.usuario) }}</span>
                          <strong>{{ r.usuario }}</strong>
                        </div>
                      } @else { <span class="muted">—</span> }
                    </td>
                    <td>{{ r.accion }}</td>
                    <td><span class="badge">{{ r.modulo }}</span></td>
                    <td>
                      <span class="badge punto" [class.badge-exito]="r.exito" [class.badge-peligro]="!r.exito">
                        {{ r.exito ? 'Hecho' : 'Rechazado (' + r.estadoHttp + ')' }}
                      </span>
                    </td>
                    <td class="mono muted" style="font-size: 12px">{{ r.metodo }} {{ r.ruta }}<br />IP {{ r.ip }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-paginador [pagina]="tabla.pagina()" [paginas]="tabla.paginas()" [total]="tabla.filtradas().length"
            [tamano]="tabla.tamano" (cambiar)="tabla.pagina.set($event)" />
        } @else {
          <app-vacio icono="historial" titulo="Sin registros" texto="No hay acciones en ese rango de fechas." />
        }
      </article>
    </div>
  `,
  styles: `.campo-en-linea { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); }`
})
export class Bitacora {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;

  protected readonly desde = signal(hoyIso(-7));
  protected readonly hasta = signal(hoyIso());
  protected readonly usuario = signal('');
  protected readonly soloFallidos = signal(false);
  protected readonly cargando = signal(true);
  private readonly registros = signal<FilaBitacora[]>([]);

  private readonly filtro = computed(() => {
    const fallidos = this.soloFallidos();
    return (r: FilaBitacora) => !fallidos || !r.exito;
  });
  protected readonly tabla = new TablaEstado(this.registros, (r) => `${r.accion} ${r.modulo} ${r.usuario ?? ''} ${r.ruta}`, 20, this.filtro);

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.bitacora.buscar(this.desde(), this.hasta(), this.usuario().trim(), 2000).subscribe({
      next: (lista) => {
        this.registros.set(lista.map((r) => {
          const d = describir(r.metodo, r.ruta);
          const exito = r.estadoHttp < 400;
          if (!exito && d.accion === 'Inició sesión') d.accion = 'Intento fallido de inicio de sesión';
          return { ...r, ...d, exito };
        }));
        this.tabla.pagina.set(1);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected exportar(): void {
    descargarCsv(`bitacora-${this.desde()}-a-${this.hasta()}.csv`, [
      ['Fecha y hora', 'Usuario', 'Acción', 'Módulo', 'Resultado', 'Código HTTP', 'Método', 'Ruta', 'IP'],
      ...this.tabla.filtradas().map((r) => [r.fecha.replace('T', ' '), r.usuario, r.accion, r.modulo, r.exito ? 'Hecho' : 'Rechazado',
        r.estadoHttp, r.metodo, r.ruta, r.ip])
    ]);
  }
}
