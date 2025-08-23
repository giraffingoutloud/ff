import React, { useState, useRef, useEffect } from 'react';

interface PopOutWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
}

export const PopOutWindow: React.FC<PopOutWindowProps> = ({
  isOpen,
  onClose,
  title,
  children,
  defaultWidth = 800,
  defaultHeight = 600
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 50 });
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  // Center window on first open
  useEffect(() => {
    if (isOpen && !isMaximized) {
      const centerX = (window.innerWidth - size.width) / 2;
      const centerY = (window.innerHeight - size.height) / 2;
      setPosition({ x: centerX, y: centerY });
    }
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || isMaximized) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 pointer-events-auto"
        onClick={onClose}
      />
      
      {/* Window */}
      <div
        ref={windowRef}
        className={`absolute bg-gray-900 border border-gray-600 rounded-lg shadow-2xl pointer-events-auto transition-all duration-200 ${
          isMaximized ? 'inset-0 m-0' : ''
        }`}
        style={
          !isMaximized
            ? {
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${size.width}px`,
                height: `${size.height}px`,
              }
            : {}
        }
      >
        {/* Title Bar */}
        <div
          className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-t-lg p-3 flex items-center justify-between cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <h2 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMaximize}
              className="p-1 hover:bg-gray-600 rounded transition-colors"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-red-600 rounded transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-auto" style={{ height: 'calc(100% - 60px)' }}>
          {children}
        </div>
      </div>
    </div>
  );
};