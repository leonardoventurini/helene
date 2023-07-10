import react from '@vitejs/plugin-react-swc'
import mdx from '@mdx-js/rollup'
import rehypeHighlight from 'rehype-highlight'
import { fileURLToPath } from 'url'
import svgr from 'vite-plugin-svgr'

export default {
  root: './src/client',
  server: {
    middlewareMode: true,
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    mdx({
      rehypePlugins: [rehypeHighlight],
    }),
    react(),
    svgr(),
  ],
}
