/* Reconocimiento facial en el navegador con face-api.js (@vladmandic/face-api).
   Calcula el "descriptor" del rostro: 128 números que lo describen. El servidor lo compara con el rostro de
   referencia aprobado por RRHH. La librería (~1.5 MB) y los modelos se cargan solo la primera vez que se usan. */
type FaceApi = typeof import('@vladmandic/face-api');

let cargando: Promise<FaceApi> | null = null;

function cargar(): Promise<FaceApi> {
  cargando ??= (async () => {
    const faceapi = await import('@vladmandic/face-api');
    // WebGL (tarjeta gráfica) si el equipo lo tiene; si no, el procesador: más lento, pero funciona en cualquier equipo
    const tf = faceapi.tf as unknown as { setBackend(b: string): Promise<boolean>; ready(): Promise<void> };
    if (!(await tf.setBackend('webgl').catch(() => false))) {
      await tf.setBackend('cpu');
    }
    await tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('models')
    ]);
    return faceapi;
  })().catch((e) => {
    cargando = null;
    throw e;
  });
  return cargando;
}

/* Descriptor del rostro más claro de la foto (JPEG en data URL), o null si no se encontró un rostro */
export async function descriptorDeFoto(dataUrl: string): Promise<number[] | null> {
  const faceapi = await cargar();
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const deteccion = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return deteccion ? Array.from(deteccion.descriptor) : null;
}

/* Convierte la foto elegida o tomada en un JPEG de máximo 720 px (lo que acepta el servidor) */
export async function fotoComoJpeg(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const escala = Math.min(1, 720 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* Lee cualquier archivo como data URL (para adjuntar documentos) */
export function leerArchivo(archivo: File): Promise<string> {
  return new Promise((ok, error) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result));
    lector.onerror = () => error(lector.error);
    lector.readAsDataURL(archivo);
  });
}
