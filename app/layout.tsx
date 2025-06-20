import type React from "react"
export const metadata = {
  title: "Circular Metronome",
  description: "A better approach practicing your timing",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


import './globals.css'