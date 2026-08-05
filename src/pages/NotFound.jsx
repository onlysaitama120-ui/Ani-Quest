import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="center fade-in" style={{ padding: '80px 0' }}>
      <h1 className="page-title">404 — Not found</h1>
      <p className="muted" style={{ margin: '12px 0 24px' }}>
        That page doesn't exist. Maybe it got isekai'd.
      </p>
      <Link to="/" className="btn btn-primary">Back home</Link>
    </div>
  );
}