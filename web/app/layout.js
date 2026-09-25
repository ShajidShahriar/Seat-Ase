import './globals.css';
import { Providers } from './providers.js';

export const metadata = {
  title: 'Seat Ase?',
  description: 'Shared Teslas from your nearest stand in Dhaka.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f2f2f7',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
