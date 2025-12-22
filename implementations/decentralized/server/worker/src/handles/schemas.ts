import { z } from "zod";

export const HandleSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const HandleBodySchema = z.object({
  handle: HandleSchema,
});

export const HandleUpdateSchema = z.object({
  handle: HandleSchema,
  data: z.record(z.string(), z.any()),
});
