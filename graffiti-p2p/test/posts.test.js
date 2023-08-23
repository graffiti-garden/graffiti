import { describe, expect, assert, it } from 'vitest'
import GraffitiPosts from '../src/posts'

describe('Posts', async ()=> {

  it("Basic array stuff", ()=> {
    const posts = new GraffitiPosts(null, null, null, 1, 2, 3)
    expect(posts[0]).to.equal(1)
    expect(posts[1]).to.equal(2)
    expect(posts[2]).to.equal(3)
    expect(posts.length).to.equal(3)
  })

  it("No modification", ()=> {
    const posts = new GraffitiPosts(null, null, null, 1, 2, 3)
    expect(()=> posts.push(4)).toThrowError()
    expect(()=> posts.shift(4)).toThrowError()
    expect(()=> posts.unshift(4)).toThrowError()
    expect(()=> posts.slice(1)).toThrowError()
    expect(()=> posts.pop()).toThrowError()
    expect(()=> posts.sort()).toThrowError()
    expect(()=> posts.reverse()).toThrowError()
  })

  it("By and not by", ()=> {
    const actor1 = "alskdjfkdjf"
    const actor2 = "alsdkfjskdjfkdjf"
    const posts = new GraffitiPosts(null, null, null, {
      hello: "world",
      actor: actor1
    }, {
      goodbye: "world",
      actor: actor2
    }, {
      what: "oh no",
      actor: actor1
    })

    expect(posts.by(actor2).length).to.equal(1)
    expect(posts.by(actor2)[0].goodbye).to.equal("world")

    expect(posts.by(actor1).length).to.equal(2)
    expect(posts.by(actor1)[0].hello).to.equal("world")
    expect(posts.by(actor1)[1].what).to.equal("oh no")

    expect(posts.notBy("alksdjf").length).to.equal(3)

    expect(posts.notBy(actor1).length).to.equal(1)
    expect(posts.notBy(actor1)[0].goodbye).to.equal("world")

    expect(posts.notBy(actor2).length).to.equal(2)
    expect(posts.notBy(actor2)[0].hello).to.equal("world")
    expect(posts.notBy(actor2)[1].what).to.equal("oh no")

    expect(posts.by(actor1, "aksdjf", actor2).length).to.equal(3)
    expect(posts.notBy(actor1, "aksdjf", actor2).length).to.equal(0)
  })

  it("actors", ()=> {
    const actor1 = "chip"
    const actor2 = "dale"
    const actor3 = "nuts"
    const posts = new GraffitiPosts(null, null, null, {
      actor: actor1
    }, {
      actor: actor1
    }, {
      actor: actor3
    }, {
      actor: actor3
    }, {
      actor: actor1
    }, {
      actor: actor2
    }, {
      actor: actor2
    }, {
      actor: actor1
    })

    expect(posts.actors.length).to.equal(3)
    assert(posts.actors.includes(actor1))
    assert(posts.actors.includes(actor2))
    assert(posts.actors.includes(actor3))

    expect(posts.by(actor1).actors.length).to.equal(1)
    expect(posts.by(actor1).actors[0]).to.equal(actor1)

    expect(posts.notBy(actor1).actors.length).to.equal(2)
    assert(posts.notBy(actor1).actors.includes(actor2))
    assert(posts.notBy(actor1).actors.includes(actor3))
  })

  it("sortBy", ()=> {
    const posts = new GraffitiPosts(null, null, null, {
      s: 4
    }, {
      s: 10
    }, {
      s: 2 
    }, {
      s: -199 
    }, {
      s: 0.001
    }, {
      s: 0
    })

    const sorted = posts.sortBy("s")
    const mapped = sorted.map(p=>p.s)
    expect(mapped[0]).to.equal(-199)
    expect(mapped[1]).to.equal(0)
    expect(mapped[2]).to.equal(0.001)
    expect(mapped[3]).to.equal(2)

    const reversed = posts.sortBy("-s")
    const mapped2 = reversed.map(p=>p.s)
    expect(mapped2[0]).to.equal(10)
    expect(mapped2[1]).to.equal(4)
    expect(mapped2[2]).to.equal(2)
    expect(mapped2[3]).to.equal(0.001)
  })

  it("sortBy strings", ()=> {
    // TODO
  })

  it("sortBy nested", ()=> {
    // TODO
  })

  it("groupBy", ()=> {
    // TODO
  })

  it("post", ()=> {
    // TODO
  })
})