import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './Home.jsx';
import Dashboard from './Dashboard.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:section" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}