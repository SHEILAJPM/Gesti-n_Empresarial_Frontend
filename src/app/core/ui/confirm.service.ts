import { Injectable, signal } from '@angular/core';

export interface Pregunta {
  titulo: string;
  mensaje: string;
  accion?: string;
  peligro?: boolean;
}

interface PreguntaActiva extends Pregunta {
  responder: (respuesta: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly activa = signal<PreguntaActiva | null>(null);

  readonly pregunta = this.activa.asReadonly();

  preguntar(pregunta: Pregunta): Promise<boolean> {
    return new Promise((resolve) => {
      this.activa.set({
        ...pregunta,
        responder: (respuesta) => {
          this.activa.set(null);
          resolve(respuesta);
        }
      });
    });
  }
}
