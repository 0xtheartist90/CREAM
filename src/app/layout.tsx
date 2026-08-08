import type { ReactNode } from 'react';

import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import '@/app/globals.css';

const geistSans = localFont({
    src: './fonts/GeistVF.woff',
    variable: '--font-geist-sans',
    weight: '100 900'
});
const geistMono = localFont({
    src: './fonts/GeistMonoVF.woff',
    variable: '--font-geist-mono',
    weight: '100 900'
});

export const metadata: Metadata = {
    title: 'CREAM money — Personal finance',
    description: 'Track accounts, budgets, cash flow and a 12-month net worth projection. All data stays on device.'
};

export const viewport: Viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
        { media: '(prefers-color-scheme: light)', color: '#f6f6f8' }
    ],
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5
};

/**
 * Applies the persisted theme before first paint. Without this the app renders
 * in dark, then flips to light for light-theme users on hydration.
 */
const THEME_BOOTSTRAP = `
(function(){
  try {
    // The authoritative theme lives in the Supabase settings row, which is not
    // available until after login. UI preferences cache it locally purely so
    // the first paint uses the right background.
    var raw = localStorage.getItem('cream-money.ui');
    var theme = 'dark';
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.theme === 'light') theme = 'light';
    }
    if (theme === 'dark') document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

const Layout = ({ children }: Readonly<{ children: ReactNode }>) => {
    return (
        <html suppressHydrationWarning lang='en'>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
            </head>
            <body className={`${geistSans.variable} ${geistMono.variable} overscroll-none antialiased`}>
                {children}
            </body>
        </html>
    );
};

export default Layout;
