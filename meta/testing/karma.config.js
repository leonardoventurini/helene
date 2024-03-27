process.env.CHROME_BIN = require('puppeteer').executablePath()

module.exports = function (config) {
  config.set({
    frameworks: ['mocha'],
    files: ['browser/**/*.test.ts'],
    preprocessors: {
      '**/*.ts': ['esbuild'],
      '**/*.js': ['esbuild'],
    },
    esbuild: {
      sourcemap: true,
    },
    browsers: ['ChromeHeadless'],

    singleRun: true,

    client: {
      captureConsole: true,
    },
  })
}
