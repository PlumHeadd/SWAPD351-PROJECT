import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import EventList from './components/EventList';
import EventForm from './components/EventForm';
import EventDetail from './components/EventDetail';
import Dashboard from './components/Dashboard';
import Chat from './components/Chat';
import Login from './components/Login';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (token) {
      fetch('/api/users/me', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setUser(data); })
        .catch(() => {});
    }
  }, [token]);

  const handleLogin = (t) => {
    localStorage.setItem('token', t);
    setToken(t);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUser(null);
  };

  return (
    <Router>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark mb-4">
        <div className="container">
          <Link className="navbar-brand" to="/">Eventify</Link>
          <div className="navbar-nav ms-auto">
            <Link className="nav-link" to="/">Events</Link>
            <Link className="nav-link" to="/dashboard">Dashboard</Link>
            {token ? (
              <>
                <Link className="nav-link" to="/events/new">Create Event</Link>
                <span className="nav-link text-light">{user?.name || 'User'}</span>
                <button className="btn btn-outline-light btn-sm ms-2" onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <Link className="nav-link" to="/login">Login</Link>
            )}
          </div>
        </div>
      </nav>
      <div className="container">
        <Routes>
          <Route path="/" element={<EventList token={token} />} />
          <Route path="/login" element={<Login onLogin={handleLogin} token={token} />} />
          <Route path="/dashboard" element={<Dashboard token={token} />} />
          <Route path="/events/new" element={token ? <EventForm token={token} /> : <Navigate to="/login" />} />
          <Route path="/events/:id" element={<EventDetail token={token} user={user} />} />
          <Route path="/events/:id/chat" element={token ? <Chat token={token} user={user} /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
