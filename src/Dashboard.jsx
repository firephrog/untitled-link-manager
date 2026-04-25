import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function Dashboard() {
  const { section } = useParams();
  const [page, setPage] = useState(undefined); // undefined=loading, null=not-found, obj=loaded
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  const loadPage = useCallback(() => {
    return fetch('/api/pages')
      .then(r => r.json())
      .then(data => setPage(data[section] !== undefined ? data[section] : null));
  }, [section]);

  useEffect(() => { loadPage(); }, [loadPage]);

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleGenerate = () => {
    setGenerating(true);
    setError(null);
    setLogs([]);

    const source = new EventSource(`/api/pages/${section}/generate`);

    source.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'log') {
        setLogs(prev => [...prev, msg.text]);
      } else if (msg.type === 'url') {
        source.close();
        loadPage().then(() => setGenerating(false));
      } else if (msg.type === 'error') {
        source.close();
        setError(msg.message);
        setGenerating(false);
      }
    };

    source.onerror = () => {
      source.close();
      setError('Lost connection to server');
      setGenerating(false);
    };
  };

  if (page === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  if (page === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="text-center">
          <p className="text-slate-500 mb-4">Page not found.</p>
          <Link to="/" className="text-blue-500 hover:underline text-sm">← Back to all sites</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center font-sans">
      <div className="w-full max-w-2xl">

        <div className="mb-2">
          <Link to="/" className="text-sm text-slate-400 hover:text-blue-500 transition-colors">← All sites</Link>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-slate-800">{page.title}</h1>
        </div>

        <div className="flex gap-3 mb-4">
          <a
            href={page.mainUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm hover:border-blue-400 transition-colors flex items-center text-blue-600 font-medium truncate"
          >
            {page.mainUrl}
          </a>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-slate-900 hover:bg-black disabled:opacity-60 text-white px-8 py-3 rounded-lg font-semibold transition-all shadow-md whitespace-nowrap"
          >
            {generating ? 'Generating…' : 'Depreciated'}
          </button>
        </div>

        {generating && (
          <div className="mb-4 bg-slate-900 rounded-lg p-4 font-mono text-xs text-green-400 max-h-48 overflow-y-auto">
            {logs.length === 0
              ? <p className="text-slate-500">Waiting for output…</p>
              : logs.map((line, i) => <p key={i} className="whitespace-pre-wrap break-all">{line}</p>)
            }
            <div ref={logsEndRef} />
          </div>
        )}
        {error && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-500 uppercase">Segments</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {page.segments.length === 0 ? (
              <p className="p-5 text-slate-400 text-sm">No segments yet. Click "Generate link" to create one.</p>
            ) : (
              page.segments.map((segment) => (
                <a
                  key={segment.id}
                  href={segment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-5 hover:bg-blue-50/50 transition-colors group"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-slate-700 group-hover:text-blue-700 truncate">{segment.url}</span>
                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded ml-3 shrink-0">
                      {segment.label}
                    </span>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
