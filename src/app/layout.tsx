import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SuperTunnel',
  description: 'A browser proxy controller for SuperTunnel.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
