import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

function EventList({ token }) {
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, [search, category]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (category) params.category = category;
      const res = await axios.get('/api/events', { params });
      setEvents(res.data.events || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div>
      <h2 className="mb-3">Events</h2>
      <div className="row mb-3">
        <div className="col-md-6">
          <input className="form-control" placeholder="Search events..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="col-md-3">
          <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            <option value="conference">Conference</option>
            <option value="workshop">Workshop</option>
            <option value="social">Social</option>
            <option value="sports">Sports</option>
            <option value="music">Music</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      {loading ? <p>Loading...</p> : (
        <div className="row">
          {events.length === 0 && <p className="text-muted">No events found.</p>}
          {events.map(ev => (
            <div className="col-md-4 mb-3" key={ev.id}>
              <div className="card h-100">
                <div className="card-body">
                  <h5 className="card-title">{ev.title}</h5>
                  <p className="card-text text-muted">{ev.category} &bull; {new Date(ev.date).toLocaleDateString()}</p>
                  <p className="card-text">{ev.location}</p>
                  <p className="card-text"><small>{ev.current_attendees}/{ev.max_capacity} attending</small></p>
                  <Link to={`/events/${ev.id}`} className="btn btn-primary btn-sm">View Details</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default EventList;
