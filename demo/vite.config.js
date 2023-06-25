import react from '@vitejs/plugin-react-swc'
import mdx from '@mdx-js/rollup'
import rehypeHighlight from 'rehype-highlight'

export default {
  root: './src',
  server: {
    middlewareMode: true,
  },
  plugins: [
    mdx({
      rehypePlugins: [rehypeHighlight],
    }),
    react(),
  ],
}
