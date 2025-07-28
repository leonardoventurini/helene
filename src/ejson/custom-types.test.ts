import { EJSON } from './ejson'
import { expect, test } from 'bun:test'
import { CustomModels } from '../test/custom-models'

const testSameConstructors = (someObj, compareWith) => {
  expect(someObj.constructor).toEqual(compareWith.constructor)

  if (typeof someObj === 'object') {
    Object.keys(someObj).forEach(key => {
      const value = someObj[key]
      testSameConstructors(value, compareWith[key])
    })
  }
}

const testReallyEqual = (someObj, compareWith) => {
  expect(someObj).toEqual(compareWith)
  testSameConstructors(someObj, compareWith)
}

const testRoundTrip = someObj => {
  const str = EJSON.stringify(someObj)

  const roundTrip = EJSON.parse(str)

  testReallyEqual(someObj, roundTrip)
}

const testCustomObject = someObj => {
  testRoundTrip(someObj)
  testReallyEqual(someObj, EJSON.clone(someObj))
}

test('custom types', () => {
  CustomModels.addTypes()

  const address = new CustomModels.Address('Montreal', 'Quebec')

  testCustomObject({ address: address })

  // Test that difference is detected even if they
  // have similar toJSONValue results:
  const nakedA = { city: 'Montreal', state: 'Quebec' }

  expect(nakedA).not.toStrictEqual(address)
  expect(address).not.toStrictEqual(nakedA)

  const holder = new CustomModels.Holder(nakedA)

  expect(holder.toJSONValue()).toEqual(address.toJSONValue()) // sanity check

  expect(holder).not.toEqual(address)
  expect(address).not.toEqual(holder)

  const d = new Date()
  const obj = new CustomModels.Person('John Doe', d, address)

  testCustomObject(obj)

  // Test clone is deep:
  const clone = EJSON.clone(obj)
  clone.address.city = 'Sherbrooke'
  expect(obj).not.toEqual(clone)
})
