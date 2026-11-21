import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { ProductoStock } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Vacio } from '../../shared/bloques';
import { Icon } from '../../shared/icon';

/* Etiquetas con código de barras (Code 128) para pegar en productos o estantes. Usan el código de barras de fábrica
   si el producto lo tiene; si no, el código interno. El escáner de Almacén reconoce ambos. */
@Component({
  selector: 'app-etiquetas',
  imports: [PageHeader, Icon, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila">
      <app-page-header seccion="Abastecimiento" titulo="Etiquetas con código de barras"
        descripcion="Imprime y pega una etiqueta en cada producto o estante. Almacén las escanea con el celular al alistar pedidos.">
        <button type="button" class="btn btn-primario" [disabled]="!totalEtiquetas()" (click)="imprimir()">
          <app-icon name="documento" [size]="17" /> Imprimir {{ totalEtiquetas() }} etiquetas
        </button>
      </app-page-header>

      <article class="card entrada">
        @if (productos().length) {
          <div class="tabla-contenedor">
            <table class="tabla">
              <thead><tr><th>Producto</th><th>Código que se imprime</th><th class="right">Stock</th><th class="right">Etiquetas</th></tr></thead>
              <tbody>
                @for (p of productos(); track p.id) {
                  <tr>
                    <td><strong>{{ p.descripcion }}</strong></td>
                    <td class="mono">{{ codigoDe(p) }} @if (!p.codigoBarras) { <small class="muted">(interno)</small> }</td>
                    <td class="right num">{{ p.stock }}</td>
                    <td class="right"><input type="number" min="0" max="200" class="control num cantidad" [value]="copias()[p.id] ?? 1"
                      (input)="fijar(p.id, $any($event.target).value)" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <app-vacio icono="bandeja" titulo="Sin productos" texto="Los productos con stock aparecen aquí." />
        }
      </article>
    </div>
  `,
  styles: `.cantidad { width: 80px; text-align: right; }`
})
export class Etiquetas {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly productos = signal<ProductoStock[]>([]);
  protected readonly copias = signal<Partial<Record<number, number>>>({});
  protected readonly totalEtiquetas = computed(() =>
    this.productos().reduce((s, p) => s + (this.copias()[p.id] ?? 1), 0));

  constructor() {
    this.api.inventario.listar().subscribe({
      next: (l) => this.productos.set(l.filter((p) => p.activo)),
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected codigoDe(p: ProductoStock): string {
    return p.codigoBarras || p.codigo;
  }

  protected fijar(id: number, valor: string): void {
    const n = Math.max(0, Math.min(200, Math.floor(Number(valor) || 0)));
    this.copias.update((c) => ({ ...c, [id]: n }));
  }

  /* Genera las etiquetas en una ventana aparte, lista para imprimir (hoja A4, 3 columnas) */
  protected async imprimir(): Promise<void> {
    const JsBarcode = (await import('jsbarcode')).default;
    const etiquetas: string[] = [];
    for (const p of this.productos()) {
      const n = this.copias()[p.id] ?? 1;
      if (!n) continue;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, this.codigoDe(p), { format: 'CODE128', width: 1.6, height: 48, fontSize: 13, margin: 4 });
      const bloque = `<div class="etiqueta"><div class="nombre">${this.escapar(p.descripcion)}</div>${svg.outerHTML}</div>`;
      for (let i = 0; i < n; i++) etiquetas.push(bloque);
    }
    const ventana = window.open('', '_blank');
    if (!ventana) {
      this.toast.error('El navegador bloqueó la ventana de impresión: permite las ventanas emergentes.');
      return;
    }
    ventana.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
      body { font-family: Arial, sans-serif; margin: 8mm; }
      .hoja { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
      .etiqueta { border: 1px dashed #bbb; padding: 3mm; text-align: center; break-inside: avoid; }
      .nombre { font-size: 11px; height: 28px; overflow: hidden; margin-bottom: 2px; }
      svg { max-width: 100%; height: auto; }
      @media print { .etiqueta { border-color: #eee; } }
    </style></head><body><div class="hoja">${etiquetas.join('')}</div>
    <script>window.onload = () => { window.print(); }<\/script></body></html>`);
    ventana.document.close();
  }

  private escapar(t: string): string {
    return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  }
}
