import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinonChai from 'sinon-chai'
import chaiSubset from 'chai-subset'

chai.use(chaiAsPromised)
chai.use(sinonChai)
chai.use(chaiSubset)

chai.should()

// Needed for Bun as mocha --exit does not work
after(() => {
  process.exit(0)
})
