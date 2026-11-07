import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { NOMBRES_ROL } from '../../core/auth/permisos';
import { ROLES_PERSONAL, Rol, Trabajador, Usuario } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { colorAvatar, iniciales } from '../../shared/formato';
import { CambiarClave } from '../../shared/cambiar-clave';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

const DESCRIPCION_ROL: Record<Rol, string> = {
  ADMIN: 'Acceso total, incluida la configuración tributaria y los usuarios.',
  RRHH: 'Trabajadores, asistencia y documentos del personal.',
  CONTABILIDAD: 'Consulta ventas y compras; gestiona pagos y el módulo tributario.',
  ADMINISTRACION: 'Registra ventas, clientes, compras y proveedores.',
  TRABAJADOR: 'Solo "Mi espacio": su perfil, marcación de asistencia y boletas.',
  VENDEDOR: 'Personal de ventas; accede a "Mi espacio" con su ficha de trabajador.',
  ALMACEN: 'Personal de almacén; accede a "Mi espacio" con su ficha de trabajador.'
};

@Component({
  selector: 'app-usuarios',
  imports: [ReactiveFormsModule, PageHeader, StatCard, Icon, Panel, Paginador, Vacio, ErrorCampo, CambiarClave],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './usuarios.html'
})
export class Usuarios {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly usuarioActual = inject(AuthService).sesion()?.usuario;
  protected readonly nombresRol = NOMBRES_ROL;
  protected readonly descripcionRol = DESCRIPCION_ROL;
  protected readonly roles = Object.keys(NOMBRES_ROL) as Rol[];
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;

  protected readonly cargando = signal(true);
  protected readonly usuarios = signal<Usuario[]>([]);
  protected readonly cambiandoId = signal<number | null>(null);
  /* Cuenta a la que el administrador le restablece la contraseña */
  protected readonly claveDe = signal<Usuario | null>(null);
  protected readonly tabla = new TablaEstado(this.usuarios, (u) => `${u.username} ${NOMBRES_ROL[u.rol]}`, 10);
  protected readonly activos = computed(() => this.usuarios().filter((u) => u.activo).length);

  protected readonly panelAbierto = signal(false);
  protected readonly guardando = signal(false);
  protected readonly verClave = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]{3,50}$/)]],
    // Mismas reglas que el backend: 8 caracteres o más, con letras y números
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72), Validators.pattern(/^(?=.*\p{L})(?=.*\d).+$/u)]],
    rol: ['ADMINISTRACION' as Rol, Validators.required],
    trabajadorId: [null as number | null]
  });
  protected readonly trabajadores = signal<Trabajador[]>([]);

  protected esPersonal(rol: Rol): boolean {
    return ROLES_PERSONAL.includes(rol);
  }

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.usuarios.listar().subscribe({
      next: (lista) => {
        this.usuarios.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected abrir(): void {
    this.form.reset({ username: '', password: '', rol: 'ADMINISTRACION', trabajadorId: null });
    this.verClave.set(false);
    this.panelAbierto.set(true);
    this.cargarTrabajadores();
  }

  private cargarTrabajadores(): void {
    const vinculados = new Set(this.usuarios().map((u) => u.trabajadorId).filter((id) => id !== null));
    this.api.personal.listar().subscribe({
      next: (lista) => this.trabajadores.set(lista.filter((t) => t.estado !== 'CESADO' && !vinculados.has(t.id))),
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const datos = this.form.getRawValue();
    if (this.esPersonal(datos.rol) && datos.trabajadorId === null) {
      this.toast.error(`El rol ${NOMBRES_ROL[datos.rol]} necesita estar vinculado a la ficha de un trabajador.`);
      return;
    }
    this.guardando.set(true);
    this.api.usuarios.crear(datos).subscribe({
      next: (u) => {
        this.usuarios.update((lista) => [...lista, u]);
        this.toast.exito(`Usuario ${u.username} creado con rol ${NOMBRES_ROL[u.rol]}.`);
        this.panelAbierto.set(false);
        this.guardando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }

  protected async alternarEstado(u: Usuario): Promise<void> {
    if (u.activo) {
      const ok = await this.confirm.preguntar({
        titulo: `Desactivar a ${u.username}`,
        mensaje: 'No podrá iniciar sesión hasta que lo vuelvas a activar.',
        accion: 'Desactivar',
        peligro: true
      });
      if (!ok) {
        return;
      }
    }
    this.cambiandoId.set(u.id);
    this.api.usuarios.cambiarEstado(u.id, !u.activo).subscribe({
      next: (actualizado) => {
        this.usuarios.update((lista) => lista.map((x) => (x.id === actualizado.id ? actualizado : x)));
        this.toast.exito(`${u.username} ${actualizado.activo ? 'fue activado' : 'fue desactivado'}.`);
        this.cambiandoId.set(null);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cambiandoId.set(null);
      }
    });
  }
}
