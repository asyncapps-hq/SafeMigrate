import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SafeMigrate by KhyFee',
  description: 'Zero-downtime migration sandbox',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="footer">SafeMigrate by KhyFee</footer>
      </body>
    </html>
  )
}
