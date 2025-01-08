export class GraffitiErrorNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraffitiErrorNotFound";
    Object.setPrototypeOf(this, GraffitiErrorNotFound.prototype);
  }
}
