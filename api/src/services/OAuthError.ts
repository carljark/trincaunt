/** Error con el formato de OAuth ({ error, error_description }) */
export class OAuthError extends Error {
  constructor(readonly error: string, message: string, readonly status = 400) {
    super(message);
  }
}
