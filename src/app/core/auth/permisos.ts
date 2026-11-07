import { Rol } from '../models';

/* Misma matriz que backend/config/SecurityConfig.java.
   El backend es quien realmente protege; esto solo decide qué se muestra. */
export const PERMISOS = {
  'personal.ver': ['ADMIN', 'RRHH'],
  'personal.editar': ['ADMIN', 'RRHH'],
  'personal.listar': ['ADMIN', 'RRHH', 'CONTABILIDAD'],
  'asistencia.ver': ['ADMIN', 'RRHH'],
  'documentos.ver': ['ADMIN', 'RRHH'],

  // Almacén consulta las ventas para despacharlas con guía
  'ventas.ver': ['ADMIN', 'CONTABILIDAD', 'ADMINISTRACION', 'VENDEDOR', 'ALMACEN'],
  // Emitir boletas y facturas: Administración y los vendedores
  'ventas.editar': ['ADMIN', 'ADMINISTRACION', 'VENDEDOR'],
  'ventas.anular': ['ADMIN', 'CONTABILIDAD'],
  'clientes.ver': ['ADMIN', 'CONTABILIDAD', 'ADMINISTRACION', 'VENDEDOR', 'ALMACEN'],
  'clientes.crear': ['ADMIN', 'ADMINISTRACION', 'VENDEDOR'],
  'clientes.editar': ['ADMIN', 'ADMINISTRACION'],
  'productos.ver': ['ADMIN', 'CONTABILIDAD', 'ADMINISTRACION', 'VENDEDOR', 'ALMACEN'],
  'productos.editar': ['ADMIN', 'ADMINISTRACION'],
  'notas.ver': ['ADMIN', 'CONTABILIDAD', 'ADMINISTRACION'],
  'notas.emitir': ['ADMIN', 'CONTABILIDAD', 'ADMINISTRACION'],
  'guias.ver': ['ADMIN', 'ADMINISTRACION', 'CONTABILIDAD', 'ALMACEN', 'VENDEDOR'],
  'guias.emitir': ['ADMIN', 'ADMINISTRACION', 'ALMACEN', 'VENDEDOR'],

  'compras.ver': ['ADMIN', 'ADMINISTRACION', 'CONTABILIDAD'],
  'compras.editar': ['ADMIN', 'ADMINISTRACION', 'CONTABILIDAD'],
  'proveedores.ver': ['ADMIN', 'ADMINISTRACION', 'CONTABILIDAD'],
  'proveedores.editar': ['ADMIN', 'ADMINISTRACION', 'CONTABILIDAD'],

  'pagos.ver': ['ADMIN', 'CONTABILIDAD'],
  'planillas.ver': ['ADMIN', 'RRHH', 'CONTABILIDAD'],
  'planillas.generar': ['ADMIN', 'RRHH'],
  'planillas.aprobar': ['ADMIN', 'CONTABILIDAD'],
  'tributario.ver': ['ADMIN', 'CONTABILIDAD'],
  'tributario.configurar': ['ADMIN'],

  'usuarios.ver': ['ADMIN'],
  'sede.ver': ['ADMIN', 'RRHH'],
  'sede.configurar': ['ADMIN'],

  // El panel general es para las áreas; el personal entra a "Mi espacio"
  'panel.ver': ['ADMIN', 'RRHH', 'CONTABILIDAD', 'ADMINISTRACION']
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof PERMISOS;

export function rolPuede(rol: Rol | null | undefined, permiso: Permiso): boolean {
  return !!rol && (PERMISOS[permiso] as readonly Rol[]).includes(rol);
}

export const NOMBRES_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  RRHH: 'Recursos Humanos',
  CONTABILIDAD: 'Contabilidad',
  ADMINISTRACION: 'Administración',
  TRABAJADOR: 'Trabajador',
  VENDEDOR: 'Vendedor',
  ALMACEN: 'Almacén'
};
