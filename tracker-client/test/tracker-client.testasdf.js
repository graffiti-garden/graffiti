import { describe, expect, it } from 'vitest'
import TrackerSingle from '../tracker-client'

describe('Tracker Client Full', ()=> {
  // publish to one tracker but not the other

  it('Basic construction', ()=>{
    const tc = new TrackerClient(
      peerProof,
      "https://theias.place",
      "https://graffiti.garden")

    const tc2 = new TrackerClient(
      peerProof,
      "https://graffiti.garden")

    tc2.announce("something")
  })
})