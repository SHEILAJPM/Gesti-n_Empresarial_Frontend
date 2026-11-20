/* CSV con punto y coma y BOM: Excel en español lo abre con columnas y tildes correctas */
export function descargarCsv(nombreArchivo: string, filas: (string | number | null)[][]): void {
  const celda = (v: string | number | null) => {
    const texto = v === null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const contenido = '\uFEFF' + filas.map((fila) => fila.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
