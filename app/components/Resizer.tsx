'use client';

import { useRef, useCallback } from 'react';

interface ResizerProps {
  onResize: (deltaPercent: number) => void;
  className?: string;
}

export default function Resizer({ onResize, className = '' }: ResizerProps) {
  const startX = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      const container = (e.target as HTMLElement).parentElement;
      if (!container) return;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaPx = moveEvent.clientX - startX.current;
        startX.current = moveEvent.clientX;
        const containerWidth = container.offsetWidth;
        if (containerWidth > 0) {
          const deltaPercent = (deltaPx / containerWidth) * 100;
          onResize(deltaPercent);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onResize]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={handleMouseDown}
      className={`flex-shrink-0 w-1 bg-gray-200 hover:bg-indigo-300 cursor-col-resize transition-colors flex items-center justify-center group ${className}`}
    >
      <div className="w-0.5 h-8 bg-gray-400 group-hover:bg-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
