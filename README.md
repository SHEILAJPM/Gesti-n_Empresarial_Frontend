# Frontend · Nexo (Angular 21)

Interfaz del sistema de gestión empresarial. Consume el API de Spring Boot del directorio `backend/`.

## Arrancar

```bash
npm install
npm start            # http://localhost:4200
```

El backend debe estar corriendo en `http://localhost:8080` (se cambia en `src/app/core/config/constantes.ts`).
Sin Neon se puede usar el perfil local del backend: `mvnw spring-boot:run -Dspring-boot.run.profiles=local`.

Cuentas de prueba (solo se muestran en el login en modo desarrollo): `admin / Admin123`, `rrhh1 / Rrhh123`,
`contabilidad1 / Conta123`, `administracion1 / AdminArea123` y, con el perfil `local` del backend,
`vendedor1 / Vende123`, `almacen1 / Almacen123` y `trabajador1 / Trabaja123`.

## Flujos por rol

Todos los usuarios tienen la campana de avisos (arriba a la derecha) con lo que les toca atender. Las cuentas del personal
(vendedor, almacén, trabajador) tienen además «Mi espacio»: marcar asistencia (con su resumen del mes), mis tareas,
vacaciones y permisos y mis boletas.

| Cuenta | Entra a | Flujos principales |
|---|---|---|
| `admin` | Panel | Todo el sistema; usuarios y pedidos de contraseña, bitácora, sede y tasa de IGV |
| `rrhh1` | Panel | Fichas (con turno propio), asistencia, documentos, aprobar vacaciones y permisos, generar planilla con descuento por asistencia, asignar tareas |
| `contabilidad1` | Panel | Aprobar planilla (crea los pagos), pagos, cobros, notas de crédito/débito, IGV, reportes de ventas, asignar tareas |
| `administracion1` | Panel | Boletas y facturas, clientes, productos, compras, proveedores, guías, reportes de ventas, asignar tareas |
| `vendedor1` | Ventas | Emitir comprobantes («Solo las mías» marcado), registrar clientes, guías; Mi espacio |
| `almacen1` | Inventario | Ingresos, salidas y conteos, kárdex, ventas por despachar (en Guías); Mi espacio |
| `trabajador1` | Marcar asistencia | Marcar entrada y salida con GPS y foto; Mi espacio |

Recorridos de punta a punta:

1. **Tareas**: `administracion1` asigna una tarea en Tareas → `almacen1` la ve en su campana y en Mis tareas, la empieza
   y la termina con un comentario → `administracion1` ve el aviso «Tareas terminadas».
2. **Vacaciones**: `vendedor1` pide vacaciones en Vacaciones y permisos (se valida el saldo y que no se crucen) →
   `rrhh1` las aprueba o rechaza con motivo → el vendedor ve la respuesta y el aviso.
3. **Planilla con asistencia**: `rrhh1` genera octubre 2026 con «Descontar faltas y tardanzas» → el detalle muestra a
   Rosa (1 falta, 65 min), Miguel (descanso médico justificado, 30 min con turno de 07:00), Ana (1 falta) y Jorge
   (1 día sin goce); Pedro queda fuera por ficha incompleta → `contabilidad1` aprueba → cada uno ve su boleta con los descuentos.
4. **Venta y despacho**: `vendedor1` emite una boleta (queda registrado quién la emitió) → `almacen1` la ve en Guías ›
   Por despachar y crea la guía → `contabilidad1` la ve en Reportes de ventas por vendedor y por producto.
5. **Contraseña olvidada**: en el login, escribir el usuario y pulsar «¿Olvidaste tu contraseña?» → `admin` ve el
   pedido en Usuarios y pone una clave nueva.
6. **Auditoría**: `admin` revisa en Bitácora quién hizo cada cambio (filtra por fecha, usuario o solo rechazados) y la exporta a CSV.

Para marcar asistencia desde la PC, el navegador debe simular la ubicación de la sede
(DevTools › Sensors › Location: -12.0464, -77.0428).

## Estructura

```
src/app/
  core/       api (ApiService, errores), auth (sesión, guards, interceptor, permisos por rol),
              config (constantes, menú), models (contratos del API), ui (tema, avisos, confirmación)
  layout/     shell: barra lateral, barra superior, buscador Ctrl+K
  shared/     componentes reutilizables: íconos, tarjetas KPI, gráficos SVG, panel lateral, tabla, paginador
  features/   una carpeta por área: personal, comercial, abastecimiento, finanzas, sistema, dashboard, login
src/styles/   tokens de diseño (modo claro y oscuro), base, componentes y animaciones
```

## Convenciones

- **Permisos**: `core/auth/permisos.ts` replica la matriz de `SecurityConfig.java`. Si cambia un rol en el backend, se cambia aquí.
- **Tema**: los colores salen de variables CSS en `styles/_tokens.scss`; el modo oscuro solo redefine esas variables.
  No usar colores fijos en componentes.
- **Formularios**: se abren en `<app-panel>` (panel lateral); los botones van en `ngProjectAs="[pie]"`.
- **Accesos directos**: `?nuevo=1` en Ventas, Compras, Clientes, Proveedores y Pagos abre el formulario de registro.
