/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // Resolve legacy admin links before rendering the client-side access gate.
    return [
      { source: '/admin', destination: '/admin/users', permanent: false },
      { source: '/admin/activity', destination: '/admin/activity-log', permanent: false },
    ]
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }]
    return config
  },
  transpilePackages: ['@iconify/react'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/vi/**',
      },
      {
        protocol: 'https',
        hostname: 'media.giphy.com',
        pathname: '/media/**',
      },
    ],
  },
}

module.exports = nextConfig
