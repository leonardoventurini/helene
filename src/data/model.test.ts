import { expect, describe, it, assert } from 'vitest'
import { deserialize, serialize } from './serialization'
import { Collection } from './collection'

import isDate from 'lodash/isDate'
import isEqual from 'lodash/isEqual'

import fs from 'fs'
import {
  areThingsEqual,
  checkObject,
  compareThings,
  deepCopy,
  getDotValue,
  isPrimitiveType,
  match,
  modify,
} from './model'
import { NodeStorage } from './node'

describe('Model', () => {
  describe('Serialization, deserialization', function () {
    it('Can serialize and deserialize strings', function () {
      let a, b, c

      a = { test: 'Some string' }
      b = serialize(a)
      c = deserialize(b)
      expect(b.indexOf('\n')).toEqual(-1)
      expect(c.test).toEqual('Some string')

      // Even if a property is a string containing a new line, the serialized
      // version doesn't. The new line must still be there upon deserialization
      a = { test: 'With a new\nline' }
      b = serialize(a)
      c = deserialize(b)
      expect(c.test).toEqual('With a new\nline')
      expect(a.test.indexOf('\n')).not.toEqual(-1)
      expect(b.indexOf('\n')).toEqual(-1)
      expect(c.test.indexOf('\n')).not.toEqual(-1)
    })

    it('Can serialize and deserialize booleans', function () {
      const a = { test: true }
      const b = serialize(a)
      const c = deserialize(b)
      expect(b.indexOf('\n')).toEqual(-1)
      expect(c.test).toEqual(true)
    })

    it('Can serialize and deserialize numbers', function () {
      const a = { test: 5 }
      const b = serialize(a)
      const c = deserialize(b)
      expect(b.indexOf('\n')).toEqual(-1)
      expect(c.test).toEqual(5)
    })

    it('Can serialize and deserialize null', function () {
      const a = { test: null }
      const b = serialize(a)
      deserialize(b)
      expect(b.indexOf('\n')).toEqual(-1)
      expect(a.test).toBeNull()
    })

    it('undefined fields are removed when serialized', function () {
      const a = { bloup: undefined, hello: 'world' },
        b = serialize(a),
        c = deserialize(b)
      expect(Object.keys(c).length).toEqual(1)
      expect(c.hello).toEqual('world')
      expect(c.bloup).toBeUndefined()
    })

    it('Can serialize and deserialize a date', function () {
      const d = new Date()

      const a = { test: d }
      const b = serialize(a)
      const c = deserialize(b)
      expect(b.indexOf('\n')).toEqual(-1)
      expect(b).toEqual('{"test":{"$$date":' + d.getTime() + '}}')
      expect(isDate(c.test)).toEqual(true)
      expect(c.test.getTime()).toEqual(d.getTime())
    })

    it('Can serialize and deserialize sub objects', function () {
      const d = new Date()

      const a = { test: { something: 39, also: d, yes: { again: 'yes' } } }
      const b = serialize(a)
      const c = deserialize(b)
      expect(b.indexOf('\n')).toEqual(-1)
      expect(c.test.something).toEqual(39)
      expect(c.test.also.getTime()).toEqual(d.getTime())
      expect(c.test.yes.again).toEqual('yes')
    })

    it('Can serialize and deserialize sub arrays', function () {
      const d = new Date()

      const a = { test: [39, d, { again: 'yes' }] }
      const b = serialize(a)
      const c = deserialize(b)
      expect(b.indexOf('\n')).toEqual(-1)
      expect(c.test[0]).toEqual(39)
      expect(c.test[1].getTime()).toEqual(d.getTime())
      expect(c.test[2].again).toEqual('yes')
    })

    it('Reject field names beginning with a $ sign or containing a dot, except the four edge cases', function () {
      const a1 = { $something: 'totest' },
        a2 = { 'with.dot': 'totest' },
        e1 = { $$date: 4321 },
        e2 = { $$deleted: true },
        e3 = { $$indexCreated: 'indexName' },
        e4 = { $$indexRemoved: 'indexName' }
      let b

      // Normal cases
      expect(function () {
        b = serialize(a1)
      }).toThrow()
      expect(function () {
        b = serialize(a2)
      }).toThrow()

      // Edge cases
      b = serialize(e1)
      b = serialize(e2)
      b = serialize(e3)
      b = serialize(e4)
    })

    it('Can serialize string fields with a new line without breaking the DB', async function () {
      const badString = 'world\r\nearth\nother\rline'

      if (fs.existsSync('workspace/test1.db')) {
        fs.unlinkSync('workspace/test1.db')
      }

      expect(fs.existsSync('workspace/test1.db')).toEqual(false)
      const db1 = new Collection({
        name: 'workspace/test1.db',
        storage: new NodeStorage(),
      })

      await db1.loadDatabase()
      await db1.insert({ hello: badString })

      const db2 = new Collection({
        name: 'workspace/test1.db',
        storage: new NodeStorage(),
      })

      await db2.loadDatabase()
      const docs = await db2.find({})
      assert.isArray(docs)
      assert.lengthOf(docs, 1)
      assert.propertyVal(docs[0], 'hello', badString)
    })

    it('Can accept objects whose keys are numbers', function () {
      const o = { 42: true }

      serialize(o)
    })
  })

  describe('Object checking', function () {
    it('Field names beginning with a $ sign are forbidden', function () {
      expect(checkObject).toBeDefined()
      expect(function () {
        checkObject({ $bad: true })
      }).toThrow()
      expect(function () {
        checkObject({ some: 42, nested: { again: 'no', $worse: true } })
      }).toThrow()

      // This shouldn't throw since "$actuallyok" is not a field name
      checkObject({ some: 42, nested: [5, 'no', '$actuallyok', true] })
      expect(function () {
        checkObject({
          some: 42,
          nested: [5, 'no', '$actuallyok', true, { $hidden: 'useless' }],
        })
      }).toThrow()
    })

    it('Field names cannot contain a .', function () {
      expect(checkObject).toBeDefined()
      expect(function () {
        checkObject({ 'so.bad': true })
      }).toThrow()

      // Recursive behaviour testing done in the above test on $ signs
    })

    it('Properties with a null value dont trigger an error', function () {
      const obj = { prop: null }

      checkObject(obj)
    })

    it('Can check if an object is a primitive or not', function () {
      expect(isPrimitiveType(5)).toEqual(true)
      expect(isPrimitiveType('sdsfdfs')).toEqual(true)
      expect(isPrimitiveType(0)).toEqual(true)
      expect(isPrimitiveType(true)).toEqual(true)
      expect(isPrimitiveType(false)).toEqual(true)
      expect(isPrimitiveType(new Date())).toEqual(true)
      expect(isPrimitiveType([])).toEqual(true)
      expect(isPrimitiveType([3, 'try'])).toEqual(true)
      expect(isPrimitiveType(null)).toEqual(true)

      expect(isPrimitiveType({})).toEqual(false)
      expect(isPrimitiveType({ a: 42 })).toEqual(false)
    })
  }) // ==== End of 'Object checking' ==== //

  describe('Deep copying', function () {
    it('Should be able to deep copy any serializable model', function () {
      const d = new Date(),
        obj = { a: ['ee', 'ff', 42], date: d, subobj: { a: 'b', b: 'c' } },
        res = deepCopy(obj)
      expect(res.a.length).toEqual(3)
      expect(res.a[0]).toEqual('ee')
      expect(res.a[1]).toEqual('ff')
      expect(res.a[2]).toEqual(42)
      expect(res.date.getTime()).toEqual(d.getTime())
      expect(res.subobj.a).toEqual('b')
      expect(res.subobj.b).toEqual('c')

      obj.a.push('ggg')
      // @ts-ignore
      obj.date = 'notadate'
      // @ts-ignore
      obj.subobj = []

      // Even if the original object is modified, the copied one isn't
      expect(res.a.length).toEqual(3)
      expect(res.a[0]).toEqual('ee')
      expect(res.a[1]).toEqual('ff')
      expect(res.a[2]).toEqual(42)
      expect(res.date.getTime()).toEqual(d.getTime())
      expect(res.subobj.a).toEqual('b')
      expect(res.subobj.b).toEqual('c')
    })

    it('Should deep copy the contents of an array', function () {
      const a = [{ hello: 'world' }],
        b = deepCopy(a)
      expect(b[0].hello).toEqual('world')
      b[0].hello = 'another'
      expect(b[0].hello).toEqual('another')
      expect(a[0].hello).toEqual('world')
    })

    it('Without the strictKeys option, everything gets deep copied', function () {
      const a = {
          a: 4,
          $e: 'rrr',
          'eee.rt': 42,
          nested: { yes: 1, 'tt.yy': 2, $nopenope: 3 },
          array: [{ 'rr.hh': 1 }, { yes: true }, { $yes: false }],
        },
        b = deepCopy(a)
      assert.deepEqual(a, b)
    })

    it('With the strictKeys option, only valid keys gets deep copied', function () {
      const a = {
          a: 4,
          $e: 'rrr',
          'eee.rt': 42,
          nested: { yes: 1, 'tt.yy': 2, $nopenope: 3 },
          array: [{ 'rr.hh': 1 }, { yes: true }, { $yes: false }],
        },
        b = deepCopy(a, true)
      assert.deepEqual(b, {
        a: 4,
        nested: { yes: 1 },
        array: [{}, { yes: true }, {}],
      } as any)
    })
  }) // ==== End of 'Deep copying' ==== //

  describe('Modifying documents', function () {
    it('Queries not containing any modifier just replace the document by the contents of the query but keep its _id', function () {
      const obj = { some: 'thing', _id: 'keepit' },
        updateQuery = { replace: 'done', bloup: [1, 8] }

      const t = modify(obj, updateQuery)
      expect(t.replace).toEqual('done')
      expect(t.bloup.length).toEqual(2)
      expect(t.bloup[0]).toEqual(1)
      expect(t.bloup[1]).toEqual(8)

      expect(t.some).toBeUndefined()
      expect(t._id).toEqual('keepit')
    })

    it('Throw an error if trying to change the _id field in a copy-type modification', function () {
      const obj = { some: 'thing', _id: 'keepit' },
        updateQuery = { replace: 'done', bloup: [1, 8], _id: 'donttryit' }
      expect(function () {
        modify(obj, updateQuery)
      }).toThrow("You cannot change a document's _id")

      updateQuery._id = 'keepit'
      modify(obj, updateQuery) // No error thrown
    })

    it('Throw an error if trying to use modify in a mixed copy+modify way', function () {
      const obj = { some: 'thing' },
        updateQuery = { replace: 'me', $modify: 'metoo' }

      expect(function () {
        modify(obj, updateQuery)
      }).toThrow('You cannot mix modifiers and normal fields')
    })

    it('Throw an error if trying to use an inexistent modifier', function () {
      const obj = { some: 'thing' },
        updateQuery = { $set: { it: 'exists' }, $modify: 'not this one' }

      expect(function () {
        modify(obj, updateQuery)
      }).toThrow(/^Unknown modifier .modify/)
    })

    it('Throw an error if a modifier is used with a non-object argument', function () {
      const obj = { some: 'thing' },
        updateQuery = { $set: 'this exists' }

      expect(function () {
        modify(obj, updateQuery)
      }).toThrow(/Modifier .set's argument must be an object/)
    })

    describe('$set modifier', function () {
      it('Can change already set fields without modfifying the underlying object', function () {
        const obj = { some: 'thing', yup: 'yes', nay: 'noes' },
          updateQuery = { $set: { some: 'changed', nay: 'yes indeed' } },
          modified = modify(obj, updateQuery)

        expect(Object.keys(modified).length).toEqual(3)
        expect(modified.some).toEqual('changed')
        expect(modified.yup).toEqual('yes')
        expect(modified.nay).toEqual('yes indeed')

        expect(Object.keys(obj).length).toEqual(3)
        expect(obj.some).toEqual('thing')
        expect(obj.yup).toEqual('yes')
        expect(obj.nay).toEqual('noes')
      })

      it('Creates fields to set if they dont exist yet', function () {
        const obj = { yup: 'yes' },
          updateQuery = { $set: { some: 'changed', nay: 'yes indeed' } },
          modified = modify(obj, updateQuery)

        expect(Object.keys(modified).length).toEqual(3)
        expect(modified.some).toEqual('changed')
        expect(modified.yup).toEqual('yes')
        expect(modified.nay).toEqual('yes indeed')
      })

      it('Can set sub-fields and create them if necessary', function () {
        const obj = { yup: { subfield: 'bloup' } },
          updateQuery = {
            $set: {
              'yup.subfield': 'changed',
              'yup.yop': 'yes indeed',
              'totally.doesnt.exist': 'now it does',
            },
          },
          modified = modify(obj, updateQuery)

        expect(
          isEqual(modified, {
            yup: { subfield: 'changed', yop: 'yes indeed' },
            totally: { doesnt: { exist: 'now it does' } },
          }),
        ).toEqual(true)
      })

      it("Doesn't replace a falsy field by an object when recursively following dot notation", function () {
        const obj = { nested: false },
          updateQuery = { $set: { 'nested.now': 'it is' } },
          modified = modify(obj, updateQuery)

        assert.deepEqual(modified, { nested: false }) // Object not modified as the nested field doesn't exist
      })
    }) // End of '$set modifier'

    describe('$unset modifier', function () {
      it('Can delete a field, not throwing an error if the field doesnt exist', function () {
        let obj, updateQuery, modified

        obj = { yup: 'yes', other: 'also' }
        updateQuery = { $unset: { yup: true } }
        modified = modify(obj, updateQuery)
        assert.deepEqual(modified, { other: 'also' })

        obj = { yup: 'yes', other: 'also' }
        updateQuery = { $unset: { nope: true } }
        modified = modify(obj, updateQuery)
        assert.deepEqual(modified, obj)

        obj = { yup: 'yes', other: 'also' }
        updateQuery = { $unset: { nope: true, other: true } }
        modified = modify(obj, updateQuery)
        assert.deepEqual(modified, { yup: 'yes' })
      })

      it('Can unset sub-fields and entire nested documents', function () {
        let obj, updateQuery, modified

        obj = { yup: 'yes', nested: { a: 'also', b: 'yeah' } }
        updateQuery = { $unset: { nested: true } }
        modified = modify(obj, updateQuery)
        assert.deepEqual(modified, { yup: 'yes' })

        obj = { yup: 'yes', nested: { a: 'also', b: 'yeah' } }
        updateQuery = { $unset: { 'nested.a': true } }
        modified = modify(obj, updateQuery)
        assert.deepEqual(modified, { yup: 'yes', nested: { b: 'yeah' } })

        obj = { yup: 'yes', nested: { a: 'also', b: 'yeah' } }
        updateQuery = { $unset: { 'nested.a': true, 'nested.b': true } }
        modified = modify(obj, updateQuery)
        assert.deepEqual(modified, { yup: 'yes', nested: {} })
      })

      it('When unsetting nested fields, should not create an empty parent to nested field', function () {
        let obj = modify({ argh: true }, { $unset: { 'bad.worse': true } })
        assert.deepEqual(obj, { argh: true })

        obj = modify(
          { argh: true, bad: { worse: 'oh' } },
          { $unset: { 'bad.worse': true } },
        )
        assert.deepEqual(obj, { argh: true, bad: {} })

        obj = modify({ argh: true, bad: {} }, { $unset: { 'bad.worse': true } })
        assert.deepEqual(obj, { argh: true, bad: {} })
      })
    }) // End of '$unset modifier'

    describe('$inc modifier', function () {
      it('Throw an error if you try to use it with a non-number or on a non number field', function () {
        expect(function () {
          const obj = { some: 'thing', yup: 'yes', nay: 2 },
            updateQuery = { $inc: { nay: 'notanumber' } }
          modify(obj, updateQuery)
        }).toThrow()
        expect(function () {
          const obj = { some: 'thing', yup: 'yes', nay: 'nope' },
            updateQuery = { $inc: { nay: 1 } }
          modify(obj, updateQuery)
        }).toThrow()
      })

      it('Can increment number fields or create and initialize them if needed', function () {
        const obj = { some: 'thing', nay: 40 }

        let modified = modify(obj, { $inc: { nay: 2 } })
        expect(isEqual(modified, { some: 'thing', nay: 42 })).toEqual(true)

        // Incidentally, this tests that obj was not modified
        modified = modify(obj, { $inc: { inexistent: -6 } })
        expect(
          isEqual(modified, {
            some: 'thing',
            nay: 40,
            inexistent: -6,
          }),
        ).toEqual(true)
      })

      it('Works recursively', function () {
        const obj = { some: 'thing', nay: { nope: 40 } }

        const modified = modify(obj, {
          $inc: { 'nay.nope': -2, 'blip.blop': 123 },
        })
        expect(
          isEqual(modified, {
            some: 'thing',
            nay: { nope: 38 },
            blip: { blop: 123 },
          }),
        ).toEqual(true)
      })
    }) // End of '$inc modifier'

    describe('$push modifier', function () {
      it('Can push an element to the end of an array', function () {
        const obj = { arr: ['hello'] }

        const modified = modify(obj, { $push: { arr: 'world' } })
        assert.deepEqual(modified, { arr: ['hello', 'world'] })
      })

      it('Can push an element to a non-existent field and will create the array', function () {
        const obj = {}
        const modified = modify(obj, { $push: { arr: 'world' } })
        assert.deepEqual(modified, { arr: ['world'] })
      })

      it('Can push on nested fields', function () {
        let obj = { arr: { nested: ['hello'] } },
          modified

        modified = modify(obj, { $push: { 'arr.nested': 'world' } })
        assert.deepEqual(modified, { arr: { nested: ['hello', 'world'] } })

        // @ts-ignore
        obj = { arr: { a: 2 } }
        modified = modify(obj, { $push: { 'arr.nested': 'world' } })
        assert.deepEqual(modified, { arr: { a: 2, nested: ['world'] } })
      })

      it('Throw if we try to push to a non-array', function () {
        let obj = { arr: 'hello' },
          modified
        expect(function () {
          modified = modify(obj, { $push: { arr: 'world' } })
        }).toThrow()

        // @ts-ignore
        obj = { arr: { nested: 45 } }
        expect(function () {
          modified = modify(obj, { $push: { 'arr.nested': 'world' } })
        }).toThrow()
      })

      it('Can use the $each modifier to add multiple values to an array at once', function () {
        const obj = { arr: ['hello'] }
        let modified = modify(obj, {
          $push: { arr: { $each: ['world', 'earth', 'everything'] } },
        })
        assert.deepEqual(modified, {
          arr: ['hello', 'world', 'earth', 'everything'],
        })
        expect(function () {
          modified = modify(obj, { $push: { arr: { $each: 45 } } })
        }).toThrow()
        expect(function () {
          modified = modify(obj, {
            $push: { arr: { $each: ['world'], unauthorized: true } },
          })
        }).toThrow()
      })

      it('Can use the $slice modifier to limit the number of array elements', function () {
        const obj = { arr: ['hello'] }

        let modified

        modified = modify(obj, {
          $push: {
            arr: { $each: ['world', 'earth', 'everything'], $slice: 1 },
          },
        })
        assert.deepEqual(modified, { arr: ['hello'] })

        modified = modify(obj, {
          $push: {
            arr: { $each: ['world', 'earth', 'everything'], $slice: -1 },
          },
        })
        assert.deepEqual(modified, { arr: ['everything'] })

        modified = modify(obj, {
          $push: {
            arr: { $each: ['world', 'earth', 'everything'], $slice: 0 },
          },
        })
        assert.deepEqual(modified, { arr: [] })

        modified = modify(obj, {
          $push: {
            arr: { $each: ['world', 'earth', 'everything'], $slice: 2 },
          },
        })
        assert.deepEqual(modified, { arr: ['hello', 'world'] })

        modified = modify(obj, {
          $push: {
            arr: { $each: ['world', 'earth', 'everything'], $slice: -2 },
          },
        })
        assert.deepEqual(modified, { arr: ['earth', 'everything'] })

        modified = modify(obj, {
          $push: {
            arr: { $each: ['world', 'earth', 'everything'], $slice: -20 },
          },
        })
        assert.deepEqual(modified, {
          arr: ['hello', 'world', 'earth', 'everything'],
        })

        modified = modify(obj, {
          $push: {
            arr: { $each: ['world', 'earth', 'everything'], $slice: 20 },
          },
        })
        assert.deepEqual(modified, {
          arr: ['hello', 'world', 'earth', 'everything'],
        })

        modified = modify(obj, {
          $push: { arr: { $each: [], $slice: 1 } },
        })
        assert.deepEqual(modified, { arr: ['hello'] })

        // $each not specified, but $slice is
        modified = modify(obj, { $push: { arr: { $slice: 1 } } })
        assert.deepEqual(modified, { arr: ['hello'] })
        expect(function () {
          modified = modify(obj, {
            $push: { arr: { $slice: 1, unauthorized: true } },
          })
        }).toThrow()
        expect(function () {
          modified = modify(obj, {
            $push: { arr: { $each: [], unauthorized: true } },
          })
        }).toThrow()
      })
    }) // End of '$push modifier'

    describe('$addToSet modifier', function () {
      it('Can add an element to a set', function () {
        let obj = { arr: ['hello'] },
          modified

        modified = modify(obj, { $addToSet: { arr: 'world' } })
        assert.deepEqual(modified, { arr: ['hello', 'world'] })

        obj = { arr: ['hello'] }
        modified = modify(obj, { $addToSet: { arr: 'hello' } })
        assert.deepEqual(modified, { arr: ['hello'] })
      })

      it('Can add an element to a non-existent set and will create the array', function () {
        const obj = { arr: [] }

        const modified = modify(obj, { $addToSet: { arr: 'world' } })
        assert.deepEqual(modified, { arr: ['world'] })
      })

      it('Throw if we try to addToSet to a non-array', function () {
        const obj = { arr: 'hello' }
        expect(function () {
          modify(obj, { $addToSet: { arr: 'world' } })
        }).toThrow()
      })

      it('Use deep-equality to check whether we can add a value to a set', function () {
        let obj = { arr: [{ b: 2 }] },
          modified

        modified = modify(obj, { $addToSet: { arr: { b: 3 } } })
        assert.deepEqual(modified, { arr: [{ b: 2 }, { b: 3 }] })

        obj = { arr: [{ b: 2 }] }
        modified = modify(obj, { $addToSet: { arr: { b: 2 } } })
        assert.deepEqual(modified, { arr: [{ b: 2 }] })
      })

      it('Can use the $each modifier to add multiple values to a set at once', function () {
        const obj = { arr: ['hello'] }

        let modified = modify(obj, {
          $addToSet: { arr: { $each: ['world', 'earth', 'hello', 'earth'] } },
        })
        assert.deepEqual(modified, { arr: ['hello', 'world', 'earth'] })
        expect(function () {
          modified = modify(obj, { $addToSet: { arr: { $each: 45 } } })
        }).toThrow()
        expect(function () {
          modified = modify(obj, {
            $addToSet: { arr: { $each: ['world'], unauthorized: true } },
          })
        }).toThrow()
      })
    }) // End of '$addToSet modifier'

    describe('$pop modifier', function () {
      it('Throw if called on a non array, a non defined field or a non integer', function () {
        let obj = { arr: 'hello' },
          modified
        expect(function () {
          modified = modify(obj, { $pop: { arr: 1 } })
        }).toThrow()

        // @ts-ignore
        obj = { bloup: 'nope' }
        expect(function () {
          modified = modify(obj, { $pop: { arr: 1 } })
        }).toThrow()

        // @ts-ignore
        obj = { arr: [1, 4, 8] }
        expect(function () {
          modified = modify(obj, { $pop: { arr: true } })
        }).toThrow()
      })

      it('Can remove the first and last element of an array', function () {
        let obj, modified

        obj = { arr: [1, 4, 8] }
        modified = modify(obj, { $pop: { arr: 1 } })
        assert.deepEqual(modified, { arr: [1, 4] })

        obj = { arr: [1, 4, 8] }
        modified = modify(obj, { $pop: { arr: -1 } })
        assert.deepEqual(modified, { arr: [4, 8] })

        // Empty arrays are not changed
        obj = { arr: [] }
        modified = modify(obj, { $pop: { arr: 1 } })
        assert.deepEqual(modified, { arr: [] })
        modified = modify(obj, { $pop: { arr: -1 } })
        assert.deepEqual(modified, { arr: [] })
      })
    }) // End of '$pop modifier'

    describe('$pull modifier', function () {
      it('Can remove an element from a set', function () {
        let obj = { arr: ['hello', 'world'] },
          modified

        modified = modify(obj, { $pull: { arr: 'world' } })
        assert.deepEqual(modified, { arr: ['hello'] })

        obj = { arr: ['hello'] }
        modified = modify(obj, { $pull: { arr: 'world' } })
        assert.deepEqual(modified, { arr: ['hello'] })
      })

      it('Can remove multiple matching elements', function () {
        const obj = { arr: ['hello', 'world', 'hello', 'world'] }
        const modified = modify(obj, { $pull: { arr: 'world' } })
        assert.deepEqual(modified, { arr: ['hello', 'hello'] })
      })

      it('Throw if we try to pull from a non-array', function () {
        const obj = { arr: 'hello' }

        let modified

        expect(function () {
          modified = modify(obj, { $pull: { arr: 'world' } })
        }).toThrow()
      })

      it('Use deep-equality to check whether we can remove a value from a set', function () {
        let obj = { arr: [{ b: 2 }, { b: 3 }] },
          modified

        modified = modify(obj, { $pull: { arr: { b: 3 } } })
        assert.deepEqual(modified, { arr: [{ b: 2 }] })

        obj = { arr: [{ b: 2 }] }
        modified = modify(obj, { $pull: { arr: { b: 3 } } })
        assert.deepEqual(modified, { arr: [{ b: 2 }] })
      })

      it('Can use any kind of nedb query with $pull', function () {
        let obj = { arr: [4, 7, 12, 2], other: 'yup' },
          modified

        modified = modify(obj, { $pull: { arr: { $gte: 5 } } })
        assert.deepEqual(modified, { arr: [4, 2], other: 'yup' })

        // @ts-ignore
        obj = { arr: [{ b: 4 }, { b: 7 }, { b: 1 }], other: 'yeah' }
        modified = modify(obj, { $pull: { arr: { b: { $gte: 5 } } } })
        assert.deepEqual(modified, { arr: [{ b: 4 }, { b: 1 }], other: 'yeah' })
      })
    }) // End of '$pull modifier'

    describe('$max modifier', function () {
      it('Will set the field to the updated value if value is greater than current one, without modifying the original object', function () {
        const obj = { some: 'thing', number: 10 },
          updateQuery = { $max: { number: 12 } },
          modified = modify(obj, updateQuery)

        expect(modified).toEqual({ some: 'thing', number: 12 })
        expect(obj).toEqual({ some: 'thing', number: 10 })
      })

      it('Will not update the field if new value is smaller than current one', function () {
        const obj = { some: 'thing', number: 10 },
          updateQuery = { $max: { number: 9 } },
          modified = modify(obj, updateQuery)

        expect(modified).toEqual({ some: 'thing', number: 10 })
      })

      it('Will create the field if it does not exist', function () {
        const obj = { some: 'thing' },
          updateQuery = { $max: { number: 10 } },
          modified = modify(obj, updateQuery)

        expect(modified).toEqual({ some: 'thing', number: 10 })
      })

      it('Works on embedded documents', function () {
        const obj = { some: 'thing', somethingElse: { number: 10 } },
          updateQuery = { $max: { 'somethingElse.number': 12 } },
          modified = modify(obj, updateQuery)

        expect(modified).toEqual({
          some: 'thing',
          somethingElse: { number: 12 },
        })
      })
    }) // End of '$max modifier'

    describe('$min modifier', function () {
      it('Will set the field to the updated value if value is smaller than current one, without modifying the original object', function () {
        const obj = { some: 'thing', number: 10 },
          updateQuery = { $min: { number: 8 } },
          modified = modify(obj, updateQuery)

        expect(modified).toEqual({ some: 'thing', number: 8 })
        expect(obj).toEqual({ some: 'thing', number: 10 })
      })

      it('Will not update the field if new value is greater than current one', function () {
        const obj = { some: 'thing', number: 10 },
          updateQuery = { $min: { number: 12 } },
          modified = modify(obj, updateQuery)

        expect(modified).toEqual({ some: 'thing', number: 10 })
      })

      it('Will create the field if it does not exist', function () {
        const obj = { some: 'thing' },
          updateQuery = { $min: { number: 10 } },
          modified = modify(obj, updateQuery)

        expect(modified).toEqual({ some: 'thing', number: 10 })
      })

      it('Works on embedded documents', function () {
        const obj = { some: 'thing', somethingElse: { number: 10 } },
          updateQuery = { $min: { 'somethingElse.number': 8 } },
          modified = modify(obj, updateQuery)

        expect(modified).toEqual({
          some: 'thing',
          somethingElse: { number: 8 },
        })
      })
    }) // End of '$min modifier'
  }) // ==== End of 'Modifying documents' ==== //

  describe('Comparing things', function () {
    it('undefined is the smallest', function () {
      const otherStuff = [
        null,
        'string',
        '',
        -1,
        0,
        5.3,
        12,
        true,
        false,
        new Date(12345),
        {},
        { hello: 'world' },
        [],
        ['quite', 5],
      ]

      expect(compareThings(undefined, undefined)).toEqual(0)

      otherStuff.forEach(function (stuff) {
        expect(compareThings(undefined, stuff)).toEqual(-1)
        expect(compareThings(stuff, undefined)).toEqual(1)
      })
    })

    it('Then null', function () {
      const otherStuff = [
        'string',
        '',
        -1,
        0,
        5.3,
        12,
        true,
        false,
        new Date(12345),
        {},
        { hello: 'world' },
        [],
        ['quite', 5],
      ]

      expect(compareThings(null, null)).toEqual(0)

      otherStuff.forEach(function (stuff) {
        expect(compareThings(null, stuff)).toEqual(-1)
        expect(compareThings(stuff, null)).toEqual(1)
      })
    })

    it('Then numbers', function () {
      const otherStuff = [
          'string',
          '',
          true,
          false,
          new Date(4312),
          {},
          { hello: 'world' },
          [],
          ['quite', 5],
        ],
        numbers = [-12, 0, 12, 5.7]

      expect(compareThings(-12, 0)).toEqual(-1)
      expect(compareThings(0, -3)).toEqual(1)
      expect(compareThings(5.7, 2)).toEqual(1)
      expect(compareThings(5.7, 12.3)).toEqual(-1)
      expect(compareThings(0, 0)).toEqual(0)
      expect(compareThings(-2.6, -2.6)).toEqual(0)
      expect(compareThings(5, 5)).toEqual(0)

      otherStuff.forEach(function (stuff) {
        numbers.forEach(function (number) {
          expect(compareThings(number, stuff)).toEqual(-1)
          expect(compareThings(stuff, number)).toEqual(1)
        })
      })
    })

    it('Then strings', function () {
      const otherStuff = [
          true,
          false,
          new Date(4321),
          {},
          { hello: 'world' },
          [],
          ['quite', 5],
        ],
        strings = ['', 'string', 'hello world']

      expect(compareThings('', 'hey')).toEqual(-1)
      expect(compareThings('hey', '')).toEqual(1)
      expect(compareThings('hey', 'hew')).toEqual(1)
      expect(compareThings('hey', 'hey')).toEqual(0)

      otherStuff.forEach(function (stuff) {
        strings.forEach(function (string) {
          expect(compareThings(string, stuff)).toEqual(-1)
          expect(compareThings(stuff, string)).toEqual(1)
        })
      })
    })

    it('Then booleans', function () {
      const otherStuff = [
          new Date(4321),
          {},
          { hello: 'world' },
          [],
          ['quite', 5],
        ],
        bools = [true, false]

      expect(compareThings(true, true)).toEqual(0)
      expect(compareThings(false, false)).toEqual(0)
      expect(compareThings(true, false)).toEqual(1)
      expect(compareThings(false, true)).toEqual(-1)

      otherStuff.forEach(function (stuff) {
        bools.forEach(function (bool) {
          expect(compareThings(bool, stuff)).toEqual(-1)
          expect(compareThings(stuff, bool)).toEqual(1)
        })
      })
    })

    it('Then dates', function () {
      const otherStuff = [{}, { hello: 'world' }, [], ['quite', 5]],
        dates = [new Date(-123), new Date(), new Date(5555), new Date(0)],
        now = new Date()

      expect(compareThings(now, now)).toEqual(0)
      expect(compareThings(new Date(54341), now)).toEqual(-1)
      expect(compareThings(now, new Date(54341))).toEqual(1)
      expect(compareThings(new Date(0), new Date(-54341))).toEqual(1)
      expect(compareThings(new Date(123), new Date(4341))).toEqual(-1)

      otherStuff.forEach(function (stuff) {
        dates.forEach(function (date) {
          expect(compareThings(date, stuff)).toEqual(-1)
          expect(compareThings(stuff, date)).toEqual(1)
        })
      })
    })

    it('Then arrays', function () {
      const otherStuff = [{}, { hello: 'world' }],
        arrays = [[], ['yes'], ['hello', 5]]
      expect(compareThings([], [])).toEqual(0)
      expect(compareThings(['hello'], [])).toEqual(1)
      expect(compareThings([], ['hello'])).toEqual(-1)
      expect(compareThings(['hello'], ['hello', 'world'])).toEqual(-1)
      expect(compareThings(['hello', 'earth'], ['hello', 'world'])).toEqual(-1)
      expect(compareThings(['hello', 'zzz'], ['hello', 'world'])).toEqual(1)
      expect(compareThings(['hello', 'world'], ['hello', 'world'])).toEqual(0)

      otherStuff.forEach(function (stuff) {
        arrays.forEach(function (array) {
          expect(compareThings(array, stuff)).toEqual(-1)
          expect(compareThings(stuff, array)).toEqual(1)
        })
      })
    })

    it('And finally objects', function () {
      expect(compareThings({}, {})).toEqual(0)
      expect(compareThings({ a: 42 }, { a: 312 })).toEqual(-1)
      expect(compareThings({ a: '42' }, { a: '312' })).toEqual(1)
      expect(compareThings({ a: 42, b: 312 }, { b: 312, a: 42 })).toEqual(0)
      expect(
        compareThings({ a: 42, b: 312, c: 54 }, { b: 313, a: 42 }),
      ).toEqual(-1)
    })

    it('Can specify custom string comparison function', function () {
      expect(
        compareThings('hello', 'bloup', function (a, b) {
          return a < b ? -1 : 1
        }),
      ).toEqual(1)
      expect(
        compareThings('hello', 'bloup', function (a, b) {
          return a > b ? -1 : 1
        }),
      ).toEqual(-1)
    })
  }) // ==== End of 'Comparing things' ==== //

  describe('Querying', function () {
    describe('Comparing things', function () {
      it('Two things of different types cannot be equal, two identical native things are equal', function () {
        const toTest = [
            null,
            'somestring',
            42,
            true,
            new Date(72998322),
            { hello: 'world' },
          ],
          toTestAgainst = [
            null,
            'somestring',
            42,
            true,
            new Date(72998322),
            { hello: 'world' },
          ] // Use another array so that we don't test pointer equality
        let i, j

        for (i = 0; i < toTest.length; i += 1) {
          for (j = 0; j < toTestAgainst.length; j += 1) {
            expect(areThingsEqual(toTest[i], toTestAgainst[j])).toEqual(i === j)
          }
        }
      })

      it('Can test native types null undefined string number boolean date equality', function () {
        const toTest = [
            null,
            undefined,
            'somestring',
            42,
            true,
            new Date(72998322),
            { hello: 'world' },
          ],
          toTestAgainst = [
            undefined,
            null,
            'someotherstring',
            5,
            false,
            new Date(111111),
            { hello: 'mars' },
          ]
        let i

        for (i = 0; i < toTest.length; i += 1) {
          expect(areThingsEqual(toTest[i], toTestAgainst[i])).toEqual(false)
        }
      })

      it('If one side is an array or undefined, comparison fails', function () {
        const toTestAgainst = [
          null,
          undefined,
          'somestring',
          42,
          true,
          new Date(72998322),
          { hello: 'world' },
        ]
        let i

        for (i = 0; i < toTestAgainst.length; i += 1) {
          expect(areThingsEqual([1, 2, 3], toTestAgainst[i])).toEqual(false)
          expect(areThingsEqual(toTestAgainst[i], [])).toEqual(false)

          expect(areThingsEqual(undefined, toTestAgainst[i])).toEqual(false)
          expect(areThingsEqual(toTestAgainst[i], undefined)).toEqual(false)
        }
      })

      it('Can test objects equality', function () {
        expect(areThingsEqual({ hello: 'world' }, {})).toEqual(false)
        expect(areThingsEqual({ hello: 'world' }, { hello: 'mars' })).toEqual(
          false,
        )
        expect(
          areThingsEqual(
            { hello: 'world' },
            { hello: 'world', temperature: 42 },
          ),
        ).toEqual(false)
        expect(
          areThingsEqual(
            { hello: 'world', other: { temperature: 42 } },
            { hello: 'world', other: { temperature: 42 } },
          ),
        ).toEqual(true)
      })
    })

    describe('Getting a fields value in dot notation', function () {
      it('Return first-level and nested values', function () {
        expect(getDotValue({ hello: 'world' }, 'hello')).toEqual('world')
        expect(
          getDotValue(
            { hello: 'world', type: { planet: true, blue: true } },
            'type.planet',
          ),
        ).toEqual(true)
      })

      it('Return undefined if the field cannot be found in the object', function () {
        expect(getDotValue({ hello: 'world' }, 'helloo')).toBeUndefined()
        expect(
          getDotValue({ hello: 'world', type: { planet: true } }, 'type.plane'),
        ).toBeUndefined()
      })

      it('Can navigate inside arrays with dot notation, and return the array of values in that case', function () {
        let dv

        // Simple array of subdocuments
        dv = getDotValue(
          {
            planets: [
              { name: 'Earth', number: 3 },
              { name: 'Mars', number: 2 },
              { name: 'Pluton', number: 9 },
            ],
          },
          'planets.name',
        )
        assert.deepEqual(dv, ['Earth', 'Mars', 'Pluton'])

        // Nested array of subdocuments
        dv = getDotValue(
          {
            nedb: true,
            data: {
              planets: [
                { name: 'Earth', number: 3 },
                { name: 'Mars', number: 2 },
                { name: 'Pluton', number: 9 },
              ],
            },
          },
          'data.planets.number',
        )
        assert.deepEqual(dv, [3, 2, 9])

        // Nested array in a subdocument of an array (yay, inception!)
        // TODO: make sure MongoDB doesn't flatten the array (it wouldn't make sense)
        dv = getDotValue(
          {
            nedb: true,
            data: {
              planets: [
                { name: 'Earth', numbers: [1, 3] },
                { name: 'Mars', numbers: [7] },
                { name: 'Pluton', numbers: [9, 5, 1] },
              ],
            },
          },
          'data.planets.numbers',
        )
        assert.deepEqual(dv, [[1, 3], [7], [9, 5, 1]])
      })

      it('Can get a single value out of an array using its index', function () {
        let dv

        // Simple index in dot notation
        dv = getDotValue(
          {
            planets: [
              { name: 'Earth', number: 3 },
              { name: 'Mars', number: 2 },
              { name: 'Pluton', number: 9 },
            ],
          },
          'planets.1',
        )
        assert.deepEqual(dv, { name: 'Mars', number: 2 })

        // Out of bounds index
        dv = getDotValue(
          {
            planets: [
              { name: 'Earth', number: 3 },
              { name: 'Mars', number: 2 },
              { name: 'Pluton', number: 9 },
            ],
          },
          'planets.3',
        )
        expect(dv).toBeUndefined()

        // Index in nested array
        dv = getDotValue(
          {
            nedb: true,
            data: {
              planets: [
                { name: 'Earth', number: 3 },
                { name: 'Mars', number: 2 },
                { name: 'Pluton', number: 9 },
              ],
            },
          },
          'data.planets.2',
        )
        assert.deepEqual(dv, { name: 'Pluton', number: 9 })

        // Dot notation with index in the middle
        dv = getDotValue(
          {
            nedb: true,
            data: {
              planets: [
                { name: 'Earth', number: 3 },
                { name: 'Mars', number: 2 },
                { name: 'Pluton', number: 9 },
              ],
            },
          },
          'data.planets.0.name',
        )
        expect(dv).toEqual('Earth')
      })
    })

    describe('Field equality', function () {
      it('Can find documents with simple fields', function () {
        expect(match({ test: 'yeah' }, { test: 'yea' })).toEqual(false)
        expect(match({ test: 'yeah' }, { test: 'yeahh' })).toEqual(false)
        expect(match({ test: 'yeah' }, { test: 'yeah' })).toEqual(true)
      })

      it('Can find documents with the dot-notation', function () {
        expect(match({ test: { ooo: 'yeah' } }, { 'test.ooo': 'yea' })).toEqual(
          false,
        )
        expect(match({ test: { ooo: 'yeah' } }, { 'test.oo': 'yeah' })).toEqual(
          false,
        )
        expect(match({ test: { ooo: 'yeah' } }, { 'tst.ooo': 'yeah' })).toEqual(
          false,
        )
        expect(
          match({ test: { ooo: 'yeah' } }, { 'test.ooo': 'yeah' }),
        ).toEqual(true)
      })

      it('Cannot find undefined', function () {
        expect(match({ test: undefined }, { test: undefined })).toEqual(false)
        expect(
          match({ test: { pp: undefined } }, { 'test.pp': undefined }),
        ).toEqual(false)
      })

      it('Nested objects are deep-equality matched and not treated as sub-queries', function () {
        expect(match({ a: { b: 5 } }, { a: { b: 5 } })).toEqual(true)
        expect(match({ a: { b: 5, c: 3 } }, { a: { b: 5 } })).toEqual(false)

        expect(match({ a: { b: 5 } }, { a: { b: { $lt: 10 } } })).toEqual(false)
        expect(function () {
          match({ a: { b: 5 } }, { a: { $or: [{ b: 10 }, { b: 5 }] } })
        }).toThrow()
      })

      it('Can match for field equality inside an array with the dot notation', function () {
        expect(
          match(
            { a: true, b: ['node', 'embedded', 'database'] },
            { 'b.1': 'node' },
          ),
        ).toEqual(false)
        expect(
          match(
            { a: true, b: ['node', 'embedded', 'database'] },
            { 'b.1': 'embedded' },
          ),
        ).toEqual(true)
        expect(
          match(
            { a: true, b: ['node', 'embedded', 'database'] },
            { 'b.1': 'database' },
          ),
        ).toEqual(false)
      })
    })

    describe('Regular expression matching', function () {
      it('Matching a non-string to a regular expression always yields false', function () {
        const d = new Date(),
          r = new RegExp(String(d.getTime()))

        expect(match({ test: true }, { test: /true/ })).toEqual(false)
        expect(match({ test: null }, { test: /null/ })).toEqual(false)
        expect(match({ test: 42 }, { test: /42/ })).toEqual(false)
        expect(match({ test: d }, { test: r })).toEqual(false)
      })

      it('Can match strings using basic querying', function () {
        expect(match({ test: 'true' }, { test: /true/ })).toEqual(true)
        expect(match({ test: 'babaaaar' }, { test: /aba+r/ })).toEqual(true)
        expect(match({ test: 'babaaaar' }, { test: /^aba+r/ })).toEqual(false)
        expect(match({ test: 'true' }, { test: /t[ru]e/ })).toEqual(false)
      })

      it('Can match strings using the $regex operator', function () {
        expect(match({ test: 'true' }, { test: { $regex: /true/ } })).toEqual(
          true,
        )
        expect(
          match({ test: 'babaaaar' }, { test: { $regex: /aba+r/ } }),
        ).toEqual(true)
        expect(
          match({ test: 'babaaaar' }, { test: { $regex: /^aba+r/ } }),
        ).toEqual(false)
        expect(match({ test: 'true' }, { test: { $regex: /t[ru]e/ } })).toEqual(
          false,
        )
      })

      it('Will throw if $regex operator is used with a non regex value', function () {
        expect(function () {
          match({ test: 'true' }, { test: { $regex: 42 } })
        }).toThrow()
        expect(function () {
          match({ test: 'true' }, { test: { $regex: 'true' } })
        }).toThrow()
      })

      it('Can use the $regex operator in cunjunction with other operators', function () {
        expect(
          match(
            { test: 'helLo' },
            { test: { $regex: /ll/i, $nin: ['helL', 'helLop'] } },
          ),
        ).toEqual(true)
        expect(
          match(
            { test: 'helLo' },
            { test: { $regex: /ll/i, $nin: ['helLo', 'helLop'] } },
          ),
        ).toEqual(false)
      })

      it('Can use dot-notation', function () {
        expect(
          match({ test: { nested: 'true' } }, { 'test.nested': /true/ }),
        ).toEqual(true)
        expect(
          match({ test: { nested: 'babaaaar' } }, { 'test.nested': /^aba+r/ }),
        ).toEqual(false)

        expect(
          match(
            { test: { nested: 'true' } },
            { 'test.nested': { $regex: /true/ } },
          ),
        ).toEqual(true)
        expect(
          match(
            { test: { nested: 'babaaaar' } },
            { 'test.nested': { $regex: /^aba+r/ } },
          ),
        ).toEqual(false)
      })
    })

    describe('$lt', function () {
      it('Cannot compare a field to an object, an array, null or a boolean, it will return false', function () {
        expect(match({ a: 5 }, { a: { $lt: { a: 6 } } })).toEqual(false)
        expect(match({ a: 5 }, { a: { $lt: [6, 7] } })).toEqual(false)
        expect(match({ a: 5 }, { a: { $lt: null } })).toEqual(false)
        expect(match({ a: 5 }, { a: { $lt: true } })).toEqual(false)
      })

      it('Can compare numbers, with or without dot notation', function () {
        expect(match({ a: 5 }, { a: { $lt: 6 } })).toEqual(true)
        expect(match({ a: 5 }, { a: { $lt: 5 } })).toEqual(false)
        expect(match({ a: 5 }, { a: { $lt: 4 } })).toEqual(false)

        expect(match({ a: { b: 5 } }, { 'a.b': { $lt: 6 } })).toEqual(true)
        expect(match({ a: { b: 5 } }, { 'a.b': { $lt: 3 } })).toEqual(false)
      })

      it('Can compare strings, with or without dot notation', function () {
        expect(match({ a: 'nedb' }, { a: { $lt: 'nedc' } })).toEqual(true)
        expect(match({ a: 'nedb' }, { a: { $lt: 'neda' } })).toEqual(false)

        expect(match({ a: { b: 'nedb' } }, { 'a.b': { $lt: 'nedc' } })).toEqual(
          true,
        )
        expect(match({ a: { b: 'nedb' } }, { 'a.b': { $lt: 'neda' } })).toEqual(
          false,
        )
      })

      it('If field is an array field, a match means a match on at least one element', function () {
        expect(match({ a: [5, 10] }, { a: { $lt: 4 } })).toEqual(false)
        expect(match({ a: [5, 10] }, { a: { $lt: 6 } })).toEqual(true)
        expect(match({ a: [5, 10] }, { a: { $lt: 11 } })).toEqual(true)
      })

      it('Works with dates too', function () {
        expect(
          match({ a: new Date(1000) }, { a: { $gte: new Date(1001) } }),
        ).toEqual(false)
        expect(
          match({ a: new Date(1000) }, { a: { $lt: new Date(1001) } }),
        ).toEqual(true)
      })
    })

    // General behaviour is tested in the block about $lt. Here we just test operators work
    describe('Other comparison operators: $lte, $gt, $gte, $ne, $in, $exists', function () {
      it('$lte', function () {
        expect(match({ a: 5 }, { a: { $lte: 6 } })).toEqual(true)
        expect(match({ a: 5 }, { a: { $lte: 5 } })).toEqual(true)
        expect(match({ a: 5 }, { a: { $lte: 4 } })).toEqual(false)
      })

      it('$gt', function () {
        expect(match({ a: 5 }, { a: { $gt: 6 } })).toEqual(false)
        expect(match({ a: 5 }, { a: { $gt: 5 } })).toEqual(false)
        expect(match({ a: 5 }, { a: { $gt: 4 } })).toEqual(true)
      })

      it('$gte', function () {
        expect(match({ a: 5 }, { a: { $gte: 6 } })).toEqual(false)
        expect(match({ a: 5 }, { a: { $gte: 5 } })).toEqual(true)
        expect(match({ a: 5 }, { a: { $gte: 4 } })).toEqual(true)
      })

      it('$ne', function () {
        expect(match({ a: 5 }, { a: { $ne: 4 } })).toEqual(true)
        expect(match({ a: 5 }, { a: { $ne: 5 } })).toEqual(false)
        expect(match({ a: 5 }, { b: { $ne: 5 } })).toEqual(true)
        expect(match({ a: false }, { a: { $ne: false } })).toEqual(false)
      })

      it('$in', function () {
        expect(match({ a: 5 }, { a: { $in: [6, 8, 9] } })).toEqual(false)
        expect(match({ a: 6 }, { a: { $in: [6, 8, 9] } })).toEqual(true)
        expect(match({ a: 7 }, { a: { $in: [6, 8, 9] } })).toEqual(false)
        expect(match({ a: 8 }, { a: { $in: [6, 8, 9] } })).toEqual(true)
        expect(match({ a: 9 }, { a: { $in: [6, 8, 9] } })).toEqual(true)
        expect(function () {
          match({ a: 5 }, { a: { $in: 5 } })
        }).toThrow()
      })

      it('$nin', function () {
        expect(match({ a: 5 }, { a: { $nin: [6, 8, 9] } })).toEqual(true)
        expect(match({ a: 6 }, { a: { $nin: [6, 8, 9] } })).toEqual(false)
        expect(match({ a: 7 }, { a: { $nin: [6, 8, 9] } })).toEqual(true)
        expect(match({ a: 8 }, { a: { $nin: [6, 8, 9] } })).toEqual(false)
        expect(match({ a: 9 }, { a: { $nin: [6, 8, 9] } })).toEqual(false)

        // Matches if field doesn't exist
        expect(match({ a: 9 }, { b: { $nin: [6, 8, 9] } })).toEqual(true)
        expect(function () {
          match({ a: 5 }, { a: { $in: 5 } })
        }).toThrow()
      })

      it('$exists', function () {
        expect(match({ a: 5 }, { a: { $exists: 1 } })).toEqual(true)
        expect(match({ a: 5 }, { a: { $exists: true } })).toEqual(true)
        expect(match({ a: 5 }, { a: { $exists: new Date() } })).toEqual(true)
        expect(match({ a: 5 }, { a: { $exists: '' } })).toEqual(true)
        expect(match({ a: 5 }, { a: { $exists: [] } })).toEqual(true)
        expect(match({ a: 5 }, { a: { $exists: {} } })).toEqual(true)

        expect(match({ a: 5 }, { a: { $exists: 0 } })).toEqual(false)
        expect(match({ a: 5 }, { a: { $exists: false } })).toEqual(false)
        expect(match({ a: 5 }, { a: { $exists: null } })).toEqual(false)
        expect(match({ a: 5 }, { a: { $exists: undefined } })).toEqual(false)

        expect(match({ a: 5 }, { b: { $exists: true } })).toEqual(false)

        expect(match({ a: 5 }, { b: { $exists: false } })).toEqual(true)
      })
    })

    describe('Comparing on arrays', function () {
      it('Can perform a direct array match', function () {
        expect(
          match(
            { planets: ['Earth', 'Mars', 'Pluto'], something: 'else' },
            { planets: ['Earth', 'Mars'] },
          ),
        ).toEqual(false)
        expect(
          match(
            { planets: ['Earth', 'Mars', 'Pluto'], something: 'else' },
            { planets: ['Earth', 'Mars', 'Pluto'] },
          ),
        ).toEqual(true)
        expect(
          match(
            { planets: ['Earth', 'Mars', 'Pluto'], something: 'else' },
            { planets: ['Earth', 'Pluto', 'Mars'] },
          ),
        ).toEqual(false)
      })

      it('Can query on the size of an array field', function () {
        // Non nested documents
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { childrens: { $size: 0 } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { childrens: { $size: 1 } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { childrens: { $size: 2 } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { childrens: { $size: 3 } },
          ),
        ).toEqual(true)

        // Nested documents
        expect(
          match(
            {
              hello: 'world',
              description: { satellites: ['Moon', 'Hubble'], diameter: 6300 },
            },
            { 'description.satellites': { $size: 0 } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              hello: 'world',
              description: { satellites: ['Moon', 'Hubble'], diameter: 6300 },
            },
            { 'description.satellites': { $size: 1 } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              hello: 'world',
              description: { satellites: ['Moon', 'Hubble'], diameter: 6300 },
            },
            { 'description.satellites': { $size: 2 } },
          ),
        ).toEqual(true)
        expect(
          match(
            {
              hello: 'world',
              description: { satellites: ['Moon', 'Hubble'], diameter: 6300 },
            },
            { 'description.satellites': { $size: 3 } },
          ),
        ).toEqual(false)

        // Using a projected array
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.names': { $size: 0 } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.names': { $size: 1 } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.names': { $size: 2 } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.names': { $size: 3 } },
          ),
        ).toEqual(true)
      })

      it('$size operator works with empty arrays', function () {
        expect(match({ childrens: [] }, { childrens: { $size: 0 } })).toEqual(
          true,
        )
        expect(match({ childrens: [] }, { childrens: { $size: 2 } })).toEqual(
          false,
        )
        expect(match({ childrens: [] }, { childrens: { $size: 3 } })).toEqual(
          false,
        )
      })

      it('Should throw an error if a query operator is used without comparing to an integer', function () {
        expect(function () {
          match({ a: [1, 5] }, { a: { $size: 1.4 } })
        }).toThrow()
        expect(function () {
          match({ a: [1, 5] }, { a: { $size: 'fdf' } })
        }).toThrow()
        expect(function () {
          match({ a: [1, 5] }, { a: { $size: { $lt: 5 } } })
        }).toThrow()
      })

      it('Using $size operator on a non-array field should prevent match but not throw', function () {
        expect(match({ a: 5 }, { a: { $size: 1 } })).toEqual(false)
      })

      it('Can use $size several times in the same matcher', function () {
        expect(
          match(
            { childrens: ['Riri', 'Fifi', 'Loulou'] },
            // @ts-ignore
            { childrens: { $size: 3, $size: 3 } },
          ),
        ).toEqual(true)
        expect(
          match(
            { childrens: ['Riri', 'Fifi', 'Loulou'] },
            // @ts-ignore
            { childrens: { $size: 3, $size: 4 } },
          ),
        ).toEqual(false) // Of course this can never be true
      })

      it('Can query array documents with multiple simultaneous conditions', function () {
        // Non nested documents
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { childrens: { $elemMatch: { name: 'Dewey', age: 7 } } },
          ),
        ).toEqual(true)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { childrens: { $elemMatch: { name: 'Dewey', age: 12 } } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { childrens: { $elemMatch: { name: 'Louie', age: 3 } } },
          ),
        ).toEqual(false)

        // Nested documents
        expect(
          match(
            {
              outer: {
                childrens: [
                  { name: 'Huey', age: 3 },
                  { name: 'Dewey', age: 7 },
                  { name: 'Louie', age: 12 },
                ],
              },
            },
            { 'outer.childrens': { $elemMatch: { name: 'Dewey', age: 7 } } },
          ),
        ).toEqual(true)
        expect(
          match(
            {
              outer: {
                childrens: [
                  { name: 'Huey', age: 3 },
                  { name: 'Dewey', age: 7 },
                  { name: 'Louie', age: 12 },
                ],
              },
            },
            { 'outer.childrens': { $elemMatch: { name: 'Dewey', age: 12 } } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              outer: {
                childrens: [
                  { name: 'Huey', age: 3 },
                  { name: 'Dewey', age: 7 },
                  { name: 'Louie', age: 12 },
                ],
              },
            },
            { 'outer.childrens': { $elemMatch: { name: 'Louie', age: 3 } } },
          ),
        ).toEqual(false)
      })

      it('$elemMatch operator works with empty arrays', function () {
        expect(
          match(
            { childrens: [] },
            { childrens: { $elemMatch: { name: 'Mitsos' } } },
          ),
        ).toEqual(false)
        expect(
          match({ childrens: [] }, { childrens: { $elemMatch: {} } }),
        ).toEqual(false)
      })

      it('Can use more complex comparisons inside nested query documents', function () {
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            {
              childrens: {
                $elemMatch: { name: 'Dewey', age: { $gt: 6, $lt: 8 } },
              },
            },
          ),
        ).toEqual(true)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            {
              childrens: {
                $elemMatch: { name: 'Dewey', age: { $in: [6, 7, 8] } },
              },
            },
          ),
        ).toEqual(true)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            {
              childrens: {
                $elemMatch: { name: 'Dewey', age: { $gt: 6, $lt: 7 } },
              },
            },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            {
              childrens: {
                $elemMatch: { name: 'Louie', age: { $gt: 6, $lte: 7 } },
              },
            },
          ),
        ).toEqual(false)
      })
    })

    describe('Logical operators $or, $and, $not', function () {
      it('Any of the subqueries should match for an $or to match', function () {
        expect(
          match(
            { hello: 'world' },
            { $or: [{ hello: 'pluton' }, { hello: 'world' }] },
          ),
        ).toEqual(true)
        expect(
          match(
            { hello: 'pluton' },
            { $or: [{ hello: 'pluton' }, { hello: 'world' }] },
          ),
        ).toEqual(true)
        expect(
          match(
            { hello: 'nope' },
            { $or: [{ hello: 'pluton' }, { hello: 'world' }] },
          ),
        ).toEqual(false)
        expect(
          match(
            { hello: 'world', age: 15 },
            { $or: [{ hello: 'pluton' }, { age: { $lt: 20 } }] },
          ),
        ).toEqual(true)
        expect(
          match(
            { hello: 'world', age: 15 },
            { $or: [{ hello: 'pluton' }, { age: { $lt: 10 } }] },
          ),
        ).toEqual(false)
      })

      it('All of the subqueries should match for an $and to match', function () {
        expect(
          match(
            { hello: 'world', age: 15 },
            { $and: [{ age: 15 }, { hello: 'world' }] },
          ),
        ).toEqual(true)
        expect(
          match(
            { hello: 'world', age: 15 },
            { $and: [{ age: 16 }, { hello: 'world' }] },
          ),
        ).toEqual(false)
        expect(
          match(
            { hello: 'world', age: 15 },
            { $and: [{ hello: 'world' }, { age: { $lt: 20 } }] },
          ),
        ).toEqual(true)
        expect(
          match(
            { hello: 'world', age: 15 },
            { $and: [{ hello: 'pluton' }, { age: { $lt: 20 } }] },
          ),
        ).toEqual(false)
      })

      it('Subquery should not match for a $not to match', function () {
        expect(match({ a: 5, b: 10 }, { a: 5 })).toEqual(true)
        expect(match({ a: 5, b: 10 }, { $not: { a: 5 } })).toEqual(false)
      })

      it('Logical operators are all top-level, only other logical operators can be above', function () {
        expect(function () {
          match({ a: { b: 7 } }, { a: { $or: [{ b: 5 }, { b: 7 }] } })
        }).toThrow()
        expect(
          match({ a: { b: 7 } }, { $or: [{ 'a.b': 5 }, { 'a.b': 7 }] }),
        ).toEqual(true)
      })

      it('Logical operators can be combined as long as they are on top of the decision tree', function () {
        expect(
          match(
            { a: 5, b: 7, c: 12 },
            {
              $or: [
                { $and: [{ a: 5 }, { b: 8 }] },
                { $and: [{ a: 5 }, { c: { $lt: 40 } }] },
              ],
            },
          ),
        ).toEqual(true)
        expect(
          match(
            { a: 5, b: 7, c: 12 },
            {
              $or: [
                { $and: [{ a: 5 }, { b: 8 }] },
                { $and: [{ a: 5 }, { c: { $lt: 10 } }] },
              ],
            },
          ),
        ).toEqual(false)
      })

      it('Should throw an error if a logical operator is used without an array or if an unknown logical operator is used', function () {
        expect(function () {
          // @ts-ignore
          match({ a: 5 }, { $or: { a: 5, a: 6 } })
        }).toThrow()
        expect(function () {
          // @ts-ignore
          match({ a: 5 }, { $and: { a: 5, a: 6 } })
        }).toThrow()
        expect(function () {
          match({ a: 5 }, { $unknown: [{ a: 5 }] })
        }).toThrow()
      })
    })

    describe('Comparison operator $where', function () {
      it('Function should match and not match correctly', function () {
        expect(
          match(
            { a: 4 },
            {
              $where: function () {
                return this.a === 4
              },
            },
          ),
        ).toEqual(true)
        expect(
          match(
            { a: 4 },
            {
              $where: function () {
                return this.a === 5
              },
            },
          ),
        ).toEqual(false)
      })

      it('Should throw an error if the $where function is not, in fact, a function', function () {
        expect(function () {
          match({ a: 4 }, { $where: 'not a function' })
        }).toThrow()
      })

      it('Should throw an error if the $where function returns a non-boolean', function () {
        expect(function () {
          match(
            { a: 4 },
            {
              $where: function () {
                return 'not a boolean'
              },
            },
          )
        }).toThrow()
      })

      it('Should be able to do the complex matching it must be used for', function () {
        const checkEmail = function () {
          if (!this.firstName || !this.lastName) {
            return false
          }
          return (
            this.firstName.toLowerCase() +
              '.' +
              this.lastName.toLowerCase() +
              '@gmail.com' ===
            this.email
          )
        }
        expect(
          match(
            { firstName: 'John', lastName: 'Doe', email: 'john.doe@gmail.com' },
            { $where: checkEmail },
          ),
        ).toEqual(true)
        expect(
          match(
            { firstName: 'john', lastName: 'doe', email: 'john.doe@gmail.com' },
            { $where: checkEmail },
          ),
        ).toEqual(true)
        expect(
          match(
            { firstName: 'Jane', lastName: 'Doe', email: 'john.doe@gmail.com' },
            { $where: checkEmail },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              firstName: 'John',
              lastName: 'Deere',
              email: 'john.doe@gmail.com',
            },
            { $where: checkEmail },
          ),
        ).toEqual(false)
        expect(
          match(
            { lastName: 'Doe', email: 'john.doe@gmail.com' },
            { $where: checkEmail },
          ),
        ).toEqual(false)
      })
    })

    describe('Array fields', function () {
      it('Field equality', function () {
        expect(
          match({ tags: ['node', 'js', 'db'] }, { tags: 'python' }),
        ).toEqual(false)
        expect(match({ tags: ['node', 'js', 'db'] }, { tagss: 'js' })).toEqual(
          false,
        )
        expect(match({ tags: ['node', 'js', 'db'] }, { tags: 'js' })).toEqual(
          true,
        )
        expect(
          match(
            { tags: ['node', 'js', 'db'] },
            // @ts-ignore
            { tags: 'js', tags: 'node' },
          ),
        ).toEqual(true)

        // Mixed matching with array and non array
        expect(
          match(
            { tags: ['node', 'js', 'db'], nedb: true },
            { tags: 'js', nedb: true },
          ),
        ).toEqual(true)

        // Nested matching
        expect(
          match(
            { number: 5, data: { tags: ['node', 'js', 'db'] } },
            { 'data.tags': 'js' },
          ),
        ).toEqual(true)
        expect(
          match(
            { number: 5, data: { tags: ['node', 'js', 'db'] } },
            { 'data.tags': 'j' },
          ),
        ).toEqual(false)
      })

      it('With one comparison operator', function () {
        expect(match({ ages: [3, 7, 12] }, { ages: { $lt: 2 } })).toEqual(false)
        expect(match({ ages: [3, 7, 12] }, { ages: { $lt: 3 } })).toEqual(false)
        expect(match({ ages: [3, 7, 12] }, { ages: { $lt: 4 } })).toEqual(true)
        expect(match({ ages: [3, 7, 12] }, { ages: { $lt: 8 } })).toEqual(true)
        expect(match({ ages: [3, 7, 12] }, { ages: { $lt: 13 } })).toEqual(true)
      })

      it('Works with arrays that are in subdocuments', function () {
        expect(
          match(
            { children: { ages: [3, 7, 12] } },
            { 'children.ages': { $lt: 2 } },
          ),
        ).toEqual(false)
        expect(
          match(
            { children: { ages: [3, 7, 12] } },
            { 'children.ages': { $lt: 3 } },
          ),
        ).toEqual(false)
        expect(
          match(
            { children: { ages: [3, 7, 12] } },
            { 'children.ages': { $lt: 4 } },
          ),
        ).toEqual(true)
        expect(
          match(
            { children: { ages: [3, 7, 12] } },
            { 'children.ages': { $lt: 8 } },
          ),
        ).toEqual(true)
        expect(
          match(
            { children: { ages: [3, 7, 12] } },
            { 'children.ages': { $lt: 13 } },
          ),
        ).toEqual(true)
      })

      it('Can query inside arrays thanks to dot notation', function () {
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.age': { $lt: 2 } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.age': { $lt: 3 } },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.age': { $lt: 4 } },
          ),
        ).toEqual(true)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.age': { $lt: 8 } },
          ),
        ).toEqual(true)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.age': { $lt: 13 } },
          ),
        ).toEqual(true)

        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.name': 'Louis' },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.name': 'Louie' },
          ),
        ).toEqual(true)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.name': 'Lewi' },
          ),
        ).toEqual(false)
      })

      it('Can query for a specific element inside arrays thanks to dot notation', function () {
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.0.name': 'Louie' },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.1.name': 'Louie' },
          ),
        ).toEqual(false)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.2.name': 'Louie' },
          ),
        ).toEqual(true)
        expect(
          match(
            {
              childrens: [
                { name: 'Huey', age: 3 },
                { name: 'Dewey', age: 7 },
                { name: 'Louie', age: 12 },
              ],
            },
            { 'childrens.3.name': 'Louie' },
          ),
        ).toEqual(false)
      })

      it('A single array-specific operator and the query is treated as array specific', function () {
        expect(function () {
          match(
            { childrens: ['Riri', 'Fifi', 'Loulou'] },
            { childrens: { Fifi: true, $size: 3 } },
          )
        }).toThrow()
      })

      it('Can mix queries on array fields and non array filds with array specific operators', function () {
        expect(
          match(
            { uncle: 'Donald', nephews: ['Riri', 'Fifi', 'Loulou'] },
            { nephews: { $size: 2 }, uncle: 'Donald' },
          ),
        ).toEqual(false)
        expect(
          match(
            { uncle: 'Donald', nephews: ['Riri', 'Fifi', 'Loulou'] },
            { nephews: { $size: 3 }, uncle: 'Donald' },
          ),
        ).toEqual(true)
        expect(
          match(
            { uncle: 'Donald', nephews: ['Riri', 'Fifi', 'Loulou'] },
            { nephews: { $size: 4 }, uncle: 'Donald' },
          ),
        ).toEqual(false)

        expect(
          match(
            { uncle: 'Donals', nephews: ['Riri', 'Fifi', 'Loulou'] },
            { nephews: { $size: 3 }, uncle: 'Picsou' },
          ),
        ).toEqual(false)
        expect(
          match(
            { uncle: 'Donald', nephews: ['Riri', 'Fifi', 'Loulou'] },
            { nephews: { $size: 3 }, uncle: 'Donald' },
          ),
        ).toEqual(true)
        expect(
          match(
            { uncle: 'Donald', nephews: ['Riri', 'Fifi', 'Loulou'] },
            { nephews: { $size: 3 }, uncle: 'Daisy' },
          ),
        ).toEqual(false)
      })
    })
  }) // ==== End of 'Querying' ==== //
})
