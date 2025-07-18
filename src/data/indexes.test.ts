import { assert, expect, describe, it } from 'vitest'
import { Index } from './indexes'

describe('Indexes', function () {
  describe('Insertion', function () {
    it('Can insert pointers to documents in the index correctly when they have the field', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)

      // The underlying BST now has 3 nodes which contain the docs where it's expected
      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      assert.deepEqual(idx.tree.search('hello'), [{ a: 5, tf: 'hello' }])
      assert.deepEqual(idx.tree.search('world'), [{ a: 8, tf: 'world' }])
      assert.deepEqual(idx.tree.search('bloup'), [{ a: 2, tf: 'bloup' }])

      // The nodes contain pointers to the actual documents
      expect(idx.tree.search('world')[0]).toEqual(doc2)
      idx.tree.search('bloup')[0].a = 42
      expect(doc3.a).toEqual(42)
    })

    it('Inserting twice for the same fieldName in a unique index will result in an error thrown', function () {
      const idx = new Index({ fieldName: 'tf', unique: true }),
        doc1 = { a: 5, tf: 'hello' }
      idx.insert(doc1)
      expect(idx.tree.getNumberOfKeys()).toEqual(1)
      expect(() => {
        idx.insert(doc1)
      }).toThrow()
    })

    it('Inserting twice for a fieldName the docs dont have with a unique index results in an error thrown', function () {
      const idx = new Index({ fieldName: 'nope', unique: true }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 5, tf: 'world' }
      idx.insert(doc1)
      expect(idx.tree.getNumberOfKeys()).toEqual(1)
      expect(() => {
        idx.insert(doc2)
      }).toThrow()
    })

    it('Inserting twice for a fieldName the docs dont have with a unique and sparse index will not throw, since the docs will be non indexed', function () {
      const idx = new Index({ fieldName: 'nope', unique: true, sparse: true }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 5, tf: 'world' }
      idx.insert(doc1)
      idx.insert(doc2)
      expect(idx.tree.getNumberOfKeys()).toEqual(0) // Docs are not indexed
    })

    it('Works with dot notation', function () {
      const idx = new Index({ fieldName: 'tf.nested' }),
        doc1 = { a: 5, tf: { nested: 'hello' } },
        doc2 = { a: 8, tf: { nested: 'world', additional: true } },
        doc3 = { a: 2, tf: { nested: 'bloup', age: 42 } }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)

      // The underlying BST now has 3 nodes which contain the docs where it's expected
      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      assert.deepEqual(idx.tree.search('hello'), [doc1])
      assert.deepEqual(idx.tree.search('world'), [doc2])
      assert.deepEqual(idx.tree.search('bloup'), [doc3])

      // The nodes contain pointers to the actual documents
      idx.tree.search('bloup')[0].a = 42
      expect(doc3.a).toEqual(42)
    })

    it('Can insert an array of documents', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' }
      idx.insert([doc1, doc2, doc3])
      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      assert.deepEqual(idx.tree.search('hello'), [doc1])
      assert.deepEqual(idx.tree.search('world'), [doc2])
      assert.deepEqual(idx.tree.search('bloup'), [doc3])
    })

    it('When inserting an array of elements, if an error is thrown all inserts need to be rolled back', function () {
      const idx = new Index({ fieldName: 'tf', unique: true }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc2b = { a: 84, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' }
      try {
        idx.insert([doc1, doc2, doc2b, doc3])
      } catch (e) {
        expect(e.errorType).toEqual('uniqueViolated')
      }
      expect(idx.tree.getNumberOfKeys()).toEqual(0)
      assert.deepEqual(idx.tree.search('hello'), [])
      assert.deepEqual(idx.tree.search('world'), [])
      assert.deepEqual(idx.tree.search('bloup'), [])
    })

    describe('Array fields', function () {
      it('Inserts one entry per array element in the index', function () {
        const obj = { tf: ['aa', 'bb'], really: 'yeah' },
          obj2 = { tf: 'normal', yes: 'indeed' },
          idx = new Index({ fieldName: 'tf' })
        idx.insert(obj)
        expect(idx.getAll().length).toEqual(2)
        expect(idx.getAll()[0]).toEqual(obj)
        expect(idx.getAll()[1]).toEqual(obj)

        idx.insert(obj2)
        expect(idx.getAll().length).toEqual(3)
      })

      it('Inserts one entry per array element in the index, type-checked', function () {
        const obj = { tf: ['42', 42, new Date(42), 42], really: 'yeah' },
          idx = new Index({ fieldName: 'tf' })
        idx.insert(obj)
        expect(idx.getAll().length).toEqual(3)
        expect(idx.getAll()[0]).toEqual(obj)
        expect(idx.getAll()[1]).toEqual(obj)
        expect(idx.getAll()[2]).toEqual(obj)
      })

      it('Inserts one entry per unique array element in the index, the unique constraint only holds across documents', function () {
        const obj = { tf: ['aa', 'aa'], really: 'yeah' },
          obj2 = { tf: ['cc', 'yy', 'cc'], yes: 'indeed' },
          idx = new Index({ fieldName: 'tf', unique: true })
        idx.insert(obj)
        expect(idx.getAll().length).toEqual(1)
        expect(idx.getAll()[0]).toEqual(obj)

        idx.insert(obj2)
        expect(idx.getAll().length).toEqual(3)
      })

      it('The unique constraint holds across documents', function () {
        const obj = { tf: ['aa', 'aa'], really: 'yeah' },
          obj2 = { tf: ['cc', 'aa', 'cc'], yes: 'indeed' },
          idx = new Index({ fieldName: 'tf', unique: true })
        idx.insert(obj)
        expect(idx.getAll().length).toEqual(1)
        expect(idx.getAll()[0]).toEqual(obj)
        expect(() => {
          idx.insert(obj2)
        }).toThrow()
      })

      it('When removing a document, remove it from the index at all unique array elements', function () {
        const obj = { tf: ['aa', 'aa'], really: 'yeah' },
          obj2 = { tf: ['cc', 'aa', 'cc'], yes: 'indeed' },
          idx = new Index({ fieldName: 'tf' })
        idx.insert(obj)
        idx.insert(obj2)
        expect(idx.getMatching('aa').length).toEqual(2)
        expect(idx.getMatching('aa').indexOf(obj)).not.toEqual(-1)
        expect(idx.getMatching('aa').indexOf(obj2)).not.toEqual(-1)
        expect(idx.getMatching('cc').length).toEqual(1)

        idx.remove(obj2)
        expect(idx.getMatching('aa').length).toEqual(1)
        expect(idx.getMatching('aa').indexOf(obj)).not.toEqual(-1)
        expect(idx.getMatching('aa').indexOf(obj2)).toEqual(-1)
        expect(idx.getMatching('cc').length).toEqual(0)
      })

      it('If a unique constraint is violated when inserting an array key, roll back all inserts before the key', function () {
        const obj = { tf: ['aa', 'bb'], really: 'yeah' },
          obj2 = { tf: ['cc', 'dd', 'aa', 'ee'], yes: 'indeed' },
          idx = new Index({ fieldName: 'tf', unique: true })
        idx.insert(obj)
        expect(idx.getAll().length).toEqual(2)
        expect(idx.getMatching('aa').length).toEqual(1)
        expect(idx.getMatching('bb').length).toEqual(1)
        expect(idx.getMatching('cc').length).toEqual(0)
        expect(idx.getMatching('dd').length).toEqual(0)
        expect(idx.getMatching('ee').length).toEqual(0)
        expect(() => {
          idx.insert(obj2)
        }).toThrow()
        expect(idx.getAll().length).toEqual(2)
        expect(idx.getMatching('aa').length).toEqual(1)
        expect(idx.getMatching('bb').length).toEqual(1)
        expect(idx.getMatching('cc').length).toEqual(0)
        expect(idx.getMatching('dd').length).toEqual(0)
        expect(idx.getMatching('ee').length).toEqual(0)
      })
    }) // ==== End of 'Array fields' ==== //
  }) // ==== End of 'Insertion' ==== //

  describe('Removal', function () {
    it('Can remove pointers from the index, even when multiple documents have the same key', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' },
        doc4 = { a: 23, tf: 'world' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      idx.insert(doc4)
      expect(idx.tree.getNumberOfKeys()).toEqual(3)

      idx.remove(doc1)
      expect(idx.tree.getNumberOfKeys()).toEqual(2)
      expect(idx.tree.search('hello').length).toEqual(0)

      idx.remove(doc2)
      expect(idx.tree.getNumberOfKeys()).toEqual(2)
      expect(idx.tree.search('world').length).toEqual(1)
      expect(idx.tree.search('world')[0]).toEqual(doc4)
    })

    it('If we have a sparse index, removing a non indexed doc has no effect', function () {
      const idx = new Index({ fieldName: 'nope', sparse: true }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 5, tf: 'world' }
      idx.insert(doc1)
      idx.insert(doc2)
      expect(idx.tree.getNumberOfKeys()).toEqual(0)

      idx.remove(doc1)
      expect(idx.tree.getNumberOfKeys()).toEqual(0)
    })

    it('Works with dot notation', function () {
      const idx = new Index({ fieldName: 'tf.nested' }),
        doc1 = { a: 5, tf: { nested: 'hello' } },
        doc2 = { a: 8, tf: { nested: 'world', additional: true } },
        doc3 = { a: 2, tf: { nested: 'bloup', age: 42 } },
        doc4 = { a: 2, tf: { nested: 'world', fruits: ['apple', 'carrot'] } }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      idx.insert(doc4)
      expect(idx.tree.getNumberOfKeys()).toEqual(3)

      idx.remove(doc1)
      expect(idx.tree.getNumberOfKeys()).toEqual(2)
      expect(idx.tree.search('hello').length).toEqual(0)

      idx.remove(doc2)
      expect(idx.tree.getNumberOfKeys()).toEqual(2)
      expect(idx.tree.search('world').length).toEqual(1)
      expect(idx.tree.search('world')[0]).toEqual(doc4)
    })

    it('Can remove an array of documents', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' }
      idx.insert([doc1, doc2, doc3])
      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      idx.remove([doc1, doc3])
      expect(idx.tree.getNumberOfKeys()).toEqual(1)
      assert.deepEqual(idx.tree.search('hello'), [])
      assert.deepEqual(idx.tree.search('world'), [doc2])
      assert.deepEqual(idx.tree.search('bloup'), [])
    })
  }) // ==== End of 'Removal' ==== //

  describe('Update', function () {
    it('Can update a document whose key did or didnt change', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' },
        doc4 = { a: 23, tf: 'world' },
        doc5 = { a: 1, tf: 'changed' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      assert.deepEqual(idx.tree.search('world'), [doc2])

      idx.update(doc2, doc4)
      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      assert.deepEqual(idx.tree.search('world'), [doc4])

      idx.update(doc1, doc5)
      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      assert.deepEqual(idx.tree.search('hello'), [])
      assert.deepEqual(idx.tree.search('changed'), [doc5])
    })

    it('If a simple update violates a unique constraint, changes are rolled back and an error thrown', function () {
      const idx = new Index({ fieldName: 'tf', unique: true }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' },
        bad = { a: 23, tf: 'world' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      assert.deepEqual(idx.tree.search('hello'), [doc1])
      assert.deepEqual(idx.tree.search('world'), [doc2])
      assert.deepEqual(idx.tree.search('bloup'), [doc3])

      try {
        idx.update(doc3, bad)
      } catch (e) {
        expect(e.errorType).toEqual('uniqueViolated')
      }

      // No change
      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      assert.deepEqual(idx.tree.search('hello'), [doc1])
      assert.deepEqual(idx.tree.search('world'), [doc2])
      assert.deepEqual(idx.tree.search('bloup'), [doc3])
    })

    it('Can update an array of documents', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' },
        doc1b = { a: 23, tf: 'world' },
        doc2b = { a: 1, tf: 'changed' },
        doc3b = { a: 44, tf: 'bloup' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      expect(idx.tree.getNumberOfKeys()).toEqual(3)

      idx.update([
        { oldDoc: doc1, newDoc: doc1b },
        { oldDoc: doc2, newDoc: doc2b },
        { oldDoc: doc3, newDoc: doc3b },
      ])

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      expect(idx.getMatching('world').length).toEqual(1)
      expect(idx.getMatching('world')[0]).toEqual(doc1b)
      expect(idx.getMatching('changed').length).toEqual(1)
      expect(idx.getMatching('changed')[0]).toEqual(doc2b)
      expect(idx.getMatching('bloup').length).toEqual(1)
      expect(idx.getMatching('bloup')[0]).toEqual(doc3b)
    })

    it('If a unique constraint is violated during an array-update, all changes are rolled back and an error thrown', function () {
      const idx = new Index({ fieldName: 'tf', unique: true }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' },
        doc1b = { a: 23, tf: 'changed' },
        doc2b = { a: 1, tf: 'changed' }, // Will violate the constraint (first try)
        doc3b = { a: 44, tf: 'alsochanged' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      expect(idx.tree.getNumberOfKeys()).toEqual(3)

      try {
        idx.update([
          { oldDoc: doc1, newDoc: doc1b },
          { oldDoc: doc2, newDoc: doc2b },
          { oldDoc: doc3, newDoc: doc3b },
        ])
      } catch (e) {
        expect(e.errorType).toEqual('uniqueViolated')
      }

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      expect(idx.getMatching('hello').length).toEqual(1)
      expect(idx.getMatching('hello')[0]).toEqual(doc1)
      expect(idx.getMatching('world').length).toEqual(1)
      expect(idx.getMatching('world')[0]).toEqual(doc2)
      expect(idx.getMatching('bloup').length).toEqual(1)
      expect(idx.getMatching('bloup')[0]).toEqual(doc3)

      try {
        idx.update([
          { oldDoc: doc1, newDoc: doc1b },
          { oldDoc: doc2, newDoc: doc2b },
          { oldDoc: doc3, newDoc: doc3b },
        ])
      } catch (e) {
        expect(e.errorType).toEqual('uniqueViolated')
      }

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      expect(idx.getMatching('hello').length).toEqual(1)
      expect(idx.getMatching('hello')[0]).toEqual(doc1)
      expect(idx.getMatching('world').length).toEqual(1)
      expect(idx.getMatching('world')[0]).toEqual(doc2)
      expect(idx.getMatching('bloup').length).toEqual(1)
      expect(idx.getMatching('bloup')[0]).toEqual(doc3)
    })

    it('If an update doesnt change a document, the unique constraint is not violated', function () {
      const idx = new Index({ fieldName: 'tf', unique: true }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' },
        noChange = { a: 8, tf: 'world' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      assert.deepEqual(idx.tree.search('world'), [doc2])

      idx.update(doc2, noChange) // No error thrown
      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      assert.deepEqual(idx.tree.search('world'), [noChange])
    })

    it('Can revert simple and batch updates', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' },
        doc1b = { a: 23, tf: 'world' },
        doc2b = { a: 1, tf: 'changed' },
        doc3b = { a: 44, tf: 'bloup' },
        batchUpdate = [
          { oldDoc: doc1, newDoc: doc1b },
          { oldDoc: doc2, newDoc: doc2b },
          { oldDoc: doc3, newDoc: doc3b },
        ]
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      expect(idx.tree.getNumberOfKeys()).toEqual(3)

      idx.update(batchUpdate)

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      expect(idx.getMatching('world').length).toEqual(1)
      expect(idx.getMatching('world')[0]).toEqual(doc1b)
      expect(idx.getMatching('changed').length).toEqual(1)
      expect(idx.getMatching('changed')[0]).toEqual(doc2b)
      expect(idx.getMatching('bloup').length).toEqual(1)
      expect(idx.getMatching('bloup')[0]).toEqual(doc3b)

      idx.revertUpdate(batchUpdate)

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      expect(idx.getMatching('hello').length).toEqual(1)
      expect(idx.getMatching('hello')[0]).toEqual(doc1)
      expect(idx.getMatching('world').length).toEqual(1)
      expect(idx.getMatching('world')[0]).toEqual(doc2)
      expect(idx.getMatching('bloup').length).toEqual(1)
      expect(idx.getMatching('bloup')[0]).toEqual(doc3)

      // Now a simple update
      idx.update(doc2, doc2b)

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      expect(idx.getMatching('hello').length).toEqual(1)
      expect(idx.getMatching('hello')[0]).toEqual(doc1)
      expect(idx.getMatching('changed').length).toEqual(1)
      expect(idx.getMatching('changed')[0]).toEqual(doc2b)
      expect(idx.getMatching('bloup').length).toEqual(1)
      expect(idx.getMatching('bloup')[0]).toEqual(doc3)

      idx.revertUpdate(doc2, doc2b)

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      expect(idx.getMatching('hello').length).toEqual(1)
      expect(idx.getMatching('hello')[0]).toEqual(doc1)
      expect(idx.getMatching('world').length).toEqual(1)
      expect(idx.getMatching('world')[0]).toEqual(doc2)
      expect(idx.getMatching('bloup').length).toEqual(1)
      expect(idx.getMatching('bloup')[0]).toEqual(doc3)
    })
  }) // ==== End of 'Update' ==== //

  describe('Get matching documents', function () {
    it('Get all documents where fieldName is equal to the given value, or an empty array if no match', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' },
        doc4 = { a: 23, tf: 'world' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      idx.insert(doc4)

      assert.deepEqual(idx.getMatching('bloup'), [doc3])
      assert.deepEqual(idx.getMatching('world'), [doc2, doc4])
      assert.deepEqual(idx.getMatching('nope'), [])
    })

    it('Can get all documents for a given key in a unique index', function () {
      const idx = new Index({ fieldName: 'tf', unique: true }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)

      assert.deepEqual(idx.getMatching('bloup'), [doc3])
      assert.deepEqual(idx.getMatching('world'), [doc2])
      assert.deepEqual(idx.getMatching('nope'), [])
    })

    it('Can get all documents for which a field is undefined', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 2, nottf: 'bloup' },
        doc3 = { a: 8, tf: 'world' },
        doc4 = { a: 7, nottf: 'yes' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)

      assert.deepEqual(idx.getMatching('bloup'), [])
      assert.deepEqual(idx.getMatching('hello'), [doc1])
      assert.deepEqual(idx.getMatching('world'), [doc3])
      assert.deepEqual(idx.getMatching('yes'), [])
      assert.deepEqual(idx.getMatching(undefined), [doc2])

      idx.insert(doc4)

      assert.deepEqual(idx.getMatching('bloup'), [])
      assert.deepEqual(idx.getMatching('hello'), [doc1])
      assert.deepEqual(idx.getMatching('world'), [doc3])
      assert.deepEqual(idx.getMatching('yes'), [])
      assert.deepEqual(idx.getMatching(undefined), [doc2, doc4])
    })

    it('Can get all documents for which a field is null', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 2, tf: null },
        doc3 = { a: 8, tf: 'world' },
        doc4 = { a: 7, tf: null }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)

      assert.deepEqual(idx.getMatching('bloup'), [])
      assert.deepEqual(idx.getMatching('hello'), [doc1])
      assert.deepEqual(idx.getMatching('world'), [doc3])
      assert.deepEqual(idx.getMatching('yes'), [])
      assert.deepEqual(idx.getMatching(null), [doc2])

      idx.insert(doc4)

      assert.deepEqual(idx.getMatching('bloup'), [])
      assert.deepEqual(idx.getMatching('hello'), [doc1])
      assert.deepEqual(idx.getMatching('world'), [doc3])
      assert.deepEqual(idx.getMatching('yes'), [])
      assert.deepEqual(idx.getMatching(null), [doc2, doc4])
    })

    it('Can get all documents for a given key in a sparse index, but not unindexed docs (= field undefined)', function () {
      const idx = new Index({ fieldName: 'tf', sparse: true }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 2, nottf: 'bloup' },
        doc3 = { a: 8, tf: 'world' },
        doc4 = { a: 7, nottf: 'yes' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      idx.insert(doc4)

      assert.deepEqual(idx.getMatching('bloup'), [])
      assert.deepEqual(idx.getMatching('hello'), [doc1])
      assert.deepEqual(idx.getMatching('world'), [doc3])
      assert.deepEqual(idx.getMatching('yes'), [])
      assert.deepEqual(idx.getMatching(undefined), [])
    })

    it('Can get all documents whose key is in an array of keys', function () {
      // For this test only we have to use objects with _ids as the array version of getMatching
      // relies on the _id property being set, otherwise we have to use a quadratic algorithm
      // or a fingerprinting algorithm, both solutions too complicated and slow given that live nedb
      // indexes documents with _id always set
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello', _id: '1' },
        doc2 = { a: 2, tf: 'bloup', _id: '2' },
        doc3 = { a: 8, tf: 'world', _id: '3' },
        doc4 = { a: 7, tf: 'yes', _id: '4' },
        doc5 = { a: 7, tf: 'yes', _id: '5' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      idx.insert(doc4)
      idx.insert(doc5)

      assert.deepEqual(idx.getMatching([]), [])
      assert.deepEqual(idx.getMatching(['bloup']), [doc2])
      assert.deepEqual(idx.getMatching(['bloup', 'yes']), [doc2, doc4, doc5])
      assert.deepEqual(idx.getMatching(['hello', 'no']), [doc1])
      assert.deepEqual(idx.getMatching(['nope', 'no']), [])
    })

    it('Can get all documents whose key is between certain bounds', function () {
      const idx = new Index({ fieldName: 'a' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 2, tf: 'bloup' },
        doc3 = { a: 8, tf: 'world' },
        doc4 = { a: 7, tf: 'yes' },
        doc5 = { a: 10, tf: 'yes' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)
      idx.insert(doc4)
      idx.insert(doc5)

      assert.deepEqual(idx.getBetweenBounds({ $lt: 10, $gte: 5 }), [
        doc1,
        doc4,
        doc3,
      ])
      assert.deepEqual(idx.getBetweenBounds({ $lte: 8 }), [
        doc2,
        doc1,
        doc4,
        doc3,
      ])
      assert.deepEqual(idx.getBetweenBounds({ $gt: 7 }), [doc3, doc5])
    })
  }) // ==== End of 'Get matching documents' ==== //

  describe('Resetting', function () {
    it('Can reset an index without any new data, the index will be empty afterwards', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      expect(idx.getMatching('hello').length).toEqual(1)
      expect(idx.getMatching('world').length).toEqual(1)
      expect(idx.getMatching('bloup').length).toEqual(1)

      idx.reset()
      expect(idx.tree.getNumberOfKeys()).toEqual(0)
      expect(idx.getMatching('hello').length).toEqual(0)
      expect(idx.getMatching('world').length).toEqual(0)
      expect(idx.getMatching('bloup').length).toEqual(0)
    })

    it('Can reset an index and initialize it with one document', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' },
        newDoc = { a: 555, tf: 'new' }
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      expect(idx.getMatching('hello').length).toEqual(1)
      expect(idx.getMatching('world').length).toEqual(1)
      expect(idx.getMatching('bloup').length).toEqual(1)

      idx.reset(newDoc)
      expect(idx.tree.getNumberOfKeys()).toEqual(1)
      expect(idx.getMatching('hello').length).toEqual(0)
      expect(idx.getMatching('world').length).toEqual(0)
      expect(idx.getMatching('bloup').length).toEqual(0)
      expect(idx.getMatching('new')[0].a).toEqual(555)
    })

    it('Can reset an index and initialize it with an array of documents', function () {
      const idx = new Index({ fieldName: 'tf' }),
        doc1 = { a: 5, tf: 'hello' },
        doc2 = { a: 8, tf: 'world' },
        doc3 = { a: 2, tf: 'bloup' },
        newDocs = [
          { a: 555, tf: 'new' },
          { a: 666, tf: 'again' },
        ]
      idx.insert(doc1)
      idx.insert(doc2)
      idx.insert(doc3)

      expect(idx.tree.getNumberOfKeys()).toEqual(3)
      expect(idx.getMatching('hello').length).toEqual(1)
      expect(idx.getMatching('world').length).toEqual(1)
      expect(idx.getMatching('bloup').length).toEqual(1)

      idx.reset(newDocs)
      expect(idx.tree.getNumberOfKeys()).toEqual(2)
      expect(idx.getMatching('hello').length).toEqual(0)
      expect(idx.getMatching('world').length).toEqual(0)
      expect(idx.getMatching('bloup').length).toEqual(0)
      expect(idx.getMatching('new')[0].a).toEqual(555)
      expect(idx.getMatching('again')[0].a).toEqual(666)
    })
  }) // ==== End of 'Resetting' ==== //

  it('Get all elements in the index', function () {
    const idx = new Index({ fieldName: 'a' }),
      doc1 = { a: 5, tf: 'hello' },
      doc2 = { a: 8, tf: 'world' },
      doc3 = { a: 2, tf: 'bloup' }
    idx.insert(doc1)
    idx.insert(doc2)
    idx.insert(doc3)

    assert.deepEqual(idx.getAll(), [
      { a: 2, tf: 'bloup' },
      { a: 5, tf: 'hello' },
      { a: 8, tf: 'world' },
    ])
  })
})
