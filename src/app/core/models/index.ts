/* Contratos del API: reflejan los DTO y entidades del backend (desarrolloWeb.backend.dto / entity) */

export type Rol = 'ADMIN' | 'RRHH' | 'CONTABILIDAD' | 'ADMINISTRACION' | 'TRABAJADOR' | 'VENDEDOR' | 'ALMACEN';

/* Roles del personal: siempre ligados a una ficha de trabajador */
export const ROLES_PERSONAL: Rol[] = ['TRABAJADOR', 'VENDEDOR', 'ALMACEN'];
export type TipoDocumento = 'DNI' | 'RUC';
export type TipoComprobante = 'FACTURA' | 'BOLETA';
export type EstadoVenta = 'EMITIDA' | 'ANULADA';
export type TipoMarcacion = 'ENTRADA' | 'SALIDA';
export type TipoBeneficiario = 'TRABAJADOR' | 'PROVEEDOR';
export type EstadoPago = 'PENDIENTE' | 'PAGADO';

export interface Sesion {
  usuario: string;
  rol: Rol;
  token: string;
  trabajadorId: number | null;
}

export type EstadoTrabajador = 'ACTIVO' | 'CESADO';
export type SistemaPension = 'ONP' | 'AFP';

export interface Trabajador {
  id: number;
  nombres: string;
  documentoIdentidad: string;
  cargo: string | null;
  area: string | null;
  estado: EstadoTrabajador | null;
  fechaNacimiento: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  fechaIngreso: string | null;
  sueldo: number | null;
  sistemaPension: SistemaPension | null;
  afp: string | null;
  banco: string | null;
  numeroCuenta: string | null;
  fechaCese: string | null;
  motivoCese: string | null;
}

export interface TrabajadorRequest {
  nombres: string;
  documentoIdentidad: string;
  cargo: string;
  area: string;
  fechaIngreso: string;
  sueldo: number;
  fechaNacimiento: string | null;
  telefono: string;
  correo: string;
  direccion: string;
  sistemaPension: string;
  afp: string;
  banco: string;
  numeroCuenta: string;
}

export interface CeseRequest {
  fechaCese: string;
  motivo: string;
}

export interface Marcacion {
  id: number;
  trabajadorId: number;
  tipo: TipoMarcacion;
  fechaHora: string;
  origen: 'RRHH' | 'PORTAL';
  latitud: number | null;
  longitud: number | null;
  precisionMetros: number | null;
  distanciaMetros: number | null;
}

export interface IntentoMarcacion {
  id: number;
  trabajadorId: number;
  nombres: string;
  fechaHora: string;
  tipo: TipoMarcacion;
  distanciaMetros: number;
  precisionMetros: number;
  latitud: number;
  longitud: number;
  motivo: string;
}

export interface Sede {
  id: number;
  nombre: string;
  direccion: string | null;
  latitud: number;
  longitud: number;
  radioMetros: number;
  precisionMaxima: number;
}

export interface MiPerfil {
  usuario: string;
  rol: Rol;
  trabajador: Trabajador;
  sede: Sede | null;
  siguienteMarcacion: TipoMarcacion;
  marcacionesHoy: Marcacion[];
}

export interface MiBoleta {
  anio: number;
  mes: number;
  fechaPago: string | null;
  detalle: PlanillaDetalle;
}

export interface MarcarRequest {
  documentoIdentidad: string;
  tipo: TipoMarcacion;
}

export interface Documento {
  id: number;
  trabajadorId: number;
  tipo: string;
  fechaVencimiento: string;
}

export interface DocumentoRequest {
  documentoIdentidad: string;
  tipo: string;
  fechaVencimiento: string;
}

export interface Proveedor {
  id: number;
  ruc: string;
  razonSocial: string;
  direccion: string | null;
}

export interface ProveedorRequest {
  ruc: string;
  razonSocial: string;
  direccion: string | null;
}

/* Respuesta de /api/consultas/documento: RENIEC para DNI, SUNAT para RUC (dirección, estado y condición solo con RUC) */
export interface DocumentoConsultado {
  documento: string;
  tipo: TipoDocumento;
  nombre: string;
  direccion: string | null;
  estado: string | null;
  condicion: string | null;
}

export interface Cliente {
  id: number;
  documento: string;
  nombre: string;
  tipoDocumento: TipoDocumento;
}

export interface ClienteRequest {
  documento: string;
  nombre: string;
}

export interface Compra {
  id: number;
  proveedorId: number;
  rucProveedor: string;
  razonSocialProveedor: string;
  numeroComprobante: string;
  fecha: string;
  montoSinIgv: number;
  igv: number;
  montoTotal: number;
  tasaAplicada: number;
}

export interface CompraRequest {
  ruc: string;
  numeroComprobante: string;
  montoSinIgv: number;
  fecha: string;
}

export interface Venta {
  id: number;
  clienteId: number;
  documentoCliente: string;
  nombreCliente: string;
  tipoComprobante: TipoComprobante;
  numeroComprobante: string;
  fecha: string;
  montoSinIgv: number;
  igv: number;
  montoTotal: number;
  tasaAplicada: number;
  estado: EstadoVenta;
  sunat: ComprobanteSunat;
}

export type EstadoSunat = 'NO_ENVIADO' | 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' | 'EXCEPCION' | 'ERROR';

export interface ComprobanteSunat {
  estado: EstadoSunat;
  proveedor: string | null;
  documentId: string | null;
  fileName: string | null;
  mensaje: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
  pdfUrl: string | null;
  fechaEnvio: string | null;
}

export interface EstadoFacturacion {
  proveedor: 'SIMULADOR' | 'APISUNAT';
  ambiente: string;
  emisorRuc: string;
  emisorRazonSocial: string;
}

export interface VentaRequest {
  documentoCliente: string;
  numeroComprobante: string;
  montoSinIgv: number;
  fecha: string;
}

export interface Pago {
  id: number;
  tipoBeneficiario: TipoBeneficiario;
  trabajadorId: number | null;
  proveedorId: number | null;
  concepto: string;
  monto: number;
  fechaProgramada: string;
  fechaPago: string | null;
  estado: EstadoPago;
}

export interface PagoRequest {
  tipoBeneficiario: TipoBeneficiario;
  documentoIdentidad: string | null;
  rucProveedor: string | null;
  concepto: string;
  monto: number;
  fechaProgramada: string;
}

export interface ResumenTributario {
  desde: string;
  hasta: string;
  totalComprasSinIgv: number;
  igvCompras: number;
  totalVentasSinIgv: number;
  igvVentas: number;
  igvPorPagar: number;
  saldoAFavor: number;
  cantidadCompras: number;
  cantidadVentas: number;
}

export interface Simulacion {
  montoIngresado: number;
  incluyeIgv: boolean;
  tasa: number;
  base: number;
  igv: number;
  total: number;
}

export interface ConfiguracionTributaria {
  codigo: string;
  tasa: number;
  vigente: boolean;
}

export interface Usuario {
  id: number;
  username: string;
  rol: Rol;
  activo: boolean;
  trabajadorId: number | null;
  trabajadorNombre: string | null;
}

export interface UsuarioRequest {
  username: string;
  password: string;
  rol: Rol;
  trabajadorId: number | null;
}

export type EstadoPlanilla = 'BORRADOR' | 'APROBADA';

export interface PlanillaDetalle {
  id: number;
  trabajadorId: number;
  nombres: string;
  documentoIdentidad: string;
  cargo: string | null;
  area: string | null;
  fechaIngreso: string;
  sueldoBase: number;
  diasLaborados: number;
  remuneracionBruta: number;
  sistemaPension: SistemaPension;
  afp: string | null;
  tasaPension: number;
  descuentoPension: number;
  essalud: number;
  neto: number;
  pagoId: number | null;
  estadoPago: EstadoPago | null;
}

export interface Planilla {
  id: number;
  anio: number;
  mes: number;
  estado: EstadoPlanilla;
  fechaGeneracion: string;
  generadaPor: string;
  fechaAprobacion: string | null;
  aprobadaPor: string | null;
  fechaPago: string | null;
  totalBruto: number;
  totalDescuentos: number;
  totalNeto: number;
  totalEssalud: number;
  cantidadTrabajadores: number;
  pagosRealizados: number;
  detalles: PlanillaDetalle[];
  omitidos: string[];
}

export interface ErrorApi {
  status: number;
  mensaje: string;
  errores?: Record<string, string>;
}
