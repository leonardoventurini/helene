import { Collection, createCollection } from '@helenejs/data'
import { BrowserStorage } from '@helenejs/data/lib/browser'
import { expect } from 'chai'

describe('Helene Data', function () {
  describe('Local Storage', () => {
    let collection: Collection

    before(async () => {
      Error.stackTraceLimit = Infinity

      collection = await createCollection({
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

      const collection2 = await createCollection({
        name: 'test',
        storage: new BrowserStorage(),
        autoload: true,
      })

      const docs = await collection2.find()

      expect(docs).to.have.length(10)
    })
  })
})
