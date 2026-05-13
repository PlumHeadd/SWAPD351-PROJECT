import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function EventForm({ token }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '', description: '', date: '', location: '', category: 'other', max_capacity: 50
  });

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await axios.post('/api/events', form, { headers: { Authorization: `Bearer ${token}` } });
      navigate('/');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create event');
    }
  };

  return (
    <div className="row justify-content-center">
      <div className="col-md-8">
        <h2 className="mb-3">Create Event</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Title</label>
            <input className="form-control" name="title" value={form.title} onChange={handleChange} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Description</label>
            <textarea className="form-control" name="description" value={form.description} onChange={handleChange} rows="3" />
          </div>
          <div className="row mb-3">
            <div className="col-md-6">
              <label className="form-label">Date & Time</label>
              <input className="form-control" type="datetime-local" name="date" value={form.date} onChange={handleChange} required />
            </div>
            <div className="col-md-6">
              <label className="form-label">Location</label>
              <input className="form-control" name="location" value={form.location} onChange={handleChange} required />
            </div>
          </div>
          <div className="row mb-3">
            <div className="col-md-6">
              <label className="form-label">Category</label>
              <select className="form-select" name="category" value={form.category} onChange={handleChange}>
                <option value="conference">Conference</option>
                <option value="workshop">Workshop</option>
                <option value="social">Social</option>
                <option value="sports">Sports</option>
                <option value="music">Music</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Max Capacity</label>
              <input className="form-control" type="number" name="max_capacity" value={form.max_capacity} onChange={handleChange} min="1" />
            </div>
          </div>
          <button type="submit" className="btn btn-success">Create Event</button>
        </form>
      </div>
    </div>
  );
}

export default EventForm;
