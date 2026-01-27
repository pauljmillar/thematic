'use client';

import { useEffect } from 'react';

export default function HideDevIndicator() {
  useEffect(() => {
    // Hide Next.js dev indicator from shadow DOM
    const hideIndicator = () => {
      try {
        // Find the nextjs-portal element
        const portal = document.querySelector('body > script:nth-child(12) > nextjs-portal') as any;
        if (portal && portal.shadowRoot) {
          // Find the next-logo element inside shadow DOM
          const logo = portal.shadowRoot.querySelector('#next-logo');
          if (logo) {
            (logo as HTMLElement).style.display = 'none';
            (logo as HTMLElement).style.visibility = 'hidden';
            (logo as HTMLElement).style.opacity = '0';
            (logo as HTMLElement).style.pointerEvents = 'none';
          }
          
          // Also try to hide the parent container
          const container = portal.shadowRoot.querySelector('div');
          if (container) {
            const style = window.getComputedStyle(container);
            if (style.position === 'fixed' || style.position === 'absolute') {
              (container as HTMLElement).style.display = 'none';
            }
          }
        }
      } catch (error) {
        // Shadow DOM access might fail, try alternative approach
        console.debug('Could not access shadow DOM:', error);
      }
    };

    // Run immediately and on interval (in case it's added dynamically)
    hideIndicator();
    const interval = setInterval(hideIndicator, 500);

    return () => clearInterval(interval);
  }, []);

  return null;
}
