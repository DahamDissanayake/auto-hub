/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {},
  transpilePackages: ['react-markdown', 'remark-gfm'],
}

export default nextConfig
