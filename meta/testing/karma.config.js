process.env.CHROME_BIN = require('puppeteer').executablePath()

module.exports = function (config) {
  config.set({
    frameworks: ['mocha', 'karma-typescript'],
    files: ['browser/**/*.test.ts'],
    preprocessors: {
      '**/*.ts': ['karma-typescript'],
    },
    karmaTypescriptConfig: {
      tsconfig: 'tsconfig.browser.json',
    },
    browsers: ['ChromeHeadless'],
    singleRun: true,
  })
}
