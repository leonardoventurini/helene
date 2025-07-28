import { EJSON } from './ejson'
import { describe, expect, test } from 'bun:test'

/**
 * Mock ObjectId object.
 */
class ObjectId {
  constructor(private readonly id: string) {}

  _bsontype = 'ObjectId'

  toString() {
    return this.id
  }
}

class model {
  $__ = {
    foo: 'bar',
  }

  constructor(public readonly _doc: any) {}
}

describe('EJSON functionality', () => {
  test('should convert mongoose ids to string', () => {
    const id = new ObjectId('5f9b9b9b9b9b9b9b9b9b9b9b')
    const json = EJSON.stringify({ id })

    expect(json).toEqual('{"id":"5f9b9b9b9b9b9b9b9b9b9b9b"}')
    expect(EJSON.parse(json)).toEqual({ id: id.toString() })
  })

  test('should convert mongoose models to plain objects', () => {
    const doc = new model({ hello: 'world' })
    const json = EJSON.stringify(doc)

    expect(json).toEqual('{"hello":"world"}')
    expect(EJSON.parse(json)).toEqual(doc._doc)
  })
})
