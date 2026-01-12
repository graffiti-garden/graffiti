import type { JSONSchema, FromSchema } from "json-schema-to-ts";
import {
  getAuthorizationEndpoint,
  fetchWithErrorHandling,
  verifyHTTPSEndpoint,
} from "./utilities";
import z from "zod";
import { GraffitiErrorInvalidSchema } from "@graffiti-garden/api";

export class Inboxes {
  getAuthorizationEndpoint = getAuthorizationEndpoint;

  async send<Schema extends JSONSchema>(
    inboxUrl: string,
    message: Message<FromSchema<Schema>>,
  ): Promise<string> {
    verifyHTTPSEndpoint(inboxUrl);
    const url = `${inboxUrl}/send`;

    const response = await fetchWithErrorHandling(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const json = await response.json();
    const parsed = SendResponseSchema.parse(json);
    return parsed.messageId;
  }

  async label(
    inboxUrl: string,
    messageId: string,
    label: number,
    inboxToken: string,
  ): Promise<void> {
    verifyHTTPSEndpoint(inboxUrl);
    const url = `${inboxUrl}/label/${messageId}`;

    await fetchWithErrorHandling(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${inboxToken}`,
      },
      body: JSON.stringify({ label }),
    });
  }

  protected async *messageStreamer<TData>(
    url: string,
    startingParams: string,
    dataSchema: {},
    inboxToken?: string | null,
  ): MessageStream<TData> {
    let schema: z.ZodTypeAny;
    try {
      schema = z.fromJSONSchema(dataSchema);
    } catch (e) {
      throw new GraffitiErrorInvalidSchema(
        e instanceof Error ? e.message : String(e),
      );
    }

    let cursor: string | null = null;
    while (true) {
      const response = await fetchWithErrorHandling(
        cursor
          ? `${url}?cursor=${encodeURIComponent(cursor)}`
          : `${url}?${startingParams}`,
        inboxToken
          ? {
              headers: {
                Authorization: `Bearer ${inboxToken}`,
              },
            }
          : {},
      );

      const json = await response.json();
      const {
        results,
        hasMore,
        cursor: nextCursor,
      } = MessageResultSchema.parse(json);
      cursor = nextCursor;

      for (const result of results) {
        const data = result.message.data;
        const parsed = schema.parse(data) as unknown as TData;

        const message: Message<TData> = {
          tags: result.message.tags,
          data: parsed,
        };

        const messageWithMetadata: MessageWithMetadata<TData> = {
          messageId: result.messageId,
          message,
          label: result.label,
        };

        yield messageWithMetadata;
      }

      // Only stop when results = 0 and hasMore = false,
      // a result which will never be cached.
      if (results.length === 0 && !hasMore) {
        break;
      }
    }
    if (!cursor) {
      throw new Error("There must be a cursor...");
    }

    const outputCursor = JSON.stringify({
      cursor,
      dataSchema,
    });

    return {
      cursor: outputCursor,
      continue: (inboxToken?: string | null) =>
        this.messageStreamer<TData>(
          url,
          `cursor=${encodeURIComponent(cursor)}`,
          dataSchema,
          inboxToken,
        ),
    };
  }

  query<Schema extends JSONSchema, TData = FromSchema<Schema>>(
    inboxUrl: string,
    tags: string[],
    dataSchema: Schema,
    inboxToken?: string | null,
  ): MessageStream<TData> {
    verifyHTTPSEndpoint(inboxUrl);
    const url = `${inboxUrl}/query`;

    const tagParam = tags
      .map((tag) => `tag=${encodeURIComponent(tag)}`)
      .join("&");
    const dataParam = `dataSchema=${encodeURIComponent(JSON.stringify(dataSchema))}`;
    const startingParams = `${tagParam}&${dataParam}`;

    return this.messageStreamer<TData>(
      url,
      startingParams,
      dataSchema,
      inboxToken,
    );
  }

  continueQuery(
    inboxUrl: string,
    cursor: string,
    inboxToken?: string | null,
  ): MessageStream<any> {
    verifyHTTPSEndpoint(inboxUrl);
    const url = `${inboxUrl}/query`;

    const decodedCursor = JSON.parse(cursor);
    const { cursor: actualCursor, dataSchema } =
      CursorSchema.parse(decodedCursor);

    const startingParams = `cursor=${encodeURIComponent(actualCursor)}`;

    return this.messageStreamer<any>(
      url,
      startingParams,
      dataSchema,
      inboxToken,
    );
  }

  async *export(
    inboxUrl: string,
    inboxToken: string,
  ): AsyncGenerator<Message<any>> {
    verifyHTTPSEndpoint(inboxUrl);
    const url = `${inboxUrl}/export`;

    let cursor: string | null = null;
    while (true) {
      const response = await fetchWithErrorHandling(
        cursor ? `${url}?cursor=${encodeURIComponent(cursor)}` : url,
        {
          headers: {
            Authorization: `Bearer ${inboxToken}`,
          },
        },
      );

      const json = await response.json();
      const {
        results,
        hasMore,
        cursor: nextCursor,
      } = ExportResultSchema.parse(json);
      cursor = nextCursor;

      for (const result of results) {
        yield result;
      }

      // Only stop when results = 0 and hasMore = false,
      // a result which will never be cached.
      if (results.length === 0 && !hasMore) {
        break;
      }
    }
  }
}

const SendResponseSchema = z.object({
  messageId: z.string(),
});

const MessageSchema = z.object({
  tags: z.array(z.string()),
  data: z.unknown(),
});

const MessageResultSchema = z.object({
  results: z.array(
    z.object({
      messageId: z.string(),
      message: MessageSchema,
      label: z.int(),
    }),
  ),
  hasMore: z.boolean(),
  cursor: z.string(),
});

const ExportResultSchema = z.object({
  results: z.array(MessageSchema),
  hasMore: z.boolean(),
  cursor: z.string(),
});

const CursorSchema = z.object({
  cursor: z.string(),
  dataSchema: z.object({}),
});

export interface Message<TData> {
  tags: string[];
  data: TData;
}

export interface MessageWithMetadata<TData> {
  messageId: string;
  message: Message<TData>;
  label: number;
}

export interface MessageStreamReturn<TData> {
  cursor: string;
  continue: (inboxToken?: string | null) => MessageStream<TData>;
}

export interface MessageStream<TData> extends AsyncGenerator<
  MessageWithMetadata<TData>,
  MessageStreamReturn<TData>
> {}
