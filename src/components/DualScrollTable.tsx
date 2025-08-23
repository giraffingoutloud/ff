import React, { useRef, useEffect, useState } from 'react';

interface DualScrollTableProps {
  children: React.ReactNode;
}

export const DualScrollTable: React.FC<DualScrollTableProps> = ({ children }) => {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);

  useEffect(() => {
    // Set the width of the inner div to match the table width
    if (bottomScrollRef.current) {
      const tableWidth = bottomScrollRef.current.scrollWidth;
      setScrollWidth(tableWidth);
    }
  }, [children]);

  // Sync scroll positions
  const handleTopScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  return (
    <>
      {/* Top scrollbar */}
      <div 
        ref={topScrollRef}
        className="overflow-x-auto overflow-y-hidden h-4 mb-0"
        onScroll={handleTopScroll}
      >
        <div style={{ width: `${scrollWidth}px`, height: '1px' }} />
      </div>
      
      {/* Table container with bottom scrollbar */}
      <div 
        ref={bottomScrollRef}
        className="overflow-x-auto"
        onScroll={handleBottomScroll}
      >
        {children}
      </div>
    </>
  );
};