import { describe, it, expect } from 'vitest'
import { fileLink, fileLinkCallback } from "../extensions/files"

describe('Files', ()=> {

  it('create link', async ()=> {
    const before = Date.now()
    const content = "hello world"
    const name = "foo.txt"
    const mime = "text/plain"
    const file = new File([content], name, { type: mime })
    const after = Date.now()

    const [source, target] = await fileLink(file)

    expect(source.type).toEqual('FileReference')
    expect(source.name).toEqual(name)
    expect(source.mime).toEqual(mime)

    expect(target.type).toEqual('File')
    expect(target.name).toEqual(name)

    expect(source.lastModified).toBeGreaterThanOrEqual(before)
    expect(source.lastModified).toBeLessThanOrEqual(after)
    expect(source.lastModified).toEqual(target.lastModified)

    expect(source.size).toEqual(content.length)
  })

  it('create link and fetch', async ()=> {
    const content = "hello world!"
    const name = "foo.txt"
    const mime = "text/plain"
    const file = new File([content], name, { type: mime })

    const [source, target] = await fileLink(file)

    let calledBack = false
    const callback = fileLinkCallback(source, async f=> {
      calledBack = true
      expect(f.name).toEqual(file.name)
      expect(f.lastModified).toEqual(file.lastModified)
      expect(f.size).toEqual(file.size)
      expect(f.type).toEqual(file.type)
      expect(await f.text()).toEqual(content)
    })

    await callback({ target })
    expect(calledBack).toEqual(true)
  })

  it('bad file reference', async ()=> {
    const source = {
      type: 'FileReference'
      // Missing the rest of the stuff
    }
    expect(()=> fileLinkCallback(source, ()=>{})).toThrowError()
  })

  it('invalid file schema', async ()=> {
    const callback = fileLinkCallback({
      type: 'FileReference',
      name: 'something.txt',
      mime: 'text/plain',
      hash: 'salsdkfjkdfj',
      size: 0,
      lastModified: 0
    }, ()=> {})

    expect(callback({ target: { type: 'Note' } })).rejects.toThrowError()
  })

  for (const [title, modification] of [
    ['hash', source=> {
      if (source.hash[0] == 'a') {
        source.hash = 'b' + source.hash.slice(1)
      } else {
        source.hash = 'a' + source.hash.slice(1)
      }
    }],
    ['name', source=> source.name = 'alskdjfkdj'],
    ['mimetype', source=> source.mime = 'image/png'],
    ['size', source=> source.size++],
    ['lastModified', source=> source.lastModified++]
  ]) {
    it(`${title} mismatch`, async ()=> {
      const content = "asldkfjkdfj"
      const name = "foo.txt"
      const mime = "text/plain"
      const file = new File([content], name, { type: mime })
      const [source, target] = await fileLink(file)

      modification(source)

      let calledBack = false
      const callback = fileLinkCallback(source, async f=> {
        calledBack = true
      })

      await expect(callback({ target })).rejects.toThrowError()
      expect(calledBack).toEqual(false)
    })
  }
})