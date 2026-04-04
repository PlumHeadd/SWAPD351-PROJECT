import React from 'react';
import { useNavigate } from 'react-router-dom';

function Login({ onLogin, token }) {
  const navigate = useNavigate();

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  // If already logged in, go home
  React.useEffect(() => {
    if (token) {
      navigate('/');
    }
  }, [token, navigate]);

  // Check URL for token (callback redirect)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      onLogin(t);
      navigate('/');
    }
  }, [onLogin, navigate]);

  return (
    <div className="row justify-content-center mt-5">
      <div className="col-md-6">
        <div className="card">
          <div className="card-body text-center">
            <h2 className="card-title mb-4">Welcome to Eventify</h2>
            <p className="text-muted mb-4">Sign in to create events, RSVP, and chat with attendees.</p>
            <button className="btn btn-danger btn-lg" onClick={handleGoogleLogin}>
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
