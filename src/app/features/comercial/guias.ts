import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { EstadoFacturacion, EstadoSunat, Guia, ModalidadTraslado, Producto, Venta } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { hoyIso } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

interface BienForm {
  clave: number;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
}

/* Unidades que no se trasladan: los servicios no viajan en una guía */
const SIN_TRASLADO = ['ZZ', 'HUR'];
let clave = 1;

/* Guías de remisión remitente: traslado de mercadería con transporte propio o contratado */
@Component({
  selector: 'app-guias',
  imports: [DatePipe, DecimalPipe, PageHeader, StatCard, Icon, Panel, Paginador, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guias.html',
  styleUrl: './guias.scss'
})
export class Guias {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly puedeEmitir = inject(AuthService).puede('guias.emitir');
  protected readonly hoy = hoyIso();

  /* ?venta=ID abre el formulario con el cliente y los bienes de esa venta (botón «Guía» en Ventas) */
  readonly venta = input<string>();

  protected readonly cargando = signal(true);
  protected readonly guias = signal<Guia[]>([]);
  protected readonly motivos = signal<Record<string, string>>({});
  protected readonly listaMotivos = computed(() => Object.entries(this.motivos()).map(([codigo, texto]) => ({ codigo, texto })));
  protected readonly productos = signal<Producto[]>([]);
  protected readonly unidades = signal<Partial<Record<string, string>>>({ NIU: 'Unidad' });
  protected readonly listaUnidades = computed(() => Object.entries(this.unidades())
    .filter(([c]) => !SIN_TRASLADO.includes(c)).map(([codigo, nombre]) => ({ codigo, nombre })));
  protected readonly facturacion = signal<EstadoFacturacion | null>(null);

  protected readonly tabla = new TablaEstado(this.guias,
    (g) => `${g.numero} ${g.destinatarioNombre} ${g.destinatarioDocumento} ${g.comprobanteRelacionado ?? ''} ${g.vehiculoPlaca ?? ''}`, 10);
  protected readonly deHoy = computed(() => this.guias().filter((g) => g.fechaEmision === this.hoy).length);
  protected readonly propias = computed(() => this.guias().filter((g) => g.modalidad === 'PRIVADO').length);

  // ---------- Formulario ----------
  protected readonly abierto = signal(false);
  protected readonly ventaOrigen = signal<Venta | null>(null);
  protected readonly motivo = signal('01');
  protected readonly fechaTraslado = signal(this.hoy);
  protected readonly destinatarioDocumento = signal('');
  protected readonly destinatarioNombre = signal('');
  protected readonly peso = signal(0);
  protected readonly bultos = signal<number | null>(null);
  protected readonly modalidad = signal<ModalidadTraslado>('PRIVADO');
  protected readonly transportistaRuc = signal('');
  protected readonly transportistaRazon = signal('');
  protected readonly placa = signal('');
  protected readonly conductorDni = signal('');
  protected readonly conductorNombres = signal('');
  protected readonly conductorLicencia = signal('');
  protected readonly partidaUbigeo = signal('150101');
  protected readonly partidaDireccion = signal('');
  protected readonly llegadaUbigeo = signal('');
  protected readonly llegadaDireccion = signal('');
  protected readonly observaciones = signal('');
  protected readonly bienes = signal<BienForm[]>([]);
  protected readonly emitiendo = signal(false);

  protected readonly problemas = computed(() => {
    const p: string[] = [];
    if (!/^(\d{8}|\d{11})$/.test(this.destinatarioDocumento())) p.push('El destinatario necesita DNI (8) o RUC (11 dígitos).');
    if (!this.destinatarioNombre().trim()) p.push('Escribe el nombre del destinatario.');
    if (!(this.peso() > 0)) p.push('Indica el peso bruto en kg.');
    if (this.modalidad() === 'PUBLICO' && (!/^\d{11}$/.test(this.transportistaRuc()) || !this.transportistaRazon().trim())) {
      p.push('Transporte contratado: RUC (11 dígitos) y razón social del transportista.');
    }
    if (this.modalidad() === 'PRIVADO' && (!/^[A-Za-z0-9]{3}-?[A-Za-z0-9]{3}$/.test(this.placa()) || !/^\d{8}$/.test(this.conductorDni())
      || !this.conductorNombres().trim() || !this.conductorLicencia().trim())) {
      p.push('Vehículo propio: placa (ABC-123) y DNI, nombre y licencia del conductor.');
    }
    if (!/^\d{6}$/.test(this.partidaUbigeo()) || !/^\d{6}$/.test(this.llegadaUbigeo())) p.push('Los ubigeos de partida y llegada tienen 6 dígitos.');
    if (!this.partidaDireccion().trim() || !this.llegadaDireccion().trim()) p.push('Completa las direcciones de partida y llegada.');
    if (!this.bienes().length || this.bienes().some((b) => !b.descripcion.trim() || !(b.cantidad > 0))) p.push('Agrega los bienes con descripción y cantidad.');
    return p;
  });

  // ---------- Vista ----------
  protected readonly vista = signal<Guia | null>(null);
  protected readonly cargandoVista = signal(false);

  constructor() {
    forkJoin({
      guias: this.api.guias.listar(),
      motivos: this.api.guias.motivos(),
      productos: this.api.productos.listar().pipe(catchError(() => of([] as Producto[]))),
      unidades: this.api.productos.unidades().pipe(catchError(() => of({} as Partial<Record<string, string>>))),
      facturacion: this.api.facturacion.estado().pipe(catchError(() => of(null)))
    }).subscribe({
      next: (r) => {
        this.guias.set(r.guias);
        this.motivos.set(r.motivos);
        this.productos.set(r.productos.filter((p) => p.activo && !SIN_TRASLADO.includes(p.unidad)));
        this.unidades.set(r.unidades);
        this.facturacion.set(r.facturacion);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
    effect(() => {
      const id = Number(this.venta());
      if (id && this.puedeEmitir) untracked(() => this.abrirDesdeVenta(id));
    });
  }

  protected abrir(): void {
    this.limpiar();
    this.ventaOrigen.set(null);
    this.motivo.set('01');
    this.bienes.set([{ clave: clave++, codigo: null, descripcion: '', unidad: 'NIU', cantidad: 1 }]);
    this.abierto.set(true);
  }

  private abrirDesdeVenta(id: number): void {
    this.api.ventas.obtener(id).subscribe({
      next: (v) => {
        this.limpiar();
        this.ventaOrigen.set(v);
        this.motivo.set('01');
        this.destinatarioDocumento.set(v.documentoCliente);
        this.destinatarioNombre.set(v.nombreCliente);
        const bienes = v.items.filter((i) => !SIN_TRASLADO.includes(i.unidad))
          .map((i) => ({ clave: clave++, codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad }));
        this.bienes.set(bienes.length ? bienes : [{ clave: clave++, codigo: null, descripcion: '', unidad: 'NIU', cantidad: 1 }]);
        this.abierto.set(true);
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  /* Partida y transporte se proponen con los de la última guía: suelen repetirse */
  private limpiar(): void {
    const ultima = this.guias()[0];
    this.fechaTraslado.set(this.hoy);
    this.destinatarioDocumento.set('');
    this.destinatarioNombre.set('');
    this.peso.set(0);
    this.bultos.set(null);
    this.modalidad.set(ultima?.modalidad ?? 'PRIVADO');
    this.transportistaRuc.set(ultima?.transportistaRuc ?? '');
    this.transportistaRazon.set(ultima?.transportistaRazonSocial ?? '');
    this.placa.set(ultima?.vehiculoPlaca ?? '');
    this.conductorDni.set(ultima?.conductorDni ?? '');
    this.conductorNombres.set(ultima?.conductorNombres ?? '');
    this.conductorLicencia.set(ultima?.conductorLicencia ?? '');
    this.partidaUbigeo.set(ultima?.partidaUbigeo ?? '150101');
    this.partidaDireccion.set(ultima?.partidaDireccion ?? '');
    this.llegadaUbigeo.set('');
    this.llegadaDireccion.set('');
    this.observaciones.set('');
  }

  protected cerrar(): void {
    this.abierto.set(false);
    if (this.venta()) this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected agregarBien(): void {
    this.bienes.update((b) => [...b, { clave: clave++, codigo: null, descripcion: '', unidad: 'NIU', cantidad: 1 }]);
  }

  protected quitarBien(c: number): void {
    this.bienes.update((b) => b.filter((x) => x.clave !== c));
  }

  protected cambiarBien(c: number, cambios: Partial<BienForm>): void {
    this.bienes.update((b) => b.map((x) => (x.clave === c ? { ...x, ...cambios } : x)));
  }

  protected elegirProducto(c: number, id: string): void {
    const p = this.productos().find((x) => x.id === Number(id));
    this.cambiarBien(c, p ? { codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad } : { codigo: null });
  }

  protected emitir(): void {
    const problema = this.problemas()[0];
    if (problema) {
      this.toast.error(problema);
      return;
    }
    const privado = this.modalidad() === 'PRIVADO';
    this.emitiendo.set(true);
    this.api.guias.emitir({
      ventaId: this.ventaOrigen()?.id ?? null,
      motivoCodigo: this.motivo(),
      fechaTraslado: this.fechaTraslado(),
      destinatarioDocumento: this.destinatarioDocumento(),
      destinatarioNombre: this.destinatarioNombre().trim(),
      pesoBrutoKg: Number(this.peso()),
      numeroBultos: this.bultos() || null,
      modalidad: this.modalidad(),
      transportistaRuc: privado ? '' : this.transportistaRuc(),
      transportistaRazonSocial: privado ? '' : this.transportistaRazon().trim(),
      vehiculoPlaca: privado ? this.placa().toUpperCase() : '',
      conductorDni: privado ? this.conductorDni() : '',
      conductorNombres: privado ? this.conductorNombres().trim() : '',
      conductorLicencia: privado ? this.conductorLicencia().trim() : '',
      partidaUbigeo: this.partidaUbigeo(),
      partidaDireccion: this.partidaDireccion().trim(),
      llegadaUbigeo: this.llegadaUbigeo(),
      llegadaDireccion: this.llegadaDireccion().trim(),
      observaciones: this.observaciones().trim() || null,
      items: this.bienes().map((b) => ({ codigo: b.codigo, descripcion: b.descripcion.trim(), unidad: b.unidad, cantidad: Number(b.cantidad) }))
    }).subscribe({
      next: (g) => {
        this.guias.update((l) => [g, ...l]);
        if (['RECHAZADO', 'ERROR', 'EXCEPCION'].includes(g.sunat.estado)) {
          this.toast.error(`Guía ${g.numero} registrada, pero SUNAT: ${g.sunat.mensaje}`);
        } else {
          this.toast.exito(`Guía ${g.numero} emitida · SUNAT: ${this.etiquetaSunat(g.sunat.estado).texto.toLowerCase()}.`);
        }
        this.emitiendo.set(false);
        this.cerrar();
        this.ver(g);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.emitiendo.set(false);
      }
    });
  }

  protected ver(g: Guia): void {
    this.vista.set(g);
    this.cargandoVista.set(true);
    this.api.guias.obtener(g.id).subscribe({
      next: (completa) => {
        this.vista.set(completa);
        this.guias.update((l) => l.map((x) => (x.id === completa.id ? { ...x, sunat: completa.sunat } : x)));
        this.cargandoVista.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargandoVista.set(false);
      }
    });
  }

  protected reenviar(g: Guia): void {
    this.api.guias.reenviarSunat(g.id).subscribe({
      next: (r) => {
        this.vista.set(r);
        this.guias.update((l) => l.map((x) => (x.id === r.id ? { ...x, sunat: r.sunat } : x)));
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
