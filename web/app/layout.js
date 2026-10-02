import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { Providers } from './providers.js';
import SignedInAs from '../components/SignedInAs.js';
import { MapStage } from '../components/MapStage.js';
import WakingUpNotice from '../components/WakingUpNotice.js';

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
        <Providers>
          <MapStage>
            <WakingUpNotice />
            {children}
          </MapStage>
          <SignedInAs />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
