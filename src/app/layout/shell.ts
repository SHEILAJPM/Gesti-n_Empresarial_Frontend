import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { NOMBRES_ROL } from '../core/auth/permisos';
import { SISTEMA } from '../core/config/constantes';
import { ItemMenu, MENU } from '../core/config/navegacion';
import { ThemeService } from '../core/ui/theme.service';
import { colorAvatar, iniciales, sinTildes } from '../shared/formato';
import { Icon } from '../shared/icon';

const CLAVE_COLAPSADO = 'nexo-menu-colapsado';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  host: {
    '[class.colapsado]': 'colapsado()',
    '[class.menu-movil-abierto]': 'menuMovil()',
    '(document:keydown)': 'atajos($event)'
  }
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly tema = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly sistema = SISTEMA;
  protected readonly colapsado = signal(leerColapsado());
  protected readonly menuMovil = signal(false);
  protected readonly menuUsuario = signal(false);

  protected readonly paletaAbierta = signal(false);
  protected readonly consulta = signal('');
  protected readonly seleccion = signal(0);

  protected readonly grupos = computed(() =>
    MENU.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => (!i.permiso || this.auth.puede(i.permiso)) && (!i.requiereFicha || this.auth.tieneFicha())
      )
    }))
      .filter((g) => g.items.length)
  );

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  protected readonly paginaActual = computed(() => {
    const url = this.url().split('?')[0];
    for (const g of MENU) {
      const item = g.items.find((i) => url.startsWith(i.ruta));
      if (item) {
        return { grupo: g.titulo, titulo: item.titulo };
      }
    }
    return { grupo: SISTEMA.nombre, titulo: '' };
  });

  protected readonly usuario = computed(() => this.auth.sesion()?.usuario ?? '');
  protected readonly nombreRol = computed(() => {
    const rol = this.auth.rol();
    return rol ? NOMBRES_ROL[rol] : '';
  });
  protected readonly iniciales = computed(() => iniciales(this.usuario()));
  protected readonly colorUsuario = computed(() => colorAvatar(this.usuario()));

  protected readonly resultados = computed(() => {
    const termino = sinTildes(this.consulta().trim());
    const items: (ItemMenu & { grupo: string })[] = this.grupos().flatMap((g) =>
      g.items.map((i) => ({ ...i, grupo: g.titulo }))
    );
    return termino ? items.filter((i) => sinTildes(`${i.titulo} ${i.grupo}`).includes(termino)) : items;
  });

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.menuMovil.set(false);
      this.menuUsuario.set(false);
    });
  }

  protected alternarColapsado(): void {
    this.colapsado.update((v) => !v);
    try {
      localStorage.setItem(CLAVE_COLAPSADO, String(this.colapsado()));
    } catch {
      /* preferencia solo de esta visita */
    }
  }

  protected abrirPaleta(): void {
    this.consulta.set('');
    this.seleccion.set(0);
    this.paletaAbierta.set(true);
  }

  protected atajos(evento: KeyboardEvent): void {
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
      evento.preventDefault();
      this.paletaAbierta() ? this.paletaAbierta.set(false) : this.abrirPaleta();
      return;
    }
    if (evento.key === 'Escape') {
      this.paletaAbierta.set(false);
      this.menuUsuario.set(false);
    }
  }

  protected teclaPaleta(evento: KeyboardEvent): void {
    const total = this.resultados().length;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      this.seleccion.update((i) => (i + 1) % Math.max(1, total));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      this.seleccion.update((i) => (i - 1 + total) % Math.max(1, total));
    } else if (evento.key === 'Enter') {
      const item = this.resultados()[this.seleccion()];
      if (item) {
        this.ir(item.ruta);
      }
    }
  }

  protected buscarEnPaleta(texto: string): void {
    this.consulta.set(texto);
    this.seleccion.set(0);
  }

  protected ir(ruta: string): void {
    this.paletaAbierta.set(false);
    this.router.navigateByUrl(ruta);
  }
}

function leerColapsado(): boolean {
  try {
    return localStorage.getItem(CLAVE_COLAPSADO) === 'true';
  } catch {
    return false;
  }
}
