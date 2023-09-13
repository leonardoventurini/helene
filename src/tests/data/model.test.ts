import { assert, expect } from 'chai'
import { deserialize, serialize } from '../../data/serialization'
import { Collection } from '../../data'

import _, { isDate } from 'lodash'

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
} from '../../data/model'
import { NodeStorage } from '../../data/node'

describe('Model', function () {
  describe('Serialization, deserialization', function () {
    it('Can serialize and deserialize strings', function () {
      let a, b, c

      a = { test: 'Some string' }
      b = serialize(a)
      c = deserialize(b)
      b.indexOf('\n').should.equal(-1)
      c.test.should.equal('Some string')

      // Even if a property is a string containing a new line, the serialized
      // version doesn't. The new line must still be there upon deserialization
      a = { test: 'With a new\nline' }
      b = serialize(a)
      c = deserialize(b)
      c.test.should.equal('With a new\nline')
      a.test.indexOf('\n').should.not.equal(-1)
      b.indexOf('\n').should.equal(-1)
      c.test.indexOf('\n').should.not.equal(-1)
    })

    it('Can serialize and deserialize booleans', function () {
      const a = { test: true }
      const b = serialize(a)
      const c = deserialize(b)
      b.indexOf('\n').should.equal(-1)
      c.test.should.equal(true)
    })

    it('Can serialize and deserialize numbers', function () {
      const a = { test: 5 }
      const b = serialize(a)
      const c = deserialize(b)
      b.indexOf('\n').should.equal(-1)
      c.test.should.equal(5)
    })

    it('Can serialize and deserialize null', function () {
      const a = { test: null }
      const b = serialize(a)
      deserialize(b)
      b.indexOf('\n').should.equal(-1)
      assert.isNull(a.test)
    })

    it('undefined fields are removed when serialized', function () {
      const a = { bloup: undefined, hello: 'world' },
        b = serialize(a),
        c = deserialize(b)
      Object.keys(c).length.should.equal(1)
      c.hello.should.equal('world')
      assert.isUndefined(c.bloup)
    })

    it('Can serialize and deserialize a date', function () {
      const d = new Date()

      const a = { test: d }
      const b = serialize(a)
      const c = deserialize(b)
      b.indexOf('\n').should.equal(-1)
      b.should.equal('{"test":{"$$date":' + d.getTime() + '}}')
      isDate(c.test).should.equal(true)
      c.test.getTime().should.equal(d.getTime())
    })

    it('Can serialize and deserialize sub objects', function () {
      const d = new Date()

      const a = { test: { something: 39, also: d, yes: { again: 'yes' } } }
      const b = serialize(a)
      const c = deserialize(b)
      b.indexOf('\n').should.equal(-1)
      c.test.something.should.equal(39)
      c.test.also.getTime().should.equal(d.getTime())
      c.test.yes.again.should.equal('yes')
    })

    it('Can serialize and deserialize sub arrays', function () {
      const d = new Date()

      const a = { test: [39, d, { again: 'yes' }] }
      const b = serialize(a)
      const c = deserialize(b)
      b.indexOf('\n').should.equal(-1)
      c.test[0].should.equal(39)
      c.test[1].getTime().should.equal(d.getTime())
      c.test[2].again.should.equal('yes')
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
      }).to.throw()
      expect(function () {
        b = serialize(a2)
      }).to.throw()

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

      assert.strictEqual(fs.existsSync('workspace/test1.db'), false)
      const db1 = new Collection({
        name: 'workspace/test1.db',
        storage: new NodeStorage(),
      })

      await db1.loadDatabase()
      await assert.isFulfilled(db1.insert({ hello: badString }))

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
      assert.isDefined(checkObject)
      ;(function () {
        checkObject({ $bad: true })
      }).should.throw()
      ;(function () {
        checkObject({ some: 42, nested: { again: 'no', $worse: true } })
      }).should.throw()

      // This shouldn't throw since "$actuallyok" is not a field name
      checkObject({ some: 42, nested: [5, 'no', '$actuallyok', true] })
      ;(function () {
        checkObject({
          some: 42,
          nested: [5, 'no', '$actuallyok', true, { $hidden: 'useless' }],
        })
      }).should.throw()
    })

    it('Field names cannot contain a .', function () {
      assert.isDefined(checkObject)
      ;(function () {
        checkObject({ 'so.bad': true })
      }).should.throw()

      // Recursive behaviour testing done in the above test on $ signs
    })

    it('Properties with a null value dont trigger an error', function () {
      const obj = { prop: null }

      checkObject(obj)
    })

    it('Can check if an object is a primitive or not', function () {
      isPrimitiveType(5).should.equal(true)
      isPrimitiveType('sdsfdfs').should.equal(true)
      isPrimitiveType(0).should.equal(true)
      isPrimitiveType(true).should.equal(true)
      isPrimitiveType(false).should.equal(true)
      isPrimitiveType(new Date()).should.equal(true)
      isPrimitiveType([]).should.equal(true)
      isPrimitiveType([3, 'try']).should.equal(true)
      isPrimitiveType(null).should.equal(true)

      isPrimitiveType({}).should.equal(false)
      isPrimitiveType({ a: 42 }).should.equal(false)
    })
  }) // ==== End of 'Object checking' ==== //

  describe('Deep copying', function () {
    it('Should be able to deep copy any serializable model', function () {
      const d = new Date(),
        obj = { a: ['ee', 'ff', 42], date: d, subobj: { a: 'b', b: 'c' } },
        res = deepCopy(obj)
      res.a.length.should.equal(3)
      res.a[0].should.equal('ee')
      res.a[1].should.equal('ff')
      res.a[2].should.equal(42)
      res.date.getTime().should.equal(d.getTime())
      res.subobj.a.should.equal('b')
      res.subobj.b.should.equal('c')

      obj.a.push('ggg')
      // @ts-ignore
      obj.date = 'notadate'
      // @ts-ignore
      obj.subobj = []

      // Even if the original object is modified, the copied one isn't
      res.a.length.should.equal(3)
      res.a[0].should.equal('ee')
      res.a[1].should.equal('ff')
      res.a[2].should.equal(42)
      res.date.getTime().should.equal(d.getTime())
      res.subobj.a.should.equal('b')
      res.subobj.b.should.equal('c')
    })

    it('Should deep copy the contents of an array', function () {
      const a = [{ hello: 'world' }],
        b = deepCopy(a)
      b[0].hello.should.equal('world')
      b[0].hello = 'another'
      b[0].hello.should.equal('another')
      a[0].hello.should.equal('world')
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
      })
    })
  }) // ==== End of 'Deep copying' ==== //

  describe('Modifying documents', function () {
    it('Queries not containing any modifier just replace the document by the contents of the query but keep its _id', function () {
      const obj = { some: 'thing', _id: 'keepit' },
        updateQuery = { replace: 'done', bloup: [1, 8] }

      const t = modify(obj, updateQuery)
      t.replace.should.equal('done')
      t.bloup.length.should.equal(2)
      t.bloup[0].should.equal(1)
      t.bloup[1].should.equal(8)

      assert.isUndefined(t.some)
      t._id.should.equal('keepit')
    })

    it('Throw an error if trying to change the _id field in a copy-type modification', function () {
      const obj = { some: 'thing', _id: 'keepit' },
        updateQuery = { replace: 'done', bloup: [1, 8], _id: 'donttryit' }
      expect(function () {
        modify(obj, updateQuery)
      }).to.throw("You cannot change a document's _id")

      updateQuery._id = 'keepit'
      modify(obj, updateQuery) // No error thrown
    })

    it('Throw an error if trying to use modify in a mixed copy+modify way', function () {
      const obj = { some: 'thing' },
        updateQuery = { replace: 'me', $modify: 'metoo' }

      expect(function () {
        modify(obj, updateQuery)
      }).to.throw('You cannot mix modifiers and normal fields')
    })

    it('Throw an error if trying to use an inexistent modifier', function () {
      const obj = { some: 'thing' },
        updateQuery = { $set: { it: 'exists' }, $modify: 'not this one' }

      expect(function () {
        modify(obj, updateQuery)
      }).to.throw(/^Unknown modifier .modify/)
    })

    it('Throw an error if a modifier is used with a non-object argument', function () {
      const obj = { some: 'thing' },
        updateQuery = { $set: 'this exists' }

      expect(function () {
        modify(obj, updateQuery)
      }).to.throw(/Modifier .set's argument must be an object/)
    })

    describe('$set modifier', function () {
      it('Can change already set fields without modfifying the underlying object', function () {
        const obj = { some: 'thing', yup: 'yes', nay: 'noes' },
          updateQuery = { $set: { some: 'changed', nay: 'yes indeed' } },
          modified = modify(obj, updateQuery)

        Object.keys(modified).length.should.equal(3)
        modified.some.should.equal('changed')
        modified.yup.should.equal('yes')
        modified.nay.should.equal('yes indeed')

        Object.keys(obj).length.should.equal(3)
        obj.some.should.equal('thing')
        obj.yup.should.equal('yes')
        obj.nay.should.equal('noes')
      })

      it('Creates fields to set if they dont exist yet', function () {
        const obj = { yup: 'yes' },
          updateQuery = { $set: { some: 'changed', nay: 'yes indeed' } },
          modified = modify(obj, updateQuery)

        Object.keys(modified).length.should.equal(3)
        modified.some.should.equal('changed')
        modified.yup.should.equal('yes')
        modified.nay.should.equal('yes indeed')
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

        _.isEqual(modified, {
          yup: { subfield: 'changed', yop: 'yes indeed' },
          totally: { doesnt: { exist: 'now it does' } },
        }).should.equal(true)
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
        }).to.throw()
        expect(function () {
          const obj = { some: 'thing', yup: 'yes', nay: 'nope' },
            updateQuery = { $inc: { nay: 1 } }
          modify(obj, updateQuery)
        }).to.throw()
      })

      it('Can increment number fields or create and initialize them if needed', function () {
        const obj = { some: 'thing', nay: 40 }

        let modified = modify(obj, { $inc: { nay: 2 } })
        _.isEqual(modified, { some: 'thing', nay: 42 }).should.equal(true)

        // Incidentally, this tests that obj was not modified
        modified = modify(obj, { $inc: { inexistent: -6 } })
        _.isEqual(modified, {
          some: 'thing',
          nay: 40,
          inexistent: -6,
        }).should.equal(true)
      })

      it('Works recursively', function () {
        const obj = { some: 'thing', nay: { nope: 40 } }

        const modified = modify(obj, {
          $inc: { 'nay.nope': -2, 'blip.blop': 123 },
        })
        _.isEqual(modified, {
          some: 'thing',
          nay: { nope: 38 },
          blip: { blop: 123 },
        }).should.equal(true)
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
        ;(function () {
          modified = modify(obj, { $push: { arr: 'world' } })
        }).should.throw()

        // @ts-ignore
        obj = { arr: { nested: 45 } }
        ;(function () {
          modified = modify(obj, { $push: { 'arr.nested': 'world' } })
        }).should.throw()
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
        }).to.throw()
        expect(function () {
          modified = modify(obj, {
            $push: { arr: { $each: ['world'], unauthorized: true } },
          })
        }).to.throw()
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
        ;(function () {
          modified = modify(obj, {
            $push: { arr: { $slice: 1, unauthorized: true } },
          })
        }).should.throw()
        ;(function () {
          modified = modify(obj, {
            $push: { arr: { $each: [], unauthorized: true } },
          })
        }).should.throw()
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
        }).to.throw()
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
        }).to.throw()
        expect(function () {
          modified = modify(obj, {
            $addToSet: { arr: { $each: ['world'], unauthorized: true } },
          })
        }).to.throw()
      })
    }) // End of '$addToSet modifier'

    describe('$pop modifier', function () {
      it('Throw if called on a non array, a non defined field or a non integer', function () {
        let obj = { arr: 'hello' },
          modified
        ;(function () {
          modified = modify(obj, { $pop: { arr: 1 } })
        }).should.throw()

        // @ts-ignore
        obj = { bloup: 'nope' }
        expect(function () {
          modified = modify(obj, { $pop: { arr: 1 } })
        }).to.throw()

        // @ts-ignore
        obj = { arr: [1, 4, 8] }
        ;(function () {
          modified = modify(obj, { $pop: { arr: true } })
        }).should.throw()
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
        }).to.throw()
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

        modified.should.deep.equal({ some: 'thing', number: 12 })
        obj.should.deep.equal({ some: 'thing', number: 10 })
      })

      it('Will not update the field if new value is smaller than current one', function () {
        const obj = { some: 'thing', number: 10 },
          updateQuery = { $max: { number: 9 } },
          modified = modify(obj, updateQuery)

        modified.should.deep.equal({ some: 'thing', number: 10 })
      })

      it('Will create the field if it does not exist', function () {
        const obj = { some: 'thing' },
          updateQuery = { $max: { number: 10 } },
          modified = modify(obj, updateQuery)

        modified.should.deep.equal({ some: 'thing', number: 10 })
      })

      it('Works on embedded documents', function () {
        const obj = { some: 'thing', somethingElse: { number: 10 } },
          updateQuery = { $max: { 'somethingElse.number': 12 } },
          modified = modify(obj, updateQuery)

        modified.should.deep.equal({
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

        modified.should.deep.equal({ some: 'thing', number: 8 })
        obj.should.deep.equal({ some: 'thing', number: 10 })
      })

      it('Will not update the field if new value is greater than current one', function () {
        const obj = { some: 'thing', number: 10 },
          updateQuery = { $min: { number: 12 } },
          modified = modify(obj, updateQuery)

        modified.should.deep.equal({ some: 'thing', number: 10 })
      })

      it('Will create the field if it does not exist', function () {
        const obj = { some: 'thing' },
          updateQuery = { $min: { number: 10 } },
          modified = modify(obj, updateQuery)

        modified.should.deep.equal({ some: 'thing', number: 10 })
      })

      it('Works on embedded documents', function () {
        const obj = { some: 'thing', somethingElse: { number: 10 } },
          updateQuery = { $min: { 'somethingElse.number': 8 } },
          modified = modify(obj, updateQuery)

        modified.should.deep.equal({
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

      compareThings(undefined, undefined).should.equal(0)

      otherStuff.forEach(function (stuff) {
        compareThings(undefined, stuff).should.equal(-1)
        compareThings(stuff, undefined).should.equal(1)
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

      compareThings(null, null).should.equal(0)

      otherStuff.forEach(function (stuff) {
        compareThings(null, stuff).should.equal(-1)
        compareThings(stuff, null).should.equal(1)
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

      compareThings(-12, 0).should.equal(-1)
      compareThings(0, -3).should.equal(1)
      compareThings(5.7, 2).should.equal(1)
      compareThings(5.7, 12.3).should.equal(-1)
      compareThings(0, 0).should.equal(0)
      compareThings(-2.6, -2.6).should.equal(0)
      compareThings(5, 5).should.equal(0)

      otherStuff.forEach(function (stuff) {
        numbers.forEach(function (number) {
          compareThings(number, stuff).should.equal(-1)
          compareThings(stuff, number).should.equal(1)
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

      compareThings('', 'hey').should.equal(-1)
      compareThings('hey', '').should.equal(1)
      compareThings('hey', 'hew').should.equal(1)
      compareThings('hey', 'hey').should.equal(0)

      otherStuff.forEach(function (stuff) {
        strings.forEach(function (string) {
          compareThings(string, stuff).should.equal(-1)
          compareThings(stuff, string).should.equal(1)
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

      compareThings(true, true).should.equal(0)
      compareThings(false, false).should.equal(0)
      compareThings(true, false).should.equal(1)
      compareThings(false, true).should.equal(-1)

      otherStuff.forEach(function (stuff) {
        bools.forEach(function (bool) {
          compareThings(bool, stuff).should.equal(-1)
          compareThings(stuff, bool).should.equal(1)
        })
      })
    })

    it('Then dates', function () {
      const otherStuff = [{}, { hello: 'world' }, [], ['quite', 5]],
        dates = [new Date(-123), new Date(), new Date(5555), new Date(0)],
        now = new Date()

      compareThings(now, now).should.equal(0)
      compareThings(new Date(54341), now).should.equal(-1)
      compareThings(now, new Date(54341)).should.equal(1)
      compareThings(new Date(0), new Date(-54341)).should.equal(1)
      compareThings(new Date(123), new Date(4341)).should.equal(-1)

      otherStuff.forEach(function (stuff) {
        dates.forEach(function (date) {
          compareThings(date, stuff).should.equal(-1)
          compareThings(stuff, date).should.equal(1)
        })
      })
    })

    it('Then arrays', function () {
      const otherStuff = [{}, { hello: 'world' }],
        arrays = [[], ['yes'], ['hello', 5]]
      compareThings([], []).should.equal(0)
      compareThings(['hello'], []).should.equal(1)
      compareThings([], ['hello']).should.equal(-1)
      compareThings(['hello'], ['hello', 'world']).should.equal(-1)
      compareThings(['hello', 'earth'], ['hello', 'world']).should.equal(-1)
      compareThings(['hello', 'zzz'], ['hello', 'world']).should.equal(1)
      compareThings(['hello', 'world'], ['hello', 'world']).should.equal(0)

      otherStuff.forEach(function (stuff) {
        arrays.forEach(function (array) {
          compareThings(array, stuff).should.equal(-1)
          compareThings(stuff, array).should.equal(1)
        })
      })
    })

    it('And finally objects', function () {
      compareThings({}, {}).should.equal(0)
      compareThings({ a: 42 }, { a: 312 }).should.equal(-1)
      compareThings({ a: '42' }, { a: '312' }).should.equal(1)
      compareThings({ a: 42, b: 312 }, { b: 312, a: 42 }).should.equal(0)
      compareThings({ a: 42, b: 312, c: 54 }, { b: 313, a: 42 }).should.equal(
        -1,
      )
    })

    it('Can specify custom string comparison function', function () {
      compareThings('hello', 'bloup', function (a, b) {
        return a < b ? -1 : 1
      }).should.equal(1)
      compareThings('hello', 'bloup', function (a, b) {
        return a > b ? -1 : 1
      }).should.equal(-1)
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
            areThingsEqual(toTest[i], toTestAgainst[j]).should.equal(i === j)
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
          areThingsEqual(toTest[i], toTestAgainst[i]).should.equal(false)
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
          areThingsEqual([1, 2, 3], toTestAgainst[i]).should.equal(false)
          areThingsEqual(toTestAgainst[i], []).should.equal(false)

          areThingsEqual(undefined, toTestAgainst[i]).should.equal(false)
          areThingsEqual(toTestAgainst[i], undefined).should.equal(false)
        }
      })

      it('Can test objects equality', function () {
        areThingsEqual({ hello: 'world' }, {}).should.equal(false)
        areThingsEqual({ hello: 'world' }, { hello: 'mars' }).should.equal(
          false,
        )
        areThingsEqual(
          { hello: 'world' },
          { hello: 'world', temperature: 42 },
        ).should.equal(false)
        areThingsEqual(
          { hello: 'world', other: { temperature: 42 } },
          { hello: 'world', other: { temperature: 42 } },
        ).should.equal(true)
      })
    })

    describe('Getting a fields value in dot notation', function () {
      it('Return first-level and nested values', function () {
        getDotValue({ hello: 'world' }, 'hello').should.equal('world')
        getDotValue(
          { hello: 'world', type: { planet: true, blue: true } },
          'type.planet',
        ).should.equal(true)
      })

      it('Return undefined if the field cannot be found in the object', function () {
        assert.isUndefined(getDotValue({ hello: 'world' }, 'helloo'))
        assert.isUndefined(
          getDotValue({ hello: 'world', type: { planet: true } }, 'type.plane'),
        )
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
        assert.isUndefined(dv)

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
        dv.should.equal('Earth')
      })
    })

    describe('Field equality', function () {
      it('Can find documents with simple fields', function () {
        match({ test: 'yeah' }, { test: 'yea' }).should.equal(false)
        match({ test: 'yeah' }, { test: 'yeahh' }).should.equal(false)
        match({ test: 'yeah' }, { test: 'yeah' }).should.equal(true)
      })

      it('Can find documents with the dot-notation', function () {
        match({ test: { ooo: 'yeah' } }, { 'test.ooo': 'yea' }).should.equal(
          false,
        )
        match({ test: { ooo: 'yeah' } }, { 'test.oo': 'yeah' }).should.equal(
          false,
        )
        match({ test: { ooo: 'yeah' } }, { 'tst.ooo': 'yeah' }).should.equal(
          false,
        )
        match({ test: { ooo: 'yeah' } }, { 'test.ooo': 'yeah' }).should.equal(
          true,
        )
      })

      it('Cannot find undefined', function () {
        match({ test: undefined }, { test: undefined }).should.equal(false)
        match(
          { test: { pp: undefined } },
          { 'test.pp': undefined },
        ).should.equal(false)
      })

      it('Nested objects are deep-equality matched and not treated as sub-queries', function () {
        match({ a: { b: 5 } }, { a: { b: 5 } }).should.equal(true)
        match({ a: { b: 5, c: 3 } }, { a: { b: 5 } }).should.equal(false)

        match({ a: { b: 5 } }, { a: { b: { $lt: 10 } } }).should.equal(false)
        ;(function () {
          match({ a: { b: 5 } }, { a: { $or: [{ b: 10 }, { b: 5 }] } })
        }).should.throw()
      })

      it('Can match for field equality inside an array with the dot notation', function () {
        match(
          { a: true, b: ['node', 'embedded', 'database'] },
          { 'b.1': 'node' },
        ).should.equal(false)
        match(
          { a: true, b: ['node', 'embedded', 'database'] },
          { 'b.1': 'embedded' },
        ).should.equal(true)
        match(
          { a: true, b: ['node', 'embedded', 'database'] },
          { 'b.1': 'database' },
        ).should.equal(false)
      })
    })

    describe('Regular expression matching', function () {
      it('Matching a non-string to a regular expression always yields false', function () {
        const d = new Date(),
          r = new RegExp(String(d.getTime()))

        match({ test: true }, { test: /true/ }).should.equal(false)
        match({ test: null }, { test: /null/ }).should.equal(false)
        match({ test: 42 }, { test: /42/ }).should.equal(false)
        match({ test: d }, { test: r }).should.equal(false)
      })

      it('Can match strings using basic querying', function () {
        match({ test: 'true' }, { test: /true/ }).should.equal(true)
        match({ test: 'babaaaar' }, { test: /aba+r/ }).should.equal(true)
        match({ test: 'babaaaar' }, { test: /^aba+r/ }).should.equal(false)
        match({ test: 'true' }, { test: /t[ru]e/ }).should.equal(false)
      })

      it('Can match strings using the $regex operator', function () {
        match({ test: 'true' }, { test: { $regex: /true/ } }).should.equal(true)
        match({ test: 'babaaaar' }, { test: { $regex: /aba+r/ } }).should.equal(
          true,
        )
        match(
          { test: 'babaaaar' },
          { test: { $regex: /^aba+r/ } },
        ).should.equal(false)
        match({ test: 'true' }, { test: { $regex: /t[ru]e/ } }).should.equal(
          false,
        )
      })

      it('Will throw if $regex operator is used with a non regex value', function () {
        expect(function () {
          match({ test: 'true' }, { test: { $regex: 42 } })
        }).to.throw()
        expect(function () {
          match({ test: 'true' }, { test: { $regex: 'true' } })
        }).to.throw()
      })

      it('Can use the $regex operator in cunjunction with other operators', function () {
        match(
          { test: 'helLo' },
          { test: { $regex: /ll/i, $nin: ['helL', 'helLop'] } },
        ).should.equal(true)
        match(
          { test: 'helLo' },
          { test: { $regex: /ll/i, $nin: ['helLo', 'helLop'] } },
        ).should.equal(false)
      })

      it('Can use dot-notation', function () {
        match(
          { test: { nested: 'true' } },
          { 'test.nested': /true/ },
        ).should.equal(true)
        match(
          { test: { nested: 'babaaaar' } },
          { 'test.nested': /^aba+r/ },
        ).should.equal(false)

        match(
          { test: { nested: 'true' } },
          { 'test.nested': { $regex: /true/ } },
        ).should.equal(true)
        match(
          { test: { nested: 'babaaaar' } },
          { 'test.nested': { $regex: /^aba+r/ } },
        ).should.equal(false)
      })
    })

    describe('$lt', function () {
      it('Cannot compare a field to an object, an array, null or a boolean, it will return false', function () {
        match({ a: 5 }, { a: { $lt: { a: 6 } } }).should.equal(false)
        match({ a: 5 }, { a: { $lt: [6, 7] } }).should.equal(false)
        match({ a: 5 }, { a: { $lt: null } }).should.equal(false)
        match({ a: 5 }, { a: { $lt: true } }).should.equal(false)
      })

      it('Can compare numbers, with or without dot notation', function () {
        match({ a: 5 }, { a: { $lt: 6 } }).should.equal(true)
        match({ a: 5 }, { a: { $lt: 5 } }).should.equal(false)
        match({ a: 5 }, { a: { $lt: 4 } }).should.equal(false)

        match({ a: { b: 5 } }, { 'a.b': { $lt: 6 } }).should.equal(true)
        match({ a: { b: 5 } }, { 'a.b': { $lt: 3 } }).should.equal(false)
      })

      it('Can compare strings, with or without dot notation', function () {
        match({ a: 'nedb' }, { a: { $lt: 'nedc' } }).should.equal(true)
        match({ a: 'nedb' }, { a: { $lt: 'neda' } }).should.equal(false)

        match({ a: { b: 'nedb' } }, { 'a.b': { $lt: 'nedc' } }).should.equal(
          true,
        )
        match({ a: { b: 'nedb' } }, { 'a.b': { $lt: 'neda' } }).should.equal(
          false,
        )
      })

      it('If field is an array field, a match means a match on at least one element', function () {
        match({ a: [5, 10] }, { a: { $lt: 4 } }).should.equal(false)
        match({ a: [5, 10] }, { a: { $lt: 6 } }).should.equal(true)
        match({ a: [5, 10] }, { a: { $lt: 11 } }).should.equal(true)
      })

      it('Works with dates too', function () {
        match(
          { a: new Date(1000) },
          { a: { $gte: new Date(1001) } },
        ).should.equal(false)
        match(
          { a: new Date(1000) },
          { a: { $lt: new Date(1001) } },
        ).should.equal(true)
      })
    })

    // General behaviour is tested in the block about $lt. Here we just test operators work
    describe('Other comparison operators: $lte, $gt, $gte, $ne, $in, $exists', function () {
      it('$lte', function () {
        match({ a: 5 }, { a: { $lte: 6 } }).should.equal(true)
        match({ a: 5 }, { a: { $lte: 5 } }).should.equal(true)
        match({ a: 5 }, { a: { $lte: 4 } }).should.equal(false)
      })

      it('$gt', function () {
        match({ a: 5 }, { a: { $gt: 6 } }).should.equal(false)
        match({ a: 5 }, { a: { $gt: 5 } }).should.equal(false)
        match({ a: 5 }, { a: { $gt: 4 } }).should.equal(true)
      })

      it('$gte', function () {
        match({ a: 5 }, { a: { $gte: 6 } }).should.equal(false)
        match({ a: 5 }, { a: { $gte: 5 } }).should.equal(true)
        match({ a: 5 }, { a: { $gte: 4 } }).should.equal(true)
      })

      it('$ne', function () {
        match({ a: 5 }, { a: { $ne: 4 } }).should.equal(true)
        match({ a: 5 }, { a: { $ne: 5 } }).should.equal(false)
        match({ a: 5 }, { b: { $ne: 5 } }).should.equal(true)
        match({ a: false }, { a: { $ne: false } }).should.equal(false)
      })

      it('$in', function () {
        match({ a: 5 }, { a: { $in: [6, 8, 9] } }).should.equal(false)
        match({ a: 6 }, { a: { $in: [6, 8, 9] } }).should.equal(true)
        match({ a: 7 }, { a: { $in: [6, 8, 9] } }).should.equal(false)
        match({ a: 8 }, { a: { $in: [6, 8, 9] } }).should.equal(true)
        match({ a: 9 }, { a: { $in: [6, 8, 9] } }).should.equal(true)
        ;(function () {
          match({ a: 5 }, { a: { $in: 5 } })
        }).should.throw()
      })

      it('$nin', function () {
        match({ a: 5 }, { a: { $nin: [6, 8, 9] } }).should.equal(true)
        match({ a: 6 }, { a: { $nin: [6, 8, 9] } }).should.equal(false)
        match({ a: 7 }, { a: { $nin: [6, 8, 9] } }).should.equal(true)
        match({ a: 8 }, { a: { $nin: [6, 8, 9] } }).should.equal(false)
        match({ a: 9 }, { a: { $nin: [6, 8, 9] } }).should.equal(false)

        // Matches if field doesn't exist
        match({ a: 9 }, { b: { $nin: [6, 8, 9] } }).should.equal(true)
        ;(function () {
          match({ a: 5 }, { a: { $in: 5 } })
        }).should.throw()
      })

      it('$exists', function () {
        match({ a: 5 }, { a: { $exists: 1 } }).should.equal(true)
        match({ a: 5 }, { a: { $exists: true } }).should.equal(true)
        match({ a: 5 }, { a: { $exists: new Date() } }).should.equal(true)
        match({ a: 5 }, { a: { $exists: '' } }).should.equal(true)
        match({ a: 5 }, { a: { $exists: [] } }).should.equal(true)
        match({ a: 5 }, { a: { $exists: {} } }).should.equal(true)

        match({ a: 5 }, { a: { $exists: 0 } }).should.equal(false)
        match({ a: 5 }, { a: { $exists: false } }).should.equal(false)
        match({ a: 5 }, { a: { $exists: null } }).should.equal(false)
        match({ a: 5 }, { a: { $exists: undefined } }).should.equal(false)

        match({ a: 5 }, { b: { $exists: true } }).should.equal(false)

        match({ a: 5 }, { b: { $exists: false } }).should.equal(true)
      })
    })

    describe('Comparing on arrays', function () {
      it('Can perform a direct array match', function () {
        match(
          { planets: ['Earth', 'Mars', 'Pluto'], something: 'else' },
          { planets: ['Earth', 'Mars'] },
        ).should.equal(false)
        match(
          { planets: ['Earth', 'Mars', 'Pluto'], something: 'else' },
          { planets: ['Earth', 'Mars', 'Pluto'] },
        ).should.equal(true)
        match(
          { planets: ['Earth', 'Mars', 'Pluto'], something: 'else' },
          { planets: ['Earth', 'Pluto', 'Mars'] },
        ).should.equal(false)
      })

      it('Can query on the size of an array field', function () {
        // Non nested documents
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { childrens: { $size: 0 } },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { childrens: { $size: 1 } },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { childrens: { $size: 2 } },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { childrens: { $size: 3 } },
        ).should.equal(true)

        // Nested documents
        match(
          {
            hello: 'world',
            description: { satellites: ['Moon', 'Hubble'], diameter: 6300 },
          },
          { 'description.satellites': { $size: 0 } },
        ).should.equal(false)
        match(
          {
            hello: 'world',
            description: { satellites: ['Moon', 'Hubble'], diameter: 6300 },
          },
          { 'description.satellites': { $size: 1 } },
        ).should.equal(false)
        match(
          {
            hello: 'world',
            description: { satellites: ['Moon', 'Hubble'], diameter: 6300 },
          },
          { 'description.satellites': { $size: 2 } },
        ).should.equal(true)
        match(
          {
            hello: 'world',
            description: { satellites: ['Moon', 'Hubble'], diameter: 6300 },
          },
          { 'description.satellites': { $size: 3 } },
        ).should.equal(false)

        // Using a projected array
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.names': { $size: 0 } },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.names': { $size: 1 } },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.names': { $size: 2 } },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.names': { $size: 3 } },
        ).should.equal(true)
      })

      it('$size operator works with empty arrays', function () {
        match({ childrens: [] }, { childrens: { $size: 0 } }).should.equal(true)
        match({ childrens: [] }, { childrens: { $size: 2 } }).should.equal(
          false,
        )
        match({ childrens: [] }, { childrens: { $size: 3 } }).should.equal(
          false,
        )
      })

      it('Should throw an error if a query operator is used without comparing to an integer', function () {
        expect(function () {
          match({ a: [1, 5] }, { a: { $size: 1.4 } })
        }).to.throw()
        expect(function () {
          match({ a: [1, 5] }, { a: { $size: 'fdf' } })
        }).to.throw()
        expect(function () {
          match({ a: [1, 5] }, { a: { $size: { $lt: 5 } } })
        }).to.throw()
      })

      it('Using $size operator on a non-array field should prevent match but not throw', function () {
        match({ a: 5 }, { a: { $size: 1 } }).should.equal(false)
      })

      it('Can use $size several times in the same matcher', function () {
        match(
          { childrens: ['Riri', 'Fifi', 'Loulou'] },
          // @ts-ignore
          { childrens: { $size: 3, $size: 3 } },
        ).should.equal(true)
        match(
          { childrens: ['Riri', 'Fifi', 'Loulou'] },
          // @ts-ignore
          { childrens: { $size: 3, $size: 4 } },
        ).should.equal(false) // Of course this can never be true
      })

      it('Can query array documents with multiple simultaneous conditions', function () {
        // Non nested documents
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { childrens: { $elemMatch: { name: 'Dewey', age: 7 } } },
        ).should.equal(true)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { childrens: { $elemMatch: { name: 'Dewey', age: 12 } } },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { childrens: { $elemMatch: { name: 'Louie', age: 3 } } },
        ).should.equal(false)

        // Nested documents
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
        ).should.equal(true)
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
        ).should.equal(false)
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
        ).should.equal(false)
      })

      it('$elemMatch operator works with empty arrays', function () {
        match(
          { childrens: [] },
          { childrens: { $elemMatch: { name: 'Mitsos' } } },
        ).should.equal(false)
        match(
          { childrens: [] },
          { childrens: { $elemMatch: {} } },
        ).should.equal(false)
      })

      it('Can use more complex comparisons inside nested query documents', function () {
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
        ).should.equal(true)
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
        ).should.equal(true)
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
        ).should.equal(false)
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
        ).should.equal(false)
      })
    })

    describe('Logical operators $or, $and, $not', function () {
      it('Any of the subqueries should match for an $or to match', function () {
        match(
          { hello: 'world' },
          { $or: [{ hello: 'pluton' }, { hello: 'world' }] },
        ).should.equal(true)
        match(
          { hello: 'pluton' },
          { $or: [{ hello: 'pluton' }, { hello: 'world' }] },
        ).should.equal(true)
        match(
          { hello: 'nope' },
          { $or: [{ hello: 'pluton' }, { hello: 'world' }] },
        ).should.equal(false)
        match(
          { hello: 'world', age: 15 },
          { $or: [{ hello: 'pluton' }, { age: { $lt: 20 } }] },
        ).should.equal(true)
        match(
          { hello: 'world', age: 15 },
          { $or: [{ hello: 'pluton' }, { age: { $lt: 10 } }] },
        ).should.equal(false)
      })

      it('All of the subqueries should match for an $and to match', function () {
        match(
          { hello: 'world', age: 15 },
          { $and: [{ age: 15 }, { hello: 'world' }] },
        ).should.equal(true)
        match(
          { hello: 'world', age: 15 },
          { $and: [{ age: 16 }, { hello: 'world' }] },
        ).should.equal(false)
        match(
          { hello: 'world', age: 15 },
          { $and: [{ hello: 'world' }, { age: { $lt: 20 } }] },
        ).should.equal(true)
        match(
          { hello: 'world', age: 15 },
          { $and: [{ hello: 'pluton' }, { age: { $lt: 20 } }] },
        ).should.equal(false)
      })

      it('Subquery should not match for a $not to match', function () {
        match({ a: 5, b: 10 }, { a: 5 }).should.equal(true)
        match({ a: 5, b: 10 }, { $not: { a: 5 } }).should.equal(false)
      })

      it('Logical operators are all top-level, only other logical operators can be above', function () {
        expect(function () {
          match({ a: { b: 7 } }, { a: { $or: [{ b: 5 }, { b: 7 }] } })
        }).to.throw()
        match(
          { a: { b: 7 } },
          { $or: [{ 'a.b': 5 }, { 'a.b': 7 }] },
        ).should.equal(true)
      })

      it('Logical operators can be combined as long as they are on top of the decision tree', function () {
        match(
          { a: 5, b: 7, c: 12 },
          {
            $or: [
              { $and: [{ a: 5 }, { b: 8 }] },
              { $and: [{ a: 5 }, { c: { $lt: 40 } }] },
            ],
          },
        ).should.equal(true)
        match(
          { a: 5, b: 7, c: 12 },
          {
            $or: [
              { $and: [{ a: 5 }, { b: 8 }] },
              { $and: [{ a: 5 }, { c: { $lt: 10 } }] },
            ],
          },
        ).should.equal(false)
      })

      it('Should throw an error if a logical operator is used without an array or if an unknown logical operator is used', function () {
        expect(function () {
          // @ts-ignore
          match({ a: 5 }, { $or: { a: 5, a: 6 } })
        }).to.throw()
        expect(function () {
          // @ts-ignore
          match({ a: 5 }, { $and: { a: 5, a: 6 } })
        }).to.throw()
        expect(function () {
          match({ a: 5 }, { $unknown: [{ a: 5 }] })
        }).to.throw()
      })
    })

    describe('Comparison operator $where', function () {
      it('Function should match and not match correctly', function () {
        match(
          { a: 4 },
          {
            $where: function () {
              return this.a === 4
            },
          },
        ).should.equal(true)
        match(
          { a: 4 },
          {
            $where: function () {
              return this.a === 5
            },
          },
        ).should.equal(false)
      })

      it('Should throw an error if the $where function is not, in fact, a function', function () {
        expect(function () {
          match({ a: 4 }, { $where: 'not a function' })
        }).to.throw()
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
        }).to.throw()
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
        match(
          { firstName: 'John', lastName: 'Doe', email: 'john.doe@gmail.com' },
          { $where: checkEmail },
        ).should.equal(true)
        match(
          { firstName: 'john', lastName: 'doe', email: 'john.doe@gmail.com' },
          { $where: checkEmail },
        ).should.equal(true)
        match(
          { firstName: 'Jane', lastName: 'Doe', email: 'john.doe@gmail.com' },
          { $where: checkEmail },
        ).should.equal(false)
        match(
          {
            firstName: 'John',
            lastName: 'Deere',
            email: 'john.doe@gmail.com',
          },
          { $where: checkEmail },
        ).should.equal(false)
        match(
          { lastName: 'Doe', email: 'john.doe@gmail.com' },
          { $where: checkEmail },
        ).should.equal(false)
      })
    })

    describe('Array fields', function () {
      it('Field equality', function () {
        match({ tags: ['node', 'js', 'db'] }, { tags: 'python' }).should.equal(
          false,
        )
        match({ tags: ['node', 'js', 'db'] }, { tagss: 'js' }).should.equal(
          false,
        )
        match({ tags: ['node', 'js', 'db'] }, { tags: 'js' }).should.equal(true)
        match(
          { tags: ['node', 'js', 'db'] },
          // @ts-ignore
          { tags: 'js', tags: 'node' },
        ).should.equal(true)

        // Mixed matching with array and non array
        match(
          { tags: ['node', 'js', 'db'], nedb: true },
          { tags: 'js', nedb: true },
        ).should.equal(true)

        // Nested matching
        match(
          { number: 5, data: { tags: ['node', 'js', 'db'] } },
          { 'data.tags': 'js' },
        ).should.equal(true)
        match(
          { number: 5, data: { tags: ['node', 'js', 'db'] } },
          { 'data.tags': 'j' },
        ).should.equal(false)
      })

      it('With one comparison operator', function () {
        match({ ages: [3, 7, 12] }, { ages: { $lt: 2 } }).should.equal(false)
        match({ ages: [3, 7, 12] }, { ages: { $lt: 3 } }).should.equal(false)
        match({ ages: [3, 7, 12] }, { ages: { $lt: 4 } }).should.equal(true)
        match({ ages: [3, 7, 12] }, { ages: { $lt: 8 } }).should.equal(true)
        match({ ages: [3, 7, 12] }, { ages: { $lt: 13 } }).should.equal(true)
      })

      it('Works with arrays that are in subdocuments', function () {
        match(
          { children: { ages: [3, 7, 12] } },
          { 'children.ages': { $lt: 2 } },
        ).should.equal(false)
        match(
          { children: { ages: [3, 7, 12] } },
          { 'children.ages': { $lt: 3 } },
        ).should.equal(false)
        match(
          { children: { ages: [3, 7, 12] } },
          { 'children.ages': { $lt: 4 } },
        ).should.equal(true)
        match(
          { children: { ages: [3, 7, 12] } },
          { 'children.ages': { $lt: 8 } },
        ).should.equal(true)
        match(
          { children: { ages: [3, 7, 12] } },
          { 'children.ages': { $lt: 13 } },
        ).should.equal(true)
      })

      it('Can query inside arrays thanks to dot notation', function () {
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.age': { $lt: 2 } },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.age': { $lt: 3 } },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.age': { $lt: 4 } },
        ).should.equal(true)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.age': { $lt: 8 } },
        ).should.equal(true)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.age': { $lt: 13 } },
        ).should.equal(true)

        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.name': 'Louis' },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.name': 'Louie' },
        ).should.equal(true)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.name': 'Lewi' },
        ).should.equal(false)
      })

      it('Can query for a specific element inside arrays thanks to dot notation', function () {
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.0.name': 'Louie' },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.1.name': 'Louie' },
        ).should.equal(false)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.2.name': 'Louie' },
        ).should.equal(true)
        match(
          {
            childrens: [
              { name: 'Huey', age: 3 },
              { name: 'Dewey', age: 7 },
              { name: 'Louie', age: 12 },
            ],
          },
          { 'childrens.3.name': 'Louie' },
        ).should.equal(false)
      })

      it('A single array-specific operator and the query is treated as array specific', function () {
        expect(function () {
          match(
            { childrens: ['Riri', 'Fifi', 'Loulou'] },
            { childrens: { Fifi: true, $size: 3 } },
          )
        }).to.throw()
      })

      it('Can mix queries on array fields and non array filds with array specific operators', function () {
        match(
          { uncle: 'Donald', nephews: ['Riri', 'Fifi', 'Loulou'] },
          { nephews: { $size: 2 }, uncle: 'Donald' },
        ).should.equal(false)
        match(
          { uncle: 'Donald', nephews: ['Riri', 'Fifi', 'Loulou'] },
          { nephews: { $size: 3 }, uncle: 'Donald' },
        ).should.equal(true)
        match(
          { uncle: 'Donald', nephews: ['Riri', 'Fifi', 'Loulou'] },
          { nephews: { $size: 4 }, uncle: 'Donald' },
        ).should.equal(false)

        match(
          { uncle: 'Donals', nephews: ['Riri', 'Fifi', 'Loulou'] },
          { nephews: { $size: 3 }, uncle: 'Picsou' },
        ).should.equal(false)
        match(
          { uncle: 'Donald', nephews: ['Riri', 'Fifi', 'Loulou'] },
          { nephews: { $size: 3 }, uncle: 'Donald' },
        ).should.equal(true)
        match(
          { uncle: 'Donald', nephews: ['Riri', 'Fifi', 'Loulou'] },
          { nephews: { $size: 3 }, uncle: 'Daisy' },
        ).should.equal(false)
      })
    })
  }) // ==== End of 'Querying' ==== //
})
