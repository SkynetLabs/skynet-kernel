import { NavLink, Outlet } from 'react-router-dom';
import ExternalLink from './ExternalLink';
import Logo from './Logo';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="sticky bg-white shadow-sm flex">
        <nav className="container mx-auto flex items-center">
          <ul className="flex divide-x divide-palette-200/50">
            <li className="h-16">
              <a href="https://skynetlabs.com" target="_blank" rel="noreferrer" className="flex h-full px-4 items-center">
                <Logo />
              </a>
            </li>
            <li className="h-16">
              <NavLink to="/" className={({ isActive }) => `flex h-full px-4 items-center border-b ${isActive ? "border-b-primary": "border-b-palette-200"}`}>Module overrides</NavLink>
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
