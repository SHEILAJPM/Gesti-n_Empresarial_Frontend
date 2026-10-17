import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from '../config/constantes';
import {
  CeseRequest, Cliente, ClienteRequest, EstadoFacturacion, IntentoMarcacion, MiBoleta, MiPerfil, Sede, TipoComprobante, Compra, CompraRequest, ConfiguracionTributaria, Documento, DocumentoRequest,
  Marcacion, MarcarRequest, Pago, PagoRequest, Planilla, Proveedor, ProveedorRequest, ResumenTributario, Simulacion,
  Trabajador, TrabajadorRequest, Usuario, UsuarioRequest, Venta, VentaRequest
} from '../models';

type Parametros = Record<string, string | number | boolean>;

/* Un único punto de acceso al backend, agrupado por recurso: api.ventas.listar(), api.pagos.pagar(id)... */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  readonly personal = {
    listar: () => this.get<Trabajador[]>('/api/personal'),
    obtener: (id: number) => this.get<Trabajador>(`/api/personal/${id}`),
    registrar: (datos: TrabajadorRequest) => this.post<Trabajador>('/api/personal', datos),
    actualizar: (id: number, datos: TrabajadorRequest) => this.put<Trabajador>(`/api/personal/${id}`, datos),
    cesar: (id: number, datos: CeseRequest) => this.http.patch<Trabajador>(this.url(`/api/personal/${id}/cesar`), datos),
    reactivar: (id: number) => this.http.patch<Trabajador>(this.url(`/api/personal/${id}/reactivar`), null),
    eliminar: (id: number) => this.delete(`/api/personal/${id}`)
  };

  readonly asistencia = {
    listar: () => this.get<Marcacion[]>('/api/asistencia'),
    intentos: () => this.get<IntentoMarcacion[]>('/api/asistencia/intentos'),
    porTrabajador: (id: number) => this.get<Marcacion[]>(`/api/asistencia/trabajador/${id}`),
    marcar: (datos: MarcarRequest) => this.post<Marcacion>('/api/asistencia/marcar', datos)
  };

  readonly documentos = {
    listar: () => this.get<Documento[]>('/api/documentos'),
    porTrabajador: (id: number) => this.get<Documento[]>(`/api/documentos/trabajador/${id}`),
    proximosAVencer: (dias = 30) => this.get<Documento[]>('/api/documentos/proximos-a-vencer', { dias }),
    vencidos: () => this.get<Documento[]>('/api/documentos/vencidos'),
    registrar: (datos: DocumentoRequest) => this.post<Documento>('/api/documentos', datos)
  };

  readonly clientes = {
    listar: () => this.get<Cliente[]>('/api/clientes'),
    registrar: (datos: ClienteRequest) => this.post<Cliente>('/api/clientes', datos),
    actualizar: (id: number, datos: ClienteRequest) => this.put<Cliente>(`/api/clientes/${id}`, datos),
    eliminar: (id: number) => this.delete(`/api/clientes/${id}`)
  };

  readonly ventas = {
    listar: () => this.get<Venta[]>('/api/ventas'),
    registrar: (datos: VentaRequest) => this.post<Venta>('/api/ventas', datos),
    anular: (id: number) => this.http.patch<Venta>(this.url(`/api/ventas/${id}/anular`), null),
    consultarSunat: (id: number) => this.get<Venta>(`/api/ventas/${id}/sunat`),
    reenviarSunat: (id: number) => this.post<Venta>(`/api/ventas/${id}/sunat/reenviar`, null),
    siguienteNumero: (tipo: TipoComprobante) => this.get<{ numero: string }>('/api/ventas/siguiente-numero', { tipo })
  };

  readonly facturacion = {
    estado: () => this.get<EstadoFacturacion>('/api/facturacion/estado')
  };

  readonly proveedores = {
    listar: () => this.get<Proveedor[]>('/api/proveedores'),
    registrar: (datos: ProveedorRequest) => this.post<Proveedor>('/api/proveedores', datos),
    actualizar: (id: number, datos: ProveedorRequest) => this.put<Proveedor>(`/api/proveedores/${id}`, datos),
    eliminar: (id: number) => this.delete(`/api/proveedores/${id}`)
  };

  readonly compras = {
    listar: () => this.get<Compra[]>('/api/compras'),
    registrar: (datos: CompraRequest) => this.post<Compra>('/api/compras', datos),
    actualizar: (id: number, datos: CompraRequest) => this.put<Compra>(`/api/compras/${id}`, datos),
    eliminar: (id: number) => this.delete(`/api/compras/${id}`)
  };

  readonly pagos = {
    listar: () => this.get<Pago[]>('/api/pagos'),
    porTrabajador: (id: number) => this.get<Pago[]>(`/api/pagos/trabajador/${id}`),
    registrar: (datos: PagoRequest) => this.post<Pago>('/api/pagos', datos),
    pagar: (id: number) => this.put<Pago>(`/api/pagos/${id}/pagar`, null)
  };

  readonly portal = {
    perfil: () => this.get<MiPerfil>('/api/mi/perfil'),
    marcar: (latitud: number, longitud: number, precision: number) =>
      this.post<Marcacion>('/api/mi/asistencia', { latitud, longitud, precision }),
    misMarcaciones: () => this.get<Marcacion[]>('/api/mi/asistencia'),
    misBoletas: () => this.get<MiBoleta[]>('/api/mi/boletas')
  };

  readonly sede = {
    obtener: () => this.http.get<Sede | null>(this.url('/api/sede')),
    guardar: (datos: Omit<Sede, 'id'>) => this.put<Sede>('/api/sede', datos)
  };

  readonly planillas = {
    listar: () => this.get<Planilla[]>('/api/planillas'),
    obtener: (id: number) => this.get<Planilla>(`/api/planillas/${id}`),
    generar: (anio: number, mes: number) => this.post<Planilla>('/api/planillas/generar', { anio, mes }),
    aprobar: (id: number, fechaPago: string) =>
      this.http.patch<Planilla>(this.url(`/api/planillas/${id}/aprobar`), { fechaPago }),
    eliminar: (id: number) => this.delete(`/api/planillas/${id}`)
  };

  readonly tributario = {
    resumenMensual: (anio: number, mes: number) =>
      this.get<ResumenTributario>('/api/tributario/resumen-mensual', { anio, mes }),
    calcular: (monto: number, incluyeIgv: boolean) =>
      this.get<Simulacion>('/api/tributario/calcular', { monto, incluyeIgv }),
    configuracion: () => this.get<ConfiguracionTributaria[]>('/api/tributario/configuracion'),
    actualizarTasa: (codigo: string, tasa: number) =>
      this.put<ConfiguracionTributaria>(`/api/tributario/configuracion/${codigo}`, { tasa })
  };

  readonly usuarios = {
    listar: () => this.get<Usuario[]>('/api/usuarios'),
    crear: (datos: UsuarioRequest) => this.post<Usuario>('/api/usuarios', datos),
    vincularTrabajador: (id: number, trabajadorId: number | null) =>
      this.http.patch<Usuario>(this.url(`/api/usuarios/${id}/trabajador`), { trabajadorId }),
    cambiarEstado: (id: number, activo: boolean) =>
      this.http.patch<Usuario>(this.url(`/api/usuarios/${id}/estado`), null, { params: { activo } })
  };

  private url(ruta: string): string {
    return `${API_URL}${ruta}`;
  }

  private get<T>(ruta: string, params?: Parametros): Observable<T> {
    return this.http.get<T>(this.url(ruta), { params: params ? new HttpParams({ fromObject: params }) : undefined });
  }

  private post<T>(ruta: string, cuerpo: unknown): Observable<T> {
    return this.http.post<T>(this.url(ruta), cuerpo);
  }

  private put<T>(ruta: string, cuerpo: unknown): Observable<T> {
    return this.http.put<T>(this.url(ruta), cuerpo);
  }

  private delete(ruta: string): Observable<void> {
    return this.http.delete<void>(this.url(ruta));
  }
}
