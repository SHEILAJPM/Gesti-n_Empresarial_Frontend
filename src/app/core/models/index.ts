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
  /* Fecha ISO en que vence el JWT */
  expiraEn: string;
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
  /* Foto tomada al marcar desde el celular; las registradas por RRHH no tienen */
  fotoId: number | null;
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
  fotoId: number | null;
}

export interface Sede {
  id: number;
  nombre: string;
  direccion: string | null;
  latitud: number;
  longitud: number;
  radioMetros: number;
  precisionMaxima: number;
  /* Horario (HH:mm:ss): con él se calculan tardanzas y faltas */
  horaEntrada: string;
  horaSalida: string;
  toleranciaMinutos: number;
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
  formaPago: FormaPago;
  observaciones: string | null;
  /* Solo vienen al consultar una venta (GET /api/ventas/{id}); en el listado llegan vacíos */
  items: VentaItem[];
  cuotas: VentaCuota[];
  montoEnLetras: string | null;
}

export type FormaPago = 'CONTADO' | 'CREDITO';

export interface VentaItem {
  orden: number;
  productoId: number | null;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  valorUnitario: number;
  valorVenta: number;
  igv: number;
}

export interface VentaCuota {
  numero: number;
  fechaVencimiento: string;
  monto: number;
}

/* Producto o servicio del catálogo; valorUnitario es SIN IGV */
export interface Producto {
  id: number;
  codigo: string;
  descripcion: string;
  unidad: string;
  valorUnitario: number;
  activo: boolean;
}

export type ProductoRequest = Omit<Producto, 'id' | 'activo'>;

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
  montoSinIgv?: number | null;
  fecha: string;
  items?: { productoId: number | null; codigo: string | null; descripcion: string; unidad: string; cantidad: number; valorUnitario: number }[];
  formaPago?: FormaPago;
  cuotas?: { fechaVencimiento: string; monto: number }[];
  observaciones?: string | null;
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
  /* Retención de renta de 5ta categoría del mes */
  rentaQuinta: number;
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

export interface FilaResumenAsistencia {
  trabajadorId: number;
  nombres: string;
  documento: string;
  area: string;
  diasLaborables: number;
  diasAsistidos: number;
  faltas: number;
  tardanzas: number;
  minutosTardanza: number;
  horasTrabajadas: number;
  diasSinSalida: number;
}

/* Resumen mensual de asistencia según el horario de la sede */
export interface ResumenAsistencia {
  anio: number;
  mes: number;
  horaEntrada: string;
  toleranciaMinutos: number;
  trabajadores: FilaResumenAsistencia[];
}

export type TipoNota = 'CREDITO' | 'DEBITO';

/* Nota de crédito (resta) o de débito (suma) sobre una factura o boleta */
export interface Nota {
  id: number;
  tipo: TipoNota;
  numero: string;
  fecha: string;
  motivoCodigo: string;
  motivo: string;
  sustento: string;
  ventaId: number;
  tipoComprobanteAfectado: TipoComprobante;
  numeroAfectado: string;
  documentoCliente: string;
  nombreCliente: string;
  montoSinIgv: number;
  igv: number;
  montoTotal: number;
  tasaAplicada: number;
  registradaPor: string | null;
  sunat: ComprobanteSunat;
  /* Solo al consultar una nota (GET /api/notas/{id}) */
  items: VentaItem[];
  montoEnLetras: string | null;
}

export interface NotaRequest {
  ventaId: number;
  tipo: TipoNota;
  motivoCodigo: string;
  sustento: string;
  fecha?: string;
  items?: { productoId: null; codigo: string | null; descripcion: string; unidad: string; cantidad: number; valorUnitario: number }[];
}

export type MotivosNota = Record<TipoNota, Record<string, string>>;

/* PUBLICO: empresa de transporte (RUC) · PRIVADO: vehículo propio (placa y conductor) */
export type ModalidadTraslado = 'PUBLICO' | 'PRIVADO';

export interface GuiaItem {
  orden: number;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
}

/* Guía de remisión remitente (serie T001) */
export interface Guia {
  id: number;
  numero: string;
  fechaEmision: string;
  fechaTraslado: string;
  motivoCodigo: string;
  motivo: string;
  ventaId: number | null;
  comprobanteRelacionado: string | null;
  destinatarioTipoDocumento: string;
  destinatarioDocumento: string;
  destinatarioNombre: string;
  pesoBrutoKg: number;
  numeroBultos: number | null;
  modalidad: ModalidadTraslado;
  transportistaRuc: string | null;
  transportistaRazonSocial: string | null;
  vehiculoPlaca: string | null;
  conductorDni: string | null;
  conductorNombres: string | null;
  conductorLicencia: string | null;
  partidaUbigeo: string;
  partidaDireccion: string;
  llegadaUbigeo: string;
  llegadaDireccion: string;
  observaciones: string | null;
  registradaPor: string | null;
  sunat: ComprobanteSunat;
  /* Solo al consultar una guía (GET /api/guias/{id}) */
  items: GuiaItem[];
}

export interface GuiaRequest {
  ventaId?: number | null;
  motivoCodigo: string;
  fechaTraslado?: string;
  destinatarioDocumento?: string;
  destinatarioNombre?: string;
  pesoBrutoKg: number;
  numeroBultos?: number | null;
  modalidad: ModalidadTraslado;
  transportistaRuc?: string;
  transportistaRazonSocial?: string;
  vehiculoPlaca?: string;
  conductorDni?: string;
  conductorNombres?: string;
  conductorLicencia?: string;
  partidaUbigeo: string;
  partidaDireccion: string;
  llegadaUbigeo: string;
  llegadaDireccion: string;
  observaciones?: string | null;
  items?: { codigo: string | null; descripcion: string; unidad: string; cantidad: number }[];
}
