import { describe, expect, it } from 'vitest'
import { sha256Hex, subdomainURL, websocketURL } from '../src/util'

describe('Util', ()=> {
  it('Sha 256', () => {
    expect(sha256Hex('something'))
    .resolves.to.equal("3fc9b689459d738f8c88a3a48aa9e33542016b7a4052e001aaa536fca74813cb")
  })
})