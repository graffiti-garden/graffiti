import WebTorrent from 'https://cdn.jsdelivr.net/npm/webtorrent@2.0.15/dist/webtorrent.min.js'
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7.1.1/+esm'

// Thanks to
// https://github.com/ThaUnknown/pwa-haven/blob/main/torrent-client/src/modules/client.js

export default class TorrentMedia {
  constructor() {
    this.cacheNS = 'torrent-data'
    this.lockEvents = new EventTarget() 

    this.wt = new WebTorrent()

    this.urlCache = {}
    this.urlWaiters = {}
    this.torrentWaiters = {}

    this._initialized = false
    const { release, wait } = this.#lock()
    this._initializeWaiter = wait
    this.#initialize(release)
  }

  async #initialized() {
    if (this._initialized) return
    return await this._initializeWaiter
  }

  async store(file) {
    await this.#initialized()
    const { release, wait } = this.#lock()
    this.wt.seed(file, this.opts, torrent=> {
      this.#cache(torrent)
      release(torrent)
    })
    return (await wait).magnetURI
  }

  async fetch(torrentReference) {
    await this.#initialized()
    const wtf = await this.#fetchTorrentFile(torrentReference)
    return await wtf.blob()
  }

  async fetchURL(torrentReference) {
    if (torrentReference in this.urlCache)
      return this.urlCache[torrentReference]

    if (torrentReference in this.urlWaiters)
      return await this.urlWaiters[torrentReference]

    // Lock so fetch only happens once
    const { release, wait } = this.#lock()
    this.urlWaiters[torrentReference] = wait

    // Get the blob
    const blob = await this.fetch(torrentReference)
    const url = URL.createObjectURL(blob)

    // Set and release
    this.urlCache[torrentReference] = url
    release(url)
    delete this.urlWaiters[torrentReference]
    return url
  }

  async #initialize(release) {
    // A cache of downloaded torrent files
    this.db = await openDB('graffiti', 1, {
      upgrade: db=> {
        db.createObjectStore(this.cacheNS)
      }
    })

    // Fetch existing torrent from cache and seed
    const fetches = []
    for (const hash of await this.db.getAllKeys(this.cacheNS)) {
      const torrentData = await this.db.get(this.cacheNS, hash)
      await this.#fetchTorrentFile(new Blob([torrentData]))
    }

    this._initialized = true
    release()
  }

  async #cache(torrent) {
    await this.db.put(this.cacheNS, torrent.torrentFile, torrent.infoHash)
  }

  async #fetchTorrentFile(torrentReference) {
    const cachedTorrent = await this.wt.get(torrentReference)
    if (cachedTorrent) return cachedTorrent.files[0]

    if (!(torrentReference in this.torrentWaiters)) {
      const { release, wait } = this.#lock()
      this.torrentWaiters[torrentReference] = wait

      const torrent = this.wt.add(torrentReference, this.opts, torrent=> {
        this.#cache(torrent)
        release(torrent)
        delete this.torrentWaiters[torrentReference]
      })

      torrent.once('error', err=> {
        release(err)
        delete this.torrentWaiters[torrentReference]
      })
    }

    const result = await this.torrentWaiters[torrentReference]
    if (result instanceof Error) {
      throw result
    } else {
      return result.files[0]
    }
  }

  #lock() {
    const random = crypto.randomUUID()

    return {
      release: data=> {
        const messageEvent = new Event(random)
        messageEvent.data = data
        this.lockEvents.dispatchEvent(messageEvent)
      },

      wait: new Promise(resolve => {
        this.lockEvents.addEventListener(
          random,
          e=> resolve(e.data),
          { once: true, passive: true }
        )
      })
    }
  }
}
