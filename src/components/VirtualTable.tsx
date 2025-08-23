import React, { useRef, useState, useEffect, useCallback } from 'react';

interface VirtualTableProps {
  items: any[];
  rowHeight: number;
  visibleRows: number;
  renderRow: (item: any, index: number) => React.ReactNode;
  headerContent: React.ReactNode;
  className?: string;
}

export const VirtualTable: React.FC<VirtualTableProps> = ({
  items,
  rowHeight,
  visibleRows,
  renderRow,
  headerContent,
  className = ''
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  
  const totalHeight = items.length * rowHeight;
  const viewportHeight = visibleRows * rowHeight;
  
  // Calculate which items are visible
  const startIndex = Math.floor(scrollTop / rowHeight);
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + viewportHeight) / rowHeight)
  );
  
  // Add buffer rows for smoother scrolling
  const bufferSize = 3;
  const bufferedStartIndex = Math.max(0, startIndex - bufferSize);
  const bufferedEndIndex = Math.min(items.length - 1, endIndex + bufferSize);
  
  const visibleItems = items.slice(bufferedStartIndex, bufferedEndIndex + 1);
  const offsetY = bufferedStartIndex * rowHeight;
  
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);
  
  return (
    <div className={className}>
      <table className="w-full min-w-max">
        {headerContent}
        <tbody>
          <tr>
            <td colSpan={100} style={{ padding: 0 }}>
              <div
                ref={scrollElementRef}
                className="overflow-y-auto"
                style={{ height: `${viewportHeight}px` }}
                onScroll={handleScroll}
              >
                <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                  <div
                    style={{
                      transform: `translateY(${offsetY}px)`,
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0
                    }}
                  >
                    <table className="w-full">
                      <tbody>
                        {visibleItems.map((item, idx) => (
                          <tr key={item.id || bufferedStartIndex + idx}>
                            {renderRow(item, bufferedStartIndex + idx)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};