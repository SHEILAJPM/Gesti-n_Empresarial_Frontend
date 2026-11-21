import { Routes } from '@angular/router';
import { autenticadoGuard, fichaGuard, invitadoGuard, permisoGuard, rutaInicio } from './core/auth/guards';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [invitadoGuard],
    title: 'Iniciar sesión · Nexo',
    loadComponent: () => import('./features/login/login').then((m) => m.Login)
  },
  {
    path: '',
    component: Shell,
    canActivate: [autenticadoGuard],
    canActivateChild: [permisoGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: rutaInicio },
      {
        path: 'mi-asistencia',
        title: 'Marcar asistencia · Nexo',
        canActivate: [fichaGuard],
        loadComponent: () => import('./features/portal/mi-asistencia').then((m) => m.MiAsistencia)
      },
      {
        path: 'mis-boletas',
        title: 'Mis boletas · Nexo',
        canActivate: [fichaGuard],
        loadComponent: () => import('./features/portal/mis-boletas').then((m) => m.MisBoletas)
      },
      {
        path: 'mis-tareas',
        title: 'Mis tareas · Nexo',
        canActivate: [fichaGuard],
        loadComponent: () => import('./features/portal/mis-tareas').then((m) => m.MisTareas)
      },
      {
        path: 'mis-ausencias',
        title: 'Vacaciones y permisos · Nexo',
        canActivate: [fichaGuard],
        loadComponent: () => import('./features/portal/mis-ausencias').then((m) => m.MisAusencias)
      },
      {
        path: 'tareas',
        title: 'Tareas · Nexo',
        data: { permiso: 'tareas.ver' },
        loadComponent: () => import('./features/tareas/tareas').then((m) => m.Tareas)
      },
      {
        path: 'ausencias',
        title: 'Vacaciones y permisos · Nexo',
        data: { permiso: 'ausencias.ver' },
        loadComponent: () => import('./features/personal/ausencias').then((m) => m.Ausencias)
      },
      {
        path: 'reportes-ventas',
        title: 'Reportes de ventas · Nexo',
        data: { permiso: 'ventas.reportes' },
        loadComponent: () => import('./features/comercial/reportes-ventas').then((m) => m.ReportesVentas)
      },
      {
        path: 'despachos',
        title: 'Alistar pedidos · Nexo',
        data: { permiso: 'despachos.alistar' },
        loadComponent: () => import('./features/abastecimiento/despachos').then((m) => m.Despachos)
      },
      {
        path: 'despachos/:ventaId',
        title: 'Alistar pedido · Nexo',
        data: { permiso: 'despachos.alistar' },
        loadComponent: () => import('./features/abastecimiento/alistar').then((m) => m.Alistar)
      },
      {
        path: 'etiquetas',
        title: 'Etiquetas · Nexo',
        data: { permiso: 'inventario.ver' },
        loadComponent: () => import('./features/abastecimiento/etiquetas').then((m) => m.Etiquetas)
      },
      {
        path: 'bitacora',
        title: 'Bitácora · Nexo',
        data: { permiso: 'bitacora.ver' },
        loadComponent: () => import('./features/sistema/bitacora').then((m) => m.Bitacora)
      },
      {
        path: 'sin-acceso',
        title: 'Sin módulos · Nexo',
        loadComponent: () => import('./features/sistema/sin-acceso').then((m) => m.SinAcceso)
      },
      {
        path: 'sede',
        title: 'Sede y ubicación · Nexo',
        data: { permiso: 'sede.ver' },
        loadComponent: () => import('./features/sistema/sede').then((m) => m.SedeUbicacion)
      },
      {
        path: 'panel',
        title: 'Panel · Nexo',
        data: { permiso: 'panel.ver' },
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard)
      },
      {
        path: 'personal',
        title: 'Trabajadores · Nexo',
        data: { permiso: 'personal.ver' },
        loadComponent: () => import('./features/personal/trabajadores').then((m) => m.Trabajadores)
      },
      {
        path: 'personal/:id',
        title: 'Ficha del trabajador · Nexo',
        data: { permiso: 'personal.ver' },
        loadComponent: () => import('./features/personal/trabajador-detalle').then((m) => m.TrabajadorDetalle)
      },
      {
        path: 'asistencia',
        title: 'Asistencia · Nexo',
        data: { permiso: 'asistencia.ver' },
        loadComponent: () => import('./features/personal/asistencia').then((m) => m.Asistencia)
      },
      {
        path: 'documentos',
        title: 'Documentos · Nexo',
        data: { permiso: 'documentos.ver' },
        loadComponent: () => import('./features/personal/documentos').then((m) => m.Documentos)
      },
      {
        path: 'planillas',
        title: 'Planillas · Nexo',
        data: { permiso: 'planillas.ver' },
        loadComponent: () => import('./features/personal/planillas').then((m) => m.Planillas)
      },
      {
        path: 'planillas/:id',
        title: 'Planilla · Nexo',
        data: { permiso: 'planillas.ver' },
        loadComponent: () => import('./features/personal/planilla-detalle').then((m) => m.PlanillaDetalleVista)
      },
      {
        path: 'ventas',
        title: 'Ventas · Nexo',
        data: { permiso: 'ventas.ver' },
        loadComponent: () => import('./features/comercial/ventas').then((m) => m.Ventas)
      },
      {
        path: 'clientes',
        title: 'Clientes · Nexo',
        data: { permiso: 'clientes.ver' },
        loadComponent: () => import('./features/comercial/clientes').then((m) => m.Clientes)
      },
      {
        path: 'productos',
        title: 'Productos · Nexo',
        data: { permiso: 'productos.ver' },
        loadComponent: () => import('./features/comercial/productos').then((m) => m.Productos)
      },
      {
        path: 'notas',
        title: 'Notas de crédito y débito · Nexo',
        data: { permiso: 'notas.ver' },
        loadComponent: () => import('./features/comercial/notas').then((m) => m.Notas)
      },
      {
        path: 'guias',
        title: 'Guías de remisión · Nexo',
        data: { permiso: 'guias.ver' },
        loadComponent: () => import('./features/comercial/guias').then((m) => m.Guias)
      },
      {
        path: 'compras',
        title: 'Compras · Nexo',
        data: { permiso: 'compras.ver' },
        loadComponent: () => import('./features/abastecimiento/compras').then((m) => m.Compras)
      },
      {
        path: 'proveedores',
        title: 'Proveedores · Nexo',
        data: { permiso: 'proveedores.ver' },
        loadComponent: () => import('./features/abastecimiento/proveedores').then((m) => m.Proveedores)
      },
      {
        path: 'pagos',
        title: 'Pagos · Nexo',
        data: { permiso: 'pagos.ver' },
        loadComponent: () => import('./features/finanzas/pagos').then((m) => m.Pagos)
      },
      {
        path: 'inventario',
        title: 'Inventario · Nexo',
        data: { permiso: 'inventario.ver' },
        loadComponent: () => import('./features/abastecimiento/inventario').then((m) => m.Inventario)
      },
      {
        path: 'cobranzas',
        title: 'Cuentas por cobrar · Nexo',
        data: { permiso: 'cobranzas.ver' },
        loadComponent: () => import('./features/finanzas/cobranzas').then((m) => m.Cobranzas)
      },
      {
        path: 'tributario',
        title: 'Tributario · Nexo',
        data: { permiso: 'tributario.ver' },
        loadComponent: () => import('./features/finanzas/tributario').then((m) => m.Tributario)
      },
      {
        path: 'usuarios',
        title: 'Usuarios · Nexo',
        data: { permiso: 'usuarios.ver' },
        loadComponent: () => import('./features/sistema/usuarios').then((m) => m.Usuarios)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
