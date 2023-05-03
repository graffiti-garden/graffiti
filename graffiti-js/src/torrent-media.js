import WebTorrent from 'https://cdn.jsdelivr.net/npm/webtorrent@2.0.15/dist/webtorrent.min.js'
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7.1.1/+esm'

// Thanks to
// https://github.com/ThaUnknown/pwa-haven/blob/main/torrent-client/src/modules/client.js

export default class TorrentMedia {
  constructor() {
    this.cacheNS = 'torrent-data'
    this.lockEvents = new EventTarget() 

    this.wt = new WebTorrent()

    this._initialized = false
    const { release, wait } = this.#lock()
    this._initializeWaiter = wait
    this.#initialize(release)
  }

  async #initialized() {
    if (this._initialized) return
    return await this._initializeWaiter()
  }

  async store(file) {
    await this.#initialized()
    const { release, wait } = this.#lock()
    this.wt.seed(file, this.opts, torrent=> {
      this.#cache(torrent)
      release(torrent)
    })
    return (await wait()).magnetURI
  }

  async fetch(torrentReference) {
    await this.#initialized()
    const wtf = await this.#fetchTorrentFile(torrentReference)
    return await wtf.blob()
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
      try {
        await this.#fetchTorrentFile(new Blob([torrentData]))
      } catch {
        await this.db.delete(this.cacheNS, hash)
      }
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

    const { release, wait } = this.#lock()
    const torrent = this.wt.add(torrentReference, this.opts, torrent=> {
      this.#cache(torrent)
      release(torrent)
    })

    torrent.once('error', err=> release(err))

    const result = await wait()
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

      wait: async ()=> {
        return await new Promise(resolve => {
          this.lockEvents.addEventListener(
            random,
            e=> resolve(e.data),
            { once: true, passive: true }
          )
        })
      }
    }
  }
}
