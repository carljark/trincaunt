export class AppError extends Error {
  statusCode: number;
  status: string;
  // Para que otra aplicación distinga errores con el mismo status (p. ej. 'ia_desactivada')
  codigo?: string;

  constructor(message: string, statusCode: number, codigo?: string) {
    super(message);
    this.statusCode = statusCode;
    this.codigo = codigo;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    Error.captureStackTrace(this, this.constructor);
  }
}