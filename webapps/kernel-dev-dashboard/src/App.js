import { Link, Outlet } from 'react-router-dom';
import ExternalLink from './ExternalLink';
import Logo from './Logo';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="sticky bg-white shadow-sm flex">
        <nav className="container mx-auto flex items-center">
          <ul className="flex divide-x divide-palette-200/50">
            <li className="h-16 items-center flex px-4">
              <a href="https://skynetlabs.com" target="_blank" rel="noreferrer">
                <Logo />
              </a>
            </li>
            <li className="h-16 items-center flex px-4">
              <Link to="/module-overrides" className={({ isActive }) => isActive ? "text-primary": "text-palette-300"}><span className="text-palette-400">Module overrides</span></Link>
            </li>
          </ul>
        </nav>
      </header>
      <div className="container mx-auto flex justify-center">
        <main className="w-full p-12">
          <Outlet />
        </main>
      </div>
      <footer className="container mx-auto flex justify-center">
        <p className="text-palette-300 text-sm">
          Made by <ExternalLink href="https://skynetlabs.com">Skynet Labs</ExternalLink>. Open-sourced{" "}
          <ExternalLink href="https://github.com/SkynetLabs/skynet-kernel">on Github</ExternalLink>.
        </p>
      </footer>
    </div>
  );
}

export default App;
