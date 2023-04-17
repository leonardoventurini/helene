const react = require('@vitejs/plugin-react-swc')

module.exports = {
  root: './src',
  server: {
    middlewareMode: true,
  },
  plugins: [react()],
}
