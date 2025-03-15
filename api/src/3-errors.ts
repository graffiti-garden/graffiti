export class GraffitiErrorUnauthorized extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorUnauthorized";
    Object.setPrototypeOf(this, GraffitiErrorUnauthorized.prototype);
  }
}

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

export class GraffitiErrorPatchTestFailed extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorPatchTestFailed";
    Object.setPrototypeOf(this, GraffitiErrorPatchTestFailed.prototype);
  }
}

export class GraffitiErrorPatchError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorPatchError";
    Object.setPrototypeOf(this, GraffitiErrorPatchError.prototype);
  }
}

export class GraffitiErrorInvalidUrl extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorInvalidUrl";
    Object.setPrototypeOf(this, GraffitiErrorInvalidUrl.prototype);
  }
}

export class GraffitiErrorUnrecognizedUrlScheme extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorUnrecognizedUriScheme";
    Object.setPrototypeOf(this, GraffitiErrorUnrecognizedUrlScheme.prototype);
  }
}
