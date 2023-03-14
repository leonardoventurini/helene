import { assert } from 'chai'

import fs from 'fs'

import path from 'path'

import async from 'async'
import { noop } from 'lodash'
import { Collection } from '../../data/collection'
import { Persistence } from '../../data/persistence'

const testDb = 'workspace/test.db'

// Test that even if a callback throws an exception, the next DB operations will still be executed
// We prevent Mocha from catching the exception we throw on purpose by remembering all current handlers, remove them and register them back after test ends
// @todo The `async` package changed, so exceptions do cause the queue to stop. This test is now useless, but I'm keeping it for now.
function testThrowInCallback(d, done) {
  const currentUncaughtExceptionHandlers =
    process.listeners('uncaughtException')

  process.removeAllListeners('uncaughtException')

  process.on('uncaughtException', function (ex) {
    // Do nothing with the error which is only there to test we stay on track
  })

  d.find({}, function () {
    process.nextTick(function () {
      d.insert({ bar: 1 }, function () {
        console.log('inserted')
        process.removeAllListeners('uncaughtException')
        for (let i = 0; i < currentUncaughtExceptionHandlers.length; i += 1) {
          process.on('uncaughtException', currentUncaughtExceptionHandlers[i])
        }

        done()
      })
    })

    throw new Error('Some error')
  })
}

// Test that if the callback is falsy, the next DB operations will still be executed
function testFalsyCallback(d, done) {
  d.insert({ a: 1 }, null)
  process.nextTick(function () {
    d.update({ a: 1 }, { a: 2 }, {}, null)
    process.nextTick(function () {
      d.update({ a: 2 }, { a: 1 }, null)
      process.nextTick(function () {
        d.remove({ a: 2 }, {}, null)
        process.nextTick(function () {
          d.remove({ a: 2 }, null)
          process.nextTick(function () {
            d.find({}, done)
          })
        })
      })
    })
  })
}

// Test that operations are executed in the right order
// We prevent Mocha from catching the exception we throw on purpose by remembering all current handlers, remove them and register them back after test ends
function testRightOrder(d, done) {
  d.find({}, function (err, docs) {
    docs.length.should.equal(0)

    d.insert({ a: 1 }, function () {
      d.update({ a: 1 }, { a: 2 }, {}, function () {
        d.find({}, function (err, docs) {
          docs[0].a.should.equal(2)

          process.nextTick(function () {
            d.update({ a: 2 }, { a: 3 }, {}, function () {
              d.find({}, function (err, docs) {
                docs[0].a.should.equal(3)

                done()
              })
            })
          })
        })
      })
    })
  })
}

// Note:  The following test does not have any assertion because it
// is meant to address the deprecation warning:
// (node) warning: Recursive process.nextTick detected. This will break in the next version of node. Please use setImmediate for recursive deferral.
// see
const testEventLoopStarvation = function (d, done) {
  const times = 1001
  let i = 0
  while (i < times) {
    i++
    d.find({ bogus: 'search' }, noop)
  }
  done()
}

// Test that operations are executed in the right order even with no callback
function testExecutorWorksWithoutCallback(d, done) {
  d.insert({ a: 1 })
  d.insert({ a: 2 }, false)
  d.find({}, function (err, docs) {
    docs.length.should.equal(2)
    done()
  })
}

describe('Executor', function () {
  describe('With persistent database', function () {
    let d

    beforeEach(function (done) {
      d = new Collection({ filename: testDb })
      d.filename.should.equal(testDb)
      d.inMemoryOnly.should.equal(false)

      async.waterfall(
        [
          function (cb) {
            Persistence.ensureDirectoryExists(
              path.dirname(testDb),
              function () {
                fs.exists(testDb, function (exists) {
                  if (exists) {
                    fs.unlink(testDb, cb)
                  } else {
                    return cb()
                  }
                })
              },
            )
          },
          function (cb) {
            d.loadDatabase(function (err) {
              assert.notExists(err)
              d.getAllData().length.should.equal(0)
              return cb()
            })
          },
        ],
        done,
      )
    })

    it.skip('A throw in a callback doesnt prevent execution of next operations', function (done) {
      testThrowInCallback(d, done)
    })

    it('A falsy callback doesnt prevent execution of next operations', function (done) {
      testFalsyCallback(d, done)
    })

    it('Operations are executed in the right order', function (done) {
      testRightOrder(d, done)
    })

    it('Does not starve event loop and raise warning when more than 1000 callbacks are in queue', function (done) {
      testEventLoopStarvation(d, done)
    })

    it('Works in the right order even with no supplied callback', function (done) {
      testExecutorWorksWithoutCallback(d, done)
    })
  })

  describe('With non persistent database', function () {
    let d

    beforeEach(function (done) {
      d = new Collection({ inMemoryOnly: true })
      d.inMemoryOnly.should.equal(true)

      d.loadDatabase(function (err) {
        assert.notExists(err)
        d.getAllData().length.should.equal(0)
        return done()
      })
    })

    it.skip('A throw in a callback doesnt prevent execution of next operations', function (done) {
      testThrowInCallback(d, done)
    })

    it('A falsy callback doesnt prevent execution of next operations', function (done) {
      testFalsyCallback(d, done)
    })

    it('Operations are executed in the right order', function (done) {
      testRightOrder(d, done)
    })

    it('Works in the right order even with no supplied callback', function (done) {
      testExecutorWorksWithoutCallback(d, done)
    })
  }) // ==== End of 'With non persistent database' ====
})