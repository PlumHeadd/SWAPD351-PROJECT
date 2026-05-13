import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

function EventDetail({ token, user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [rsvped, setRsvped] = useState(false);
  const [attendees, setAttendees] = useState([]);

  useEffect(() => {
    fetchEvent();
    fetchAttendees();
  }, [id]);

  const fetchEvent = async () => {
    try {
      const res = await axios.get(`/api/events/${id}`);
      setEvent(res.data);
    } catch (e) { console.error(e); }
  };

  const fetchAttendees = async () => {
    try {
      const res = await axios.get(`/api/events/${id}/attendees`);
      setAttendees(res.data.attendees || []);
      if (user) {
        setRsvped(res.data.attendees?.some(a => a.user_id === user.id));
      }
    } catch (e) { console.error(e); }
  };

  const handleRsvp = async () => {
    try {
      await axios.post(`/api/events/${id}/rsvp`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setRsvped(true);
      fetchEvent();
      fetchAttendees();
    } catch (e) { alert(e.response?.data?.error || 'RSVP failed'); }
  };

  const handleCancelRsvp = async () => {
    try {
      await axios.delete(`/api/events/${id}/rsvp`, { headers: { Authorization: `Bearer ${token}` } });
      setRsvped(false);
      fetchEvent();
      fetchAttendees();
    } catch (e) { alert('Cancel failed'); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this event?')) return;
    try {
      await axios.delete(`/api/events/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      navigate('/');
    } catch (e) { alert('Delete failed'); }
  };

  if (!event) return <p>Loading...</p>;

  const isCreator = user && event.creator_id === user.id;

  return (
    <div className="row">
      <div className="col-md-8">
        <h2>{event.title}</h2>
        <span className="badge bg-secondary mb-2">{event.category}</span>
        <p className="text-muted">{new Date(event.date).toLocaleString()} &bull; {event.location}</p>
        <p>{event.description}</p>
        <p><strong>{event.current_attendees}/{event.max_capacity}</strong> attending</p>

        {token && !isCreator && (
          rsvped ?
            <button className="btn btn-warning me-2" onClick={handleCancelRsvp}>Cancel RSVP</button> :
            <button className="btn btn-success me-2" onClick={handleRsvp}>RSVP</button>
        )}
        {isCreator && <button className="btn btn-danger me-2" onClick={handleDelete}>Delete Event</button>}
        {token && (rsvped || isCreator) && <Link to={`/events/${id}/chat`} className="btn btn-info">Event Chat</Link>}
      </div>
      <div className="col-md-4">
        <h5>Attendees ({attendees.length})</h5>
        <ul className="list-group">
          {attendees.map((a, i) => (
            <li key={i} className="list-group-item">{a.user_id}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default EventDetail;
