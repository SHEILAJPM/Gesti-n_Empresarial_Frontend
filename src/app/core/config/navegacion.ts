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
      { ruta: '/mis-boletas', titulo: 'Mis boletas', icono: 'recibo', requiereFicha: true }
    ]
  },
  {
    titulo: 'General',
    items: [{ ruta: '/panel', titulo: 'Panel', icono: 'panel', permiso: 'panel.ver' }]
  },
  {
    titulo: 'Recursos humanos',
    items: [
      { ruta: '/personal', titulo: 'Trabajadores', icono: 'usuarios', permiso: 'personal.ver' },
      { ruta: '/asistencia', titulo: 'Asistencia', icono: 'reloj', permiso: 'asistencia.ver' },
      { ruta: '/documentos', titulo: 'Documentos', icono: 'documento', permiso: 'documentos.ver' },
      { ruta: '/planillas', titulo: 'Planillas', icono: 'calculadora', permiso: 'planillas.ver' }
    ]
  },
  {
    titulo: 'Comercial',
    items: [
      { ruta: '/ventas', titulo: 'Ventas', icono: 'recibo', permiso: 'ventas.ver' },
      { ruta: '/clientes', titulo: 'Clientes', icono: 'cliente', permiso: 'clientes.ver' }
    ]
  },
  {
    titulo: 'Abastecimiento',
    items: [
      { ruta: '/compras', titulo: 'Compras', icono: 'carrito', permiso: 'compras.ver' },
      { ruta: '/proveedores', titulo: 'Proveedores', icono: 'camion', permiso: 'proveedores.ver' }
    ]
  },
  {
    titulo: 'Finanzas',
    items: [
      { ruta: '/pagos', titulo: 'Pagos', icono: 'billetera', permiso: 'pagos.ver' },
      { ruta: '/tributario', titulo: 'Tributario', icono: 'banco', permiso: 'tributario.ver' }
    ]
  },
  {
    titulo: 'Sistema',
    items: [
      { ruta: '/usuarios', titulo: 'Usuarios', icono: 'escudo', permiso: 'usuarios.ver' },
      { ruta: '/sede', titulo: 'Sede y ubicación', icono: 'ubicacion', permiso: 'sede.ver' }
    ]
  }
];
