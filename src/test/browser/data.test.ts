import { Collection, createCollection } from '../../data'
import { BrowserStorage } from '../../data/browser/browser-storage'
import { expect, describe, it, beforeAll } from 'vitest'

type Test = { _id: number; name: string }

describe('Helene Data', function () {
  describe('Local Storage', () => {
    let collection: Collection<Test>

    beforeAll(async () => {
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
})
