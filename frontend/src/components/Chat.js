import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';

function Chat({ token, user }) {
  const { id } = useParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    axios.get(`/api/chat/${id}/messages`).then(res => {
      setMessages(res.data.messages || []);
    }).catch(() => {});

    const socket = io(window.location.origin.replace(':3080', ':3002'), {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', id);
    });

    socket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => { socket.disconnect(); };
  }, [id, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    socketRef.current.emit('send_message', { event_id: id, content: input });
    setInput('');
  };

  return (
    <div>
      <h4>Event Chat</h4>
      <div className="border rounded p-3 mb-3" style={{ height: '400px', overflowY: 'auto' }}>
        {messages.map((m, i) => (
          <div key={i} className={`mb-2 ${m.user_id === user?.id ? 'text-end' : ''}`}>
            <strong>{m.user_name || 'User'}</strong>
            <p className="mb-0">{m.content}</p>
            <small className="text-muted">{new Date(m.timestamp).toLocaleTimeString()}</small>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={sendMessage} className="d-flex">
        <input className="form-control me-2" value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." />
        <button className="btn btn-primary" type="submit">Send</button>
      </form>
    </div>
  );
}

export default Chat;
