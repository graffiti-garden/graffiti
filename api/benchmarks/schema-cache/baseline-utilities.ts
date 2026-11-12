// Exact compileGraffitiObjectSchema implementation from e2b7451e2.
// Kept as a benchmark control; production imports the normal API source.
import type Ajv from "ajv";
import { GraffitiErrorInvalidSchema } from "../../src/3-errors";
let ajv: Ajv | undefined;
export async function compileGraffitiObjectSchema(schema: any) {
  if (!ajv) {
    const { default: Ajv } = await import("ajv");
    ajv = new Ajv({ strict: false });
  }
  try {
    return ajv.compile(schema);
  } catch (error) {
    throw new GraffitiErrorInvalidSchema(
      error instanceof Error ? error.message : String(error),
    );
  }
}
