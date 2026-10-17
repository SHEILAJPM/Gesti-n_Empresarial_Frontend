import { Injectable, signal } from '@angular/core';

export type TipoToast = 'exito' | 'error' | 'info';

export interface Toast {
  id: number;
  tipo: TipoToast;
  mensaje: string;
}

const DURACION_MS = 4200;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private siguienteId = 1;
  private readonly lista = signal<Toast[]>([]);

  readonly toasts = this.lista.asReadonly();
  readonly duracion = DURACION_MS;

  exito(mensaje: string): void {
    this.mostrar('exito', mensaje);
  }

  error(mensaje: string): void {
    this.mostrar('error', mensaje);
  }

  info(mensaje: string): void {
    this.mostrar('info', mensaje);
  }

  cerrar(id: number): void {
    this.lista.update((actual) => actual.filter((t) => t.id !== id));
  }

  private mostrar(tipo: TipoToast, mensaje: string): void {
    // Evita apilar el mismo aviso varias veces (por ejemplo, varios 403 a la vez)
    if (this.lista().some((t) => t.mensaje === mensaje)) {
      return;
    }
    const id = this.siguienteId++;
    this.lista.update((actual) => [...actual.slice(-3), { id, tipo, mensaje }]);
    setTimeout(() => this.cerrar(id), DURACION_MS);
  }
}
