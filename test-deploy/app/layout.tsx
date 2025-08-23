import { ReactNode } from 'react'

export const metadata = {
  title: 'Recoder.xyz - Live',
  description: 'Recoder.xyz AI Development Platform - Now Live!',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}