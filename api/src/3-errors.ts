export class GraffitiErrorForbidden extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorForbidden";
    Object.setPrototypeOf(this, GraffitiErrorForbidden.prototype);
  }
}

export class GraffitiErrorNotFound extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorNotFound";
    Object.setPrototypeOf(this, GraffitiErrorNotFound.prototype);
  }
}

export class GraffitiErrorInvalidSchema extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorInvalidSchema";
    Object.setPrototypeOf(this, GraffitiErrorInvalidSchema.prototype);
  }
}

export class GraffitiErrorSchemaMismatch extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorSchemaMismatch";
    Object.setPrototypeOf(this, GraffitiErrorSchemaMismatch.prototype);
  }
}

export class GraffitiErrorTooLarge extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorTooLarge";
    Object.setPrototypeOf(this, GraffitiErrorTooLarge.prototype);
  }
}

export class GraffitiErrorNotAcceptable extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorNotAcceptable";
    Object.setPrototypeOf(this, GraffitiErrorNotAcceptable.prototype);
  }
}
