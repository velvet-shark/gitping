import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://gitping.vlvt.sh'),
  title: 'GitPing - GitHub Release Notifications',
  description: 'Get instant notifications when your favorite repositories release new versions.',
  openGraph: {
    title: 'GitPing - GitHub Release Notifications',
    description: 'Get instant notifications when your favorite repositories release new versions.',
    url: 'https://gitping.vlvt.sh',
    siteName: 'GitPing',
    images: [
      {
        url: '/gitping.png',
        width: 1200,
        height: 630,
        alt: 'GitPing - GitHub Release Notifications',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GitPing - GitHub Release Notifications',
    description: 'Get instant notifications when your favorite repositories release new versions.',
    images: ['/gitping.png'],
  },
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Script
          defer
          data-domain="gitping.vlvt.sh"
          src="https://pls.velvetshark.com/js/script.outbound-links.js"
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  )
}