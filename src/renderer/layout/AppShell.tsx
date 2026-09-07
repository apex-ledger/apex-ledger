import { useRef, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { TopBar } from './TopBar';
import { StatusBar } from './StatusBar';
import { UpdateBanner } from './UpdateBanner';
import { TickerStrip } from './TickerStrip';
import { QuickScroll } from '../components/QuickScroll';

export function AppShell({ children }: { children: ReactNode }) {
  // The one scroll container every sheet and report lives in — the quick scroller in its
  // upper-right corner drives this element, so it works the same on every screen.
  const mainRef = useRef<HTMLElement>(null);
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50">
      <TickerStrip />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <TopBar />
          <UpdateBanner />
          <div className="relative flex min-h-0 flex-1">
            {/* Right padding leaves a lane for the quick scroller so it never sits on a figure. */}
            <main ref={mainRef} className="w-full flex-1 overflow-y-auto overflow-x-auto p-2 pr-11">{children}</main>
            <QuickScroll targetRef={mainRef} />
          </div>
          <StatusBar />
        </div>
      </div>
    </div>
  );
}
