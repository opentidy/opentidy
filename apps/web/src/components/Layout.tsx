import { Outlet } from 'react-router-dom';
import DesktopNav from './DesktopNav';
import MobileNav from './MobileNav';
import ErrorBanner from './ErrorBanner';

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <DesktopNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <ErrorBanner />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
