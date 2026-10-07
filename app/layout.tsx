import './globals.css';
import Shell from '@/components/Shell';
import { fontFaceCss } from '@/public/engine/styles.js';
export const metadata = { title: 'Truecut', description: 'Drop a link, get a film. Fact-checked motion-graphics ads, directed in a conversation.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head><style dangerouslySetInnerHTML={{ __html: fontFaceCss('/engine/fonts/').replace(/font-display:block/g, 'font-display:swap') }} /></head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
