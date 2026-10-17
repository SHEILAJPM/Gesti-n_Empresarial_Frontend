const SOLES = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
const ENTERO = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const COMPACTO = new Intl.NumberFormat('es-PE', { notation: 'compact', maximumFractionDigits: 1 });

export type Formato = 'soles' | 'entero' | 'porcentaje';

export function formatear(valor: number, formato: Formato): string {
  switch (formato) {
    case 'soles':
      return SOLES.format(valor);
    case 'porcentaje':
      return `${(valor * 100).toFixed(valor * 100 % 1 === 0 ? 0 : 2)} %`;
    default:
      return ENTERO.format(Math.round(valor));
  }
}

export function soles(valor: number | null | undefined): string {
  return SOLES.format(valor ?? 0);
}

export function compacto(valor: number): string {
  return COMPACTO.format(valor);
}

/* Fecha local en formato ISO (yyyy-MM-dd), la que espera el backend en LocalDate */
export function hoyIso(desplazamientoDias = 0): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + desplazamientoDias);
  return isoLocal(fecha);
}

export function isoLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/* Días desde hoy hasta una fecha yyyy-MM-dd (negativo si ya pasó) */
export function diasHasta(fechaIso: string): number {
  const [a, m, d] = fechaIso.split('-').map(Number);
  const objetivo = new Date(a, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000);
}

export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '?') + (partes[1]?.[0] ?? '')).toUpperCase();
}

/* Color estable por nombre para los avatares */
const PALETA_AVATAR = ['#0b6e69', '#2457c5', '#b45309', '#7c3aed', '#be185d', '#0e7490', '#4d7c0f', '#9a3412'];

export function colorAvatar(texto: string | null | undefined): string {
  let hash = 0;
  for (const c of texto ?? '') {
    hash = (hash * 31 + c.charCodeAt(0)) | 0;
  }
  return PALETA_AVATAR[Math.abs(hash) % PALETA_AVATAR.length];
}

export function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/* Tiempo entre dos fechas yyyy-MM-dd en años y meses: "2 años 3 meses" (hasta hoy si no hay fecha final) */
export function antiguedad(desde: string | null, hasta?: string | null): string {
  if (!desde) {
    return '—';
  }
  const [a1, m1, d1] = desde.split('-').map(Number);
  const fin = hasta ? hasta.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()];
  let meses = (fin[0] - a1) * 12 + (fin[1] - m1) - (fin[2] < d1 ? 1 : 0);
  if (meses < 0) {
    return 'Aún no ingresa';
  }
  const anios = Math.floor(meses / 12);
  meses %= 12;
  const partes = [];
  if (anios) partes.push(`${anios} ${anios === 1 ? 'año' : 'años'}`);
  if (meses) partes.push(`${meses} ${meses === 1 ? 'mes' : 'meses'}`);
  return partes.join(' ') || 'Menos de un mes';
}

export function edad(fechaNacimiento: string | null): number | null {
  if (!fechaNacimiento) {
    return null;
  }
  const [a, m, d] = fechaNacimiento.split('-').map(Number);
  const hoy = new Date();
  return hoy.getFullYear() - a - (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d) ? 1 : 0);
}

/* Distancia en metros entre dos coordenadas (Haversine); el backend repite el cálculo y es quien decide */
export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
