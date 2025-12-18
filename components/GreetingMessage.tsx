
import React from 'react';

interface GreetingMessageProps {
  text?: string;
}

const GreetingMessage: React.FC<GreetingMessageProps> = () => {
  return (
    <div className="animate-fade-in-up flex flex-col items-center justify-center space-y-4">
      <div className="relative w-48 h-48 md:w-64 md:h-64">
        {/* Dark version for Light Theme */}
        <img 
          src="https://i.ibb.co/m1hPNDs/it-1-removebg-preview.png" 
          alt="Qbit Logo" 
          className="w-full h-full object-contain dark:hidden pointer-events-none drop-shadow-sm"
        />
        {/* White version for Dark Theme */}
        <img 
          src="https://i.ibb.co/21xXp9Tn/it-removebg-preview.png" 
          alt="Qbit Logo" 
          className="w-full h-full object-contain hidden dark:block pointer-events-none drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]"
        />
      </div>
    </div>
  );
};

export default GreetingMessage;
