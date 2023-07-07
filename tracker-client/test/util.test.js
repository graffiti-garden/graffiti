import { describe, expect, it } from 'vitest'
import { sha256Hex, subdomainURL, websocketURL } from '../src/util'

describe('Util', ()=> {
  it('Sha 256', () => {
    expect(sha256Hex('something'))
    .resolves.to.equal("3fc9b689459d738f8c88a3a48aa9e33542016b7a4052e001aaa536fca74813cb")
  })

  it('Subdomain URL', ()=> {
    expect(subdomainURL("https://example.com/", "1234"))
    .to.equal("https://1234.example.com/")
  })

  it('Websocket URL http', ()=> {
    expect(websocketURL("http://example.com/"))
    .to.equal("ws://example.com/")
  })

  it('Websocket URL https', ()=> {
    expect(websocketURL("https://something.example.com/"))
    .to.equal("wss://something.example.com/")
  })
})