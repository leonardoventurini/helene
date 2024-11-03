import { Collection, createCollection } from '@helenejs/data'
import { BrowserStorage, OPFSStorage } from '@helenejs/data/lib/browser'
import { expect } from 'chai'
import { sleep } from '@helenejs/utils'

type Test = { _id: number; name: string }

describe('Helene Data', function () {
  describe('Local Storage', () => {
    let collection: Collection<Test>

    before(async () => {
      Error.stackTraceLimit = Infinity

      collection = await createCollection<Test>({
        name: 'test',
        storage: new BrowserStorage(),
      })
    })

    it('inserting & finding', async () => {
      for (let i = 0; i <= 9; i++) {
        await collection.insert({ _id: i, name: `test_${i}` })
      }

      const data = localStorage.getItem('helene:data:test')

      expect(data).to.include('test_0')
      expect(data).to.include('test_9')

      const collection2 = await createCollection<Test>({
        name: 'test',
        storage: new BrowserStorage(),
        autoload: true,
      })

      const docs = await collection2.find()

      expect(docs).to.have.length(10)
    })
  })

  describe('OPFS Storage', () => {
    let collection: Collection<Test>

    before(async () => {
      Error.stackTraceLimit = Infinity

      collection = await createCollection<Test>({
        name: 'test',
        storage: new OPFSStorage(),
      })
    })

    it('inserting & finding', async () => {
      for (let i = 0; i <= 9; i++) {
        await collection.insert({ _id: i, name: `test_${i}` })
      }

      await sleep(100)

      const dirHandle = await navigator.storage.getDirectory()
      const fileHandle = await dirHandle.getFileHandle('helene:data:test')
      const file = await fileHandle.getFile()
      const data = await file.text()

      expect(data).to.include('test_0')
      expect(data).to.include('test_9')

      const collection2 = await createCollection<Test>({
        name: 'test',
        storage: new OPFSStorage(),
        autoload: true,
      })

      const docs = await collection2.find()

      expect(docs).to.have.length(10)
    })
  })
})
