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
`contabilidad1 / Conta123`, `administracion1 / AdminArea123`.

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
