import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EMPRESA } from '../core/config/constantes';
import { PlanillaDetalle } from '../core/models';
import { soles } from './formato';

/* Boleta de pago de un trabajador (planilla aprobada). Se usa en la planilla y en "Mis boletas".
   Para imprimir, la página agrega la clase imprimiendo-boleta a <html> (ver estilos globales de impresión). */
@Component({
  selector: 'app-boleta-pago',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = detalle();
    <article class="boleta">
      <header>
        <div>
          <strong class="empresa">{{ empresa.razonSocial }}</strong>
          @if (empresa.ruc) { <span>RUC {{ empresa.ruc }}</span> }
        </div>
        <div class="titulo-boleta">
          <h2>Boleta de pago</h2>
          <span>{{ periodo() }}</span>
        </div>
      </header>

      <section class="datos">
        <div><span>Trabajador</span><strong>{{ d.nombres }}</strong></div>
        <div><span>Documento</span><strong class="num">{{ d.documentoIdentidad }}</strong></div>
        <div><span>Cargo</span><strong>{{ d.cargo }}</strong></div>
        <div><span>Área</span><strong>{{ d.area }}</strong></div>
        <div><span>Fecha de ingreso</span><strong>{{ d.fechaIngreso | date: 'dd/MM/y' }}</strong></div>
        <div><span>Días laborados</span><strong class="num">{{ d.diasLaborados }}</strong></div>
        <div><span>Sistema de pensiones</span><strong>{{ d.sistemaPension }}{{ d.afp ? ' · ' + d.afp : '' }}</strong></div>
        <div><span>Sueldo básico</span><strong class="num">{{ soles(d.sueldoBase) }}</strong></div>
      </section>

      <section class="conceptos">
        <div>
          <h3>Ingresos</h3>
          <p><span>Remuneración básica{{ d.diasLaborados < 30 ? ' (' + d.diasLaborados + '/30 días)' : '' }}</span><span class="num">{{ soles(d.remuneracionBruta) }}</span></p>
          <p class="total"><span>Total ingresos</span><span class="num">{{ soles(d.remuneracionBruta) }}</span></p>
        </div>
        <div>
          <h3>Descuentos</h3>
          <p><span>{{ d.sistemaPension === 'ONP' ? 'ONP' : 'AFP ' + d.afp }} ({{ porcentaje(d.tasaPension) }})</span><span class="num">{{ soles(d.descuentoPension) }}</span></p>
          <p class="total"><span>Total descuentos</span><span class="num">{{ soles(d.descuentoPension) }}</span></p>
        </div>
        <div>
          <h3>Aportes del empleador</h3>
          <p><span>EsSalud (9 %)</span><span class="num">{{ soles(d.essalud) }}</span></p>
        </div>
      </section>

      <section class="neto">
        <span>Neto a pagar</span>
        <strong class="num">{{ soles(d.neto) }}</strong>
      </section>

      <footer>
        <div class="firma"><span></span>Empleador</div>
        <div class="firma"><span></span>Trabajador · DNI {{ d.documentoIdentidad }}</div>
      </footer>
    </article>
  `,
  styles: `
    /* La boleta es un documento: siempre en blanco y negro, también en modo oscuro */
    .boleta {
      margin: 20px;
      padding: 36px 40px;
      overflow-y: auto;
      background: #fff;
      color: #111827;
      border-radius: 6px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
      font-size: 13px;

      header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 18px;
        border-bottom: 2px solid #111827;
        .empresa { display: block; font-family: var(--font-display); font-size: 18px; }
        span { color: #4b5563; }
      }
      .titulo-boleta { text-align: right; h2 { font-size: 20px; text-transform: uppercase; letter-spacing: 0.04em; } span { text-transform: capitalize; } }

      .datos {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 14px 18px;
        padding: 18px 0;
        border-bottom: 1px solid #d1d5db;
        div { display: flex; flex-direction: column; gap: 2px; }
        span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
        strong { font-weight: 600; }
        @media (max-width: 640px) { grid-template-columns: repeat(2, 1fr); }
      }

      .conceptos {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        padding: 18px 0;
        @media (max-width: 640px) { grid-template-columns: 1fr; }
        h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px; }
        p { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
        .total { font-weight: 700; border-top: 1px dashed #d1d5db; margin-top: 6px; padding-top: 6px; }
      }

      .neto {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 18px;
        border: 2px solid #111827;
        border-radius: 6px;
        span { font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        strong { font-size: 22px; }
      }

      footer {
        display: flex;
        justify-content: space-around;
        gap: 40px;
        margin-top: 64px;
        .firma { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; color: #4b5563; }
        .firma span { width: 200px; border-top: 1px solid #111827; }
      }
    }
  `
})
export class BoletaPago {
  protected readonly soles = soles;
  protected readonly empresa = EMPRESA;

  readonly detalle = input.required<PlanillaDetalle>();
  readonly periodo = input.required<string>();

  protected porcentaje(tasa: number): string {
    return `${(tasa * 100).toFixed(2)} %`;
  }
}
