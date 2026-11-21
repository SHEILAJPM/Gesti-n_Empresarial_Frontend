import { Permiso } from '../auth/permisos';
import { NombreIcono } from '../../shared/icon';

export interface ItemMenu {
  ruta: string;
  titulo: string;
  icono: NombreIcono;
  permiso?: Permiso;
  /* Solo para cuentas ligadas a una ficha de trabajador */
  requiereFicha?: boolean;
}

export interface GrupoMenu {
  titulo: string;
  items: ItemMenu[];
}

/* El menú se filtra solo con el rol de la sesión: si no hay permiso, el ítem no aparece */
export const MENU: GrupoMenu[] = [
  {
    titulo: 'Mi espacio',
    items: [
      { ruta: '/mi-asistencia', titulo: 'Marcar asistencia', icono: 'ubicacion', requiereFicha: true },
      { ruta: '/mis-tareas', titulo: 'Mis tareas', icono: 'tareas', requiereFicha: true },
      { ruta: '/mis-ausencias', titulo: 'Vacaciones y permisos', icono: 'maleta', requiereFicha: true },
      { ruta: '/mis-boletas', titulo: 'Mis boletas', icono: 'recibo', requiereFicha: true }
    ]
  },
  {
    titulo: 'General',
    items: [
      { ruta: '/panel', titulo: 'Panel', icono: 'panel', permiso: 'panel.ver' },
      { ruta: '/tareas', titulo: 'Tareas', icono: 'tareas', permiso: 'tareas.ver' }
    ]
  },
  {
    titulo: 'Recursos humanos',
    items: [
      { ruta: '/personal', titulo: 'Trabajadores', icono: 'usuarios', permiso: 'personal.ver' },
      { ruta: '/asistencia', titulo: 'Asistencia', icono: 'reloj', permiso: 'asistencia.ver' },
      { ruta: '/documentos', titulo: 'Documentos', icono: 'documento', permiso: 'documentos.ver' },
      { ruta: '/ausencias', titulo: 'Vacaciones y permisos', icono: 'maleta', permiso: 'ausencias.ver' },
      { ruta: '/planillas', titulo: 'Planillas', icono: 'calculadora', permiso: 'planillas.ver' }
    ]
  },
  {
    titulo: 'Comercial',
    items: [
      { ruta: '/ventas', titulo: 'Ventas', icono: 'recibo', permiso: 'ventas.ver' },
      { ruta: '/clientes', titulo: 'Clientes', icono: 'cliente', permiso: 'clientes.ver' },
      { ruta: '/productos', titulo: 'Productos', icono: 'bandeja', permiso: 'productos.ver' },
      { ruta: '/notas', titulo: 'Notas de crédito/débito', icono: 'anular', permiso: 'notas.ver' },
      { ruta: '/guias', titulo: 'Guías de remisión', icono: 'camion', permiso: 'guias.ver' },
      { ruta: '/reportes-ventas', titulo: 'Reportes de ventas', icono: 'porcentaje', permiso: 'ventas.reportes' }
    ]
  },
  {
    titulo: 'Abastecimiento',
    items: [
      { ruta: '/despachos', titulo: 'Alistar pedidos', icono: 'carrito', permiso: 'despachos.alistar' },
      { ruta: '/inventario', titulo: 'Inventario', icono: 'edificio', permiso: 'inventario.ver' },
      { ruta: '/compras', titulo: 'Compras', icono: 'carrito', permiso: 'compras.ver' },
      { ruta: '/proveedores', titulo: 'Proveedores', icono: 'camion', permiso: 'proveedores.ver' }
    ]
  },
  {
    titulo: 'Finanzas',
    items: [
      { ruta: '/cobranzas', titulo: 'Cuentas por cobrar', icono: 'bajada', permiso: 'cobranzas.ver' },
      { ruta: '/pagos', titulo: 'Pagos', icono: 'billetera', permiso: 'pagos.ver' },
      { ruta: '/tributario', titulo: 'Tributario', icono: 'banco', permiso: 'tributario.ver' }
    ]
  },
  {
    titulo: 'Sistema',
    items: [
      { ruta: '/usuarios', titulo: 'Usuarios', icono: 'escudo', permiso: 'usuarios.ver' },
      { ruta: '/bitacora', titulo: 'Bitácora', icono: 'historial', permiso: 'bitacora.ver' },
      { ruta: '/sede', titulo: 'Sede y ubicación', icono: 'ubicacion', permiso: 'sede.ver' }
    ]
  }
];
