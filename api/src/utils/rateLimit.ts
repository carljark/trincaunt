// Contadores en memoria de ventana fija. Se reinician al reiniciar el servidor,
// que basta con un solo proceso.
export class AttemptLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private max: number, private windowMs: number) {
    setInterval(() => this.prune(), windowMs).unref();
  }

  /** Segundos que faltan para poder volver a intentarlo, o 0 si no está bloqueado. */
  retryAfter(key: string): number {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= Date.now() || entry.count < this.max) {
      return 0;
    }
    return Math.ceil((entry.resetAt - Date.now()) / 1000);
  }

  hit(key: string): void {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count++;
    }
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}

export const tooManyAttempts = (seconds: number) => {
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.ceil(minutes / 60);
  const time = minutes <= 60
    ? `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
    : `${hours} horas`;
  return `Demasiados intentos. Prueba de nuevo en ${time}`;
};
