export const PUT_VERSION = new Uint8Array([0])

export const STREAM_RECONNECT_TIMEOUT = 2000
export const STREAM_VERSION = new Uint8Array([0])

export const INFO_HASH_PREFIX = 'i'
export const CIPHER_PREFIX = 'c'

export const STREAM_REQUEST_CODES = {
  SUBSCRIBE:   1,
  UNSUBSCRIBE: 0
}

export const STREAM_RESPONSE_HEADERS = {
  ANNOUNCE:         0,
  SUCCESS:          1,
  ERROR_WITH_ID:    2,
  ERROR_WITHOUT_ID: 3,
}