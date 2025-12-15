import React from 'react';

const GeneratingLoader: React.FC = () => {
  return (
    <div className="flex items-center justify-center">
      <div className="w-6 h-6 text-foreground">
        <style>
          {`
            @keyframes pulse {
              0%, 100% { opacity: 0.2; }
              50% { opacity: 1; }
            }
            .loader-circle {
              fill: currentColor;
            }
          `}
        </style>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%">
            <g transform="translate(12,12)">
                <circle r="1.6" className="loader-circle" opacity="0.2" />
                <circle r="1.6" transform="translate(6.4,0)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out' }} />
                <circle r="1.6" transform="translate(6.4,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.1s' }} />
                <circle r="1.6" transform="translate(0,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.2s' }} />
                <circle r="1.6" transform="translate(-6.4,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.3s' }} />
                <circle r="1.6" transform="translate(-6.4,0)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.4s' }} />
                <circle r="1.6" transform="translate(-6.4,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.5s' }} />
                <circle r="1.6" transform="translate(0,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.6s' }} />
                <circle r="1.6" transform="translate(6.4,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.7s' }} />
            </g>
        </svg>
      </div>
    </div>
  );
};

export default GeneratingLoader;