import WebTorrent from 'https://cdn.jsdelivr.net/npm/webtorrent@2.0.15/dist/webtorrent.min.js'
import HybridChunkStore from 'https://cdn.jsdelivr.net/npm/hybrid-chunk-store@1.2.0/+esm'
// TODO
// See if this can be done with native indexdb
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7/+esm'

// Thanks to
// https://github.com/ThaUnknown/pwa-haven/blob/main/torrent-client/src/modules/client.js

export default class TorrentMedia {
  constructor() {
    // TODO: is manual hybridchunkstore still necessary?
    this.opts = {
      storeCacheSlots: 0,
      store: HybridChunkStore,
    }
    this.cacheNS = 'torrent-data'
    this.lockEvents = new EventTarget() 

    this.wt = new WebTorrent()

    this.#initialize()
  }

  async #initialize() {
    // A cache of downloaded torrent files
    this.db = await openDB('graffiti', 1, {
      upgrade: db=> {
        db.createObjectStore(this.cacheNS)
      }
    })

    // Fetch existing torrent from cache and seed
    for (const hash of await this.db.getAllKeys(this.cacheNS)) {
      const torrentData = await this.db.get(this.cacheNS, hash)
      this.fetchTorrentFile(new Blob([torrentData]))
    }
  }

  async cache(torrent) {
    await this.db.put(this.cacheNS, torrent.torrentFile, torrent.infoHash)
  }

  async store(file) {
    const { release, wait } = this.lock()
    this.wt.seed(file, this.opts, torrent=> {
      this.cache(torrent)
      release(torrent)
    })
    return (await wait()).magnetURI
  }

  async fetchTorrentFile(torrentReference) {
    const cachedTorrent = await this.wt.get(torrentReference)
    if (cachedTorrent) return cachedTorrent.files[0]

    const { release, wait } = this.lock()
    this.wt.add(torrentReference, this.opts, torrent=> {
      this.cache(torrent)
      release(torrent)
    })
    return (await wait()).files[0]
  }

  async fetchBlob(torrentReference) {
    const wtf = await this.fetchTorrentFile(torrentReference)
    return await wtf.blob()
  }

  async fetchBlobURL(torrentReference) {
    const blob = await this.fetchBlob(torrentReference)
    return window.URL.createObjectURL(blob)
  }

  lock() {
    const random = crypto.randomUUID()

    return {
      release: data=> {
        const messageEvent = new Event(random)
        messageEvent.data = data
        this.lockEvents.dispatchEvent(messageEvent)
      },

      wait: async ()=> {
        return await new Promise(resolve => {
          this.lockEvents.addEventListener(random, (e) => {
            resolve(e.data)
          })
        })
      }
    }
  }
}
