// Routes. The two shelves (/ and /shelf) are full-screen 3D pages; every other route
// renders inside the workspace layout (sidebar + planner views).
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import Planner from './pages/Planner'
import Setup from './pages/Setup'
import Shelf from './pages/Shelf'
import Home from './pages/Home'
import Icon from './components/Icon'
import { useLegacyProgramMigration } from './data'

function Workspace() {
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/" className="brand"><span className="brand-mark">u<span>↗</span></span><span className="brand-name">UCI Planner<span className="brand-sub">YOUR PATH AT UCI</span></span></NavLink>
      <div className="workspace-label">MY WORKSPACE</div>
      <nav className="main-nav">
        <NavLink to="/roadmap"><Icon name="tree" />Course roadmap<span className="nav-dot" /></NavLink>
        <NavLink to="/plan"><Icon name="calendar" />Quarter planner</NavLink>
        <NavLink to="/requirements"><Icon name="book" />Degree requirements</NavLink>
        <NavLink to="/setup"><Icon name="settings" />My programs</NavLink>
        <NavLink end to="/"><Icon name="book" />My shelf</NavLink>
        <NavLink to="/shelf"><Icon name="book" />Major shelf</NavLink>
      </nav>
      <div className="sidebar-note"><span className="tiny-orbit">✳</span><h3>A little clarity.<br />A lot of possibility.</h3><p>See how today’s courses open tomorrow’s doors.</p></div>
      <p className="data-credit">Degree requirements from <a href="https://anteaterapi.com" target="_blank" rel="noreferrer">Anteater API</a> by ICSSC. Schedules from UCI WebSoc &amp; Catalogue.</p>
      <div className="local-profile"><span className="avatar">U</span><div>Your workspace<small>Saved on this device</small></div><span className="saved-dot" /></div>
    </aside>
    <div className="app-main"><Routes>
      <Route path="/roadmap" element={<Planner view="roadmap" />} />
      <Route path="/plan" element={<Planner view="plan" />} />
      <Route path="/requirements" element={<Planner view="requirements" />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="*" element={<Planner view="roadmap" />} />
    </Routes></div>
  </div>
}

export default function App() {
  useLegacyProgramMigration()
  return <BrowserRouter><Routes>
    {/* The shelves are full-screen scenes of their own, outside the workspace chrome. */}
    <Route path="/" element={<Home />} />
    <Route path="/shelf" element={<Shelf />} />
    <Route path="*" element={<Workspace />} />
  </Routes></BrowserRouter>
}
