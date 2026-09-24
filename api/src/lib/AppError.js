/**
 * An error we expected and know how to explain to the user.
 * Services throw it; the error middleware turns it into
 * { "error": { "code": "...", "message": "..." } } with the right HTTP status.
 */
export class AppError extends Error {
  /**
   * @param {number} status   HTTP status, e.g. 409
   * @param {string} code     stable machine-readable code, e.g. 'SEATS_UNAVAILABLE'
   * @param {string} message  sentence a person can read
   * @param {unknown} [details] optional extra info, e.g. which fields failed validation
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
