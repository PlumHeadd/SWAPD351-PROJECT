import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Dashboard({ token }) {
  const [stats, setStats] = useState({ total_events: 0, total_rsvps: 0, trending_events: [] });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get('/api/dashboard/stats', { headers });
        setStats(res.data);
      } catch (e) { console.error(e); }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <div>
      <h2 className="mb-4">Dashboard</h2>
      <div className="row mb-4">
        <div className="col-md-4">
          <div className="card text-white bg-primary">
            <div className="card-body text-center">
              <h3>{stats.total_events}</h3>
              <p className="mb-0">Total Events</p>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-white bg-success">
            <div className="card-body text-center">
              <h3>{stats.total_rsvps}</h3>
              <p className="mb-0">Total RSVPs</p>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-white bg-info">
            <div className="card-body text-center">
              <h3>{stats.trending_events?.length || 0}</h3>
              <p className="mb-0">Trending Events</p>
            </div>
          </div>
        </div>
      </div>
      <h4>Trending Events</h4>
      <table className="table table-striped">
        <thead>
          <tr><th>Title</th><th>Category</th><th>Attendees</th><th>Date</th></tr>
        </thead>
        <tbody>
          {(stats.trending_events || []).map((ev, i) => (
            <tr key={i}>
              <td>{ev.title}</td>
              <td>{ev.category}</td>
              <td>{ev.current_attendees}/{ev.max_capacity}</td>
              <td>{new Date(ev.date).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Dashboard;
