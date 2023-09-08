import { describe, expect, assert, it } from 'vitest'
import GraffitiPosts from '../src/posts'

describe('Posts', async ()=> {

  it("Basic array stuff", ()=> {
    const posts = new GraffitiPosts(null, null, 1, 2, 3)
    expect(posts[0]).to.equal(1)
    expect(posts[1]).to.equal(2)
    expect(posts[2]).to.equal(3)
    expect(posts.length).to.equal(3)
  })

  it("No modification", ()=> {
    const posts = new GraffitiPosts(null, null, 1, 2, 3)
    expect(()=> posts.push(4)).toThrowError()
    expect(()=> posts.shift(4)).toThrowError()
    expect(()=> posts.unshift(4)).toThrowError()
    expect(()=> posts.slice(1)).toThrowError()
    expect(()=> posts.pop()).toThrowError()
    expect(()=> posts.sort()).toThrowError()
    expect(()=> posts.reverse()).toThrowError()
  })

  it("force modification", ()=> {
    const posts = new GraffitiPosts(null, null, 1, 2, 3)
    expect(posts.length).toEqual(3)
    posts.forcePush(7)
    expect(posts.length).toEqual(4)
    expect(posts[3]).toEqual(7)
    expect(posts.forcePop()).toEqual(7)
    expect(posts.length).toEqual(3)
    posts.forceReverse()
    expect(posts[0]).toEqual(3)
    expect(posts[1]).toEqual(2)
    expect(posts[2]).toEqual(1)
  })

  it("By and not by", ()=> {
    const actor1 = "alskdjfkdjf"
    const actor2 = "alsdkfjskdjfkdjf"
    const posts = new GraffitiPosts(null, null, {
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
    const posts = new GraffitiPosts(null, null, {
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
    const posts = new GraffitiPosts(null, null, {
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
    const posts = new GraffitiPosts(null, null, {
      s: "b"
    }, {
      s: "a"
    }, {
      s: "x"
    }, {
      s: "d"
    })

    const sorted = posts.sortBy("s")
    const mapped = sorted.map(p=>p.s)
    expect(mapped[0]).to.equal("a")
    expect(mapped[1]).to.equal("b")
    expect(mapped[2]).to.equal("d")
    expect(mapped[3]).to.equal("x")

    const reversed = posts.sortBy("-s")
    const mapped2 = reversed.map(p=>p.s)
    expect(mapped2[0]).to.equal("x")
    expect(mapped2[1]).to.equal("d")
    expect(mapped2[2]).to.equal("b")
    expect(mapped2[3]).to.equal("a")
  })

  it("sortBy nested", ()=> {
    const inputs = [1, 10, 5, 7, -9]
    const posts = new GraffitiPosts(null, null, 
      ...inputs.map(i=>({
        something: {
          really: {
            deep: i
          }
        }
      }))
    )

    const sorted = posts.sortBy("something.really.deep")
    const mapped = sorted.map(p=>p.something.really.deep)
    expect(mapped[0]).to.equal(-9)
    expect(mapped[1]).to.equal(1)
    expect(mapped[2]).to.equal(5)
    expect(mapped[3]).to.equal(7)
    expect(mapped[4]).to.equal(10)

    const sorted2 = posts.sortBy("-something.really.deep")
    const mapped2 = sorted2.map(p=>p.something.really.deep)
    expect(mapped2[0]).to.equal(10)
    expect(mapped2[1]).to.equal(7)
    expect(mapped2[2]).to.equal(5)
    expect(mapped2[3]).to.equal(1)
    expect(mapped2[4]).to.equal(-9)
  })

  it("sortBy invalid", ()=> {
    const posts = new GraffitiPosts(null, null, {
      something: true,
    }, {
      without: 1
    }, {
      structure: "asdf"
    })

    expect(()=> posts.sortBy("something.really.deep")).toThrowError()
  })

  it("groupBy", ()=> {
    const actor1 = "laura les"
    const actor2 = "dylan brady"
    const actor3 = "sophie"
    const posts = new GraffitiPosts(null, null, {
      hello: "world",
      actor: actor2
    }, {
      what: "is up",
      actor: actor1
    }, {
      something: "else",
      actor: actor3
    }, {
      kinda: "cool",
      actor: actor2
    }, {
      foo: "bar",
      actor: actor1
    }, {
      all: "done",
      actor: actor1
    })

    const grouped = posts.groupBy("actor")
    expect(grouped[actor1].length).to.equal(3)
    expect(grouped[actor2].length).to.equal(2)
    expect(grouped[actor3].length).to.equal(1)
    expect(grouped[actor1].actors.length).to.equal(1)
    expect(grouped[actor2].actors.length).to.equal(1)
    expect(grouped[actor3].actors.length).to.equal(1)
  })

  it("post filtering", async ()=> {
    const posts = new GraffitiPosts({
      async post(object, actor) {
        return object
      }
    })

    const postsFiltered = posts.filter(p=> p.type == "Banana")

    expect(postsFiltered.post({
      something: "cool",
      type: "Banana"
    })).resolves.toBeTruthy()

    expect(postsFiltered.post({
      something: "uncool",
      type: "Orange"
    })).rejects.toThrowError()
  })

  it("post filtering nested", async ()=> {
    const posts = new GraffitiPosts({
      async post(object, actor) {
        return object
      }
    })

    const postsFiltered = posts.filter(p=> p.type == "Banana")
    const postsFiltered2 = postsFiltered.filter(p=> typeof p.content == "string")

    expect(postsFiltered2.post({
      content: 100,
      type: "Banana"
    })).rejects.toThrowError()

    expect(postsFiltered2.post({
      content: "something",
      type: "Orange"
    })).rejects.toThrowError()

    expect(postsFiltered2.post({
      content: "something",
      type: "Banana"
    })).resolves.toBeTruthy()
  })

  it("post valid context", ()=> {
    const context = "the-cool-place"
    const posts = new GraffitiPosts({
      async post(object, actor) {
        return object
      }
    }, context)

    expect(posts.post({
      context: ["something", context, "something else"]
    })).resolves.toBeTypeOf("object")
  })

  it("post invalid context", ()=> {
    const context = "the-cool-place"
    const posts = new GraffitiPosts({
      async post(object, actor) {
        return object
      }
    }, context)

    expect(posts.post({
      context: ["something", "something else"]
    })).rejects.toThrowError()
  })

  it("post filter by actor", ()=> {
    const actor1 = "kendrick"
    const actor2 = "sza"

    const posts = new GraffitiPosts({
      async post(object, actor) {
        return object
      }
    })

    expect(posts.by(actor1).post({}, actor1)).resolves.toBeTruthy()
    expect(posts.by(actor2).post({}, actor1)).rejects.toThrowError()
    expect(posts.notBy(actor1).post({}, actor2)).resolves.toBeTruthy()
    expect(posts.notBy(actor1).post({}, actor1)).rejects.toThrowError()
  })

  it("post after groupBy", ()=> {
    const posts = new GraffitiPosts({
      async post(object, actor) {
        return object
      }
    }, null, {
      tag: "cool"
    }, {
      tag: "uncool"
    })

    const grouped = posts.groupBy("tag")
    expect(Object.keys(grouped).length).to.equal(2)
    assert(Object.keys(grouped).includes("cool"))
    assert(Object.keys(grouped).includes("uncool"))

    expect(grouped["cool"].post({
      really: {
        really: "cool"
      },
      tag: "cool"
    })).resolves.toBeTruthy()

    expect(grouped["uncool"].post({
      really: {
        really: "cool"
      },
      tag: "cool"
    })).rejects.toThrowError()
  })
})