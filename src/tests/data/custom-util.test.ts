import { uid } from '../../data/custom-utils'

describe('customUtils', function () {
  describe('uid', function () {
    it('Generates a string of the expected length', function () {
      uid(3).length.should.equal(3)
      uid(16).length.should.equal(16)
      uid(42).length.should.equal(42)
      uid(1000).length.should.equal(1000)
    })

    // Very small probability of conflict
    it('Generated uids should not be the same', function () {
      uid(56).should.not.equal(uid(56))
    })
  })
})
