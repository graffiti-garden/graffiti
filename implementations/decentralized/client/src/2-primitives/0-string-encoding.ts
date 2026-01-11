// https://github.com/multiformats/multibase/blob/master/multibase.csv
export const STRING_ENCODER_METHOD_BASE64URL = "base64url";
const STRING_ENCODER_PREFIX_BASE64URL = "u";

export class StringEncoder {
  async encode(method: string, bytes: Uint8Array): Promise<string> {
    if (method !== STRING_ENCODER_METHOD_BASE64URL) {
      throw new Error(`Unsupported string encoding method: ${method}`);
    }
    // Convert it to base64
    const base64 = btoa(String.fromCodePoint(...bytes));
    // Make sure it is url safe
    const encoded = base64
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/\=+$/, "");
    // Append method prefix
    return STRING_ENCODER_PREFIX_BASE64URL + encoded;
  }

  async decode(base64Url: string): Promise<Uint8Array> {
    if (!base64Url.startsWith(STRING_ENCODER_PREFIX_BASE64URL)) {
      throw new Error(`Unsupported string encoding prefix: ${base64Url[0]}`);
    }
    base64Url = base64Url.slice(1);
    // Undo url-safe base64
    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if necessary
    while (base64.length % 4 !== 0) base64 += "=";
    // Decode
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }
}
