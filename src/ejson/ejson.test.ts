import { EJSON } from './ejson'
import { expect, test, describe } from 'bun:test'

test('should be able to parse a JSON string', () => {
  const json = { date: new Date() }
  const str = EJSON.stringify(json)
  const parsed = EJSON.parse(str)
  expect(parsed.date).toBeInstanceOf(Date)
})

test('option: keyOrderSensitive', () => {
  expect(
    EJSON.equals(
      { a: { b: 1, c: 2 }, d: { e: 3, f: 4 } },
      { d: { f: 4, e: 3 }, a: { c: 2, b: 1 } },
    ),
  ).toBeTruthy()

  expect(
    EJSON.equals(
      { a: { b: 1, c: 2 }, d: { e: 3, f: 4 } },
      { d: { f: 4, e: 3 }, a: { c: 2, b: 1 } },
      { keyOrderSensitive: true },
    ),
  ).toBeFalsy()

  expect(
    EJSON.equals(
      { a: { b: 1, c: 2 }, d: { e: 3, f: 4 } },
      { a: { c: 2, b: 1 }, d: { f: 4, e: 3 } },
      { keyOrderSensitive: true },
    ),
  ).toBeFalsy()

  expect(
    EJSON.equals({ a: {} }, { a: { b: 2 } }, { keyOrderSensitive: true }),
  ).toBeFalsy()
  expect(
    EJSON.equals({ a: { b: 2 } }, { a: {} }, { keyOrderSensitive: true }),
  ).toBeFalsy()
})

test('nesting and literal', () => {
  const date = new Date()
  const obj = { $date: date }
  const eObj = EJSON.toJSONValue(obj)
  const roundTrip = EJSON.fromJSONValue(eObj)
  expect(obj).toEqual(roundTrip)
})

describe('equality', () => {
  test('should validate EJSON equality of objects', () => {
    expect(EJSON.equals({ a: 1, b: 2, c: 3 }, { a: 1, c: 3, b: 2 })).toBe(true)
    expect(EJSON.equals({ a: 1, b: 2 }, { a: 1, c: 3, b: 2 })).toBe(false)
    expect(EJSON.equals({ a: 1, b: 2, c: 3 }, { a: 1, b: 2 })).toBe(false)
    expect(EJSON.equals({ a: 1, b: 2, c: 3 }, { a: 1, c: 3, b: 4 })).toBe(false)
    expect(EJSON.equals({ a: {} }, { a: { b: 2 } })).toBe(false)
    expect(EJSON.equals({ a: { b: 2 } }, { a: {} })).toBe(false)
  })

  test('should validate EJSON equality for arrays and objects', () => {
    // Objects and Arrays were previously mistaken, which is why
    // we add some extra tests for them here.
    expect(EJSON.equals([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBe(true)
    expect(EJSON.equals([1, 2, 3, 4, 5], [1, 2, 3, 4])).toBe(false)
    expect(EJSON.equals([1, 2, 3, 4], { 0: 1, 1: 2, 2: 3, 3: 4 })).toBe(false)
    expect(EJSON.equals({ 0: 1, 1: 2, 2: 3, 3: 4 }, [1, 2, 3, 4])).toBe(false)
    expect(EJSON.equals({}, [])).toBe(false)
    expect(EJSON.equals([], {})).toBe(false)
  })
})

describe('equality and falsiness', () => {
  test('should validate EJSON equality with null and undefined', () => {
    expect(EJSON.equals(null, null)).toBe(true)
    expect(EJSON.equals(undefined, undefined)).toBe(true)
    expect(EJSON.equals({ foo: 'foo' }, null)).toBe(false)
    expect(EJSON.equals(null, { foo: 'foo' })).toBe(false)
    expect(EJSON.equals(undefined, { foo: 'foo' })).toBe(false)
    expect(EJSON.equals({ foo: 'foo' }, undefined)).toBe(false)
  })
})

describe('NaN and Inf', () => {
  test('should handle special values in EJSON', () => {
    expect(EJSON.parse('{"$InfNaN": 1}')).toBe(Infinity)
    expect(EJSON.parse('{"$InfNaN": -1}')).toBe(-Infinity)
    expect(Number.isNaN(EJSON.parse('{"$InfNaN": 0}'))).toBe(true)
    expect(EJSON.parse(EJSON.stringify(Infinity))).toBe(Infinity)
    expect(EJSON.parse(EJSON.stringify(-Infinity))).toBe(-Infinity)
    expect(Number.isNaN(EJSON.parse(EJSON.stringify(NaN)))).toBe(true)
    expect(EJSON.equals(NaN, NaN)).toBe(true)
    expect(EJSON.equals(Infinity, Infinity)).toBe(true)
    expect(EJSON.equals(-Infinity, -Infinity)).toBe(true)
    expect(EJSON.equals(Infinity, -Infinity)).toBe(false)
    expect(EJSON.equals(Infinity, NaN)).toBe(false)
    expect(EJSON.equals(Infinity, 0)).toBe(false)
    expect(EJSON.equals(NaN, 0)).toBe(false)

    expect(
      EJSON.equals(EJSON.parse('{"a": {"$InfNaN": 1}}'), { a: Infinity }),
    ).toBe(true)
    expect(EJSON.equals(EJSON.parse('{"a": {"$InfNaN": 0}}'), { a: NaN })).toBe(
      true,
    )
  })
})

describe('EJSON clone functionality', () => {
  const performCloneTest = (inputValue: any) => {
    const clonedValue = EJSON.clone(inputValue)
    expect(EJSON.equals(inputValue, clonedValue)).toBe(true)
    expect(clonedValue).toEqual(inputValue)
  }

  test('clones basic types', () => {
    performCloneTest(null)
    performCloneTest(undefined)
    performCloneTest(42)
    performCloneTest('asdf')
  })

  test('clones arrays', () => {
    performCloneTest([1, 2, 3])
    performCloneTest([1, 'fasdf', { foo: 42 }])
  })

  test('clones objects', () => {
    performCloneTest({ x: 42, y: 'asdf' })
  })

  test('clones arguments for compatibility', () => {
    function cloneArgsTest() {
      // eslint-disable-next-line prefer-rest-params
      const clonedArgs = EJSON.clone(arguments)
      expect(clonedArgs).toEqual([1, 2, 'foo', [4]])
    }

    // @ts-ignore
    cloneArgsTest(1, 2, 'foo', [4])
  })
})

describe('EJSON stringify functionality', () => {
  test('handles basic types', () => {
    expect(EJSON.stringify(null)).toBe('null')
    expect(EJSON.stringify(true)).toBe('true')
    expect(EJSON.stringify(false)).toBe('false')
    expect(EJSON.stringify(123)).toBe('123')
    expect(EJSON.stringify('abc')).toBe('"abc"')
  })

  describe('handles arrays', () => {
    test('without options', () => {
      expect(EJSON.stringify([1, 2, 3])).toBe('[1,2,3]')
    })

    test('with indentation', () => {
      expect(EJSON.stringify([1, 2, 3], { indent: true })).toBe(
        '[\n  1,\n  2,\n  3\n]',
      )
      expect(EJSON.stringify([1, 2, 3], { indent: 4 })).toBe(
        '[\n    1,\n    2,\n    3\n]',
      )
      expect(EJSON.stringify([1, 2, 3], { indent: '--' })).toBe(
        '[\n--1,\n--2,\n--3\n]',
      )
    })

    test('with canonical setting', () => {
      expect(EJSON.stringify([1, 2, 3], { canonical: false })).toBe('[1,2,3]')
      expect(
        EJSON.stringify([1, 2, 3], { indent: true, canonical: false }),
      ).toBe('[\n  1,\n  2,\n  3\n]')
    })
  })

  describe('handles objects', () => {
    const testObj = { b: [2, { d: 4, c: 3 }], a: 1 }

    test('with canonical setting', () => {
      expect(EJSON.stringify(testObj, { canonical: true })).toBe(
        '{"a":1,"b":[2,{"c":3,"d":4}]}',
      )
      expect(EJSON.stringify(testObj, { canonical: false })).toBe(
        '{"b":[2,{"d":4,"c":3}],"a":1}',
      )
    })

    test('with indentation and canonical setting', () => {
      expect(EJSON.stringify(testObj, { indent: true, canonical: true })).toBe(
        '{\n  "a": 1,\n  "b": [\n    2,\n    {\n      "c": 3,\n      "d": 4\n    }\n  ]\n}',
      )
      expect(EJSON.stringify(testObj, { indent: true, canonical: false })).toBe(
        '{\n  "b": [\n    2,\n    {\n      "d": 4,\n      "c": 3\n    }\n  ],\n  "a": 1\n}',
      )
    })
  })
})

test('stringify should ignore circular references in object', () => {
  const obj: any = { a: true, b: null }
  obj.obj = obj
  expect(EJSON.stringify(obj)).toBe('{"a":true,"b":null}')
})

test('stringify should ignore circular references in array', () => {
  const arr: any[] = [{}, false, null, 21345, 'asdf']
  arr.push(arr)
  expect(EJSON.stringify(arr)).toBe('[{},false,null,21345,"asdf"]')
})

test('stringify should ignore circular references in nested object', () => {
  const obj: any = { a: true, b: null, c: {} }
  obj.c.obj = obj
  expect(EJSON.stringify(obj)).toBe('{"a":true,"b":null,"c":{}}')
})

test('parse', () => {
  expect(EJSON.parse('[1,2,3]')).toEqual([1, 2, 3])
  expect(() => EJSON.parse(null)).toThrow(/argument should be a string/)
})

test('regexp', () => {
  expect(EJSON.stringify(/foo/gi)).toEqual('{"$regexp":"foo","$flags":"gi"}')
  const d = new RegExp('hello world', 'gi')
  expect(EJSON.stringify(d)).toEqual('{"$regexp":"hello world","$flags":"gi"}')

  const obj = { $regexp: 'foo', $flags: 'gi' }
  const eObj = EJSON.toJSONValue(obj)
  const roundTrip = EJSON.fromJSONValue(eObj)
  expect(obj).toEqual(roundTrip)
})

test('handle objects with length property', () => {
  class Widget {
    length = 10
  }

  const widget = new Widget()
  const toJsonWidget = EJSON.toJSONValue(widget)
  expect(widget).toEqual(toJsonWidget)

  const fromJsonWidget = EJSON.fromJSONValue(widget)
  expect(widget).toEqual(fromJsonWidget)

  const strWidget = EJSON.stringify(widget)
  expect(strWidget).toEqual('{"length":10}')

  const parsedWidget = EJSON.parse('{"length":10}')
  expect({ length: 10 }).toEqual(parsedWidget)

  const widget2 = new Widget()
  expect(widget).toEqual(widget2)

  const clonedWidget = EJSON.clone(widget)
  expect(widget).toEqual(clonedWidget)
})
