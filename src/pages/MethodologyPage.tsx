import React from 'react';
import { MethodologyDocs } from '../components/MethodologyDocs';
import '../index.css';

export const MethodologyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-dark-bg text-dark-text-primary">
      <MethodologyDocs onClose={() => window.close()} />
    </div>
  );
};