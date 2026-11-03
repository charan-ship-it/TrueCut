import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import Shell from '../components/Shell';
import GrabWidget from '../components/GrabWidget';
import { fontFaceCss } from '@truecut/engine/styles.js';
export const metadata = { title: 'TrueCut', description: 'Fact-checked motion videos and founder-talk edits, built from your real sources and directed in a conversation.', openGraph: { title: 'TrueCut', description: 'Real sources. Real motion.', images: ['/brand/truecut-social.png'] }, twitter: { card: 'summary_large_image', images: ['/brand/truecut-social.png'] } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const app = <Shell>{children}</Shell>;
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head><style dangerouslySetInnerHTML={{ __html: fontFaceCss('/engine/fonts/').replace(/font-display:block/g, 'font-display:swap') }} /></head>
      <body>{process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <ClerkProvider signInUrl={process.env.CLERK_SIGN_IN_URL} signUpUrl={process.env.CLERK_SIGN_UP_URL}>{app}{/* Grab bug reporter: only with Clerk on, so useUser works and it only ever shows to signed-in team members. */}<GrabWidget /></ClerkProvider> : app}</body>
    </html>
  );
}
