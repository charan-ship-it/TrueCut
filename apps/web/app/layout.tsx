import './globals.css';
import Shell from '../components/Shell';
import { fontFaceCss } from '@truecut/engine/styles.js';
export const metadata = { title: 'TrueCut', description: 'Drop a link, get a film. Fact-checked motion videos and founder-talk edits, directed in a conversation.', openGraph: { title: 'TrueCut', description: 'Drop a link. Get a film.', images: ['/brand/truecut-social.png'] }, twitter: { card: 'summary_large_image', images: ['/brand/truecut-social.png'] } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head><style dangerouslySetInnerHTML={{ __html: fontFaceCss('/engine/fonts/').replace(/font-display:block/g, 'font-display:swap') }} /></head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
