import React from 'react';

interface GreetingMessageProps {
  text: string;
}

const GreetingMessage: React.FC<GreetingMessageProps> = ({ text }) => {
  return (
    <div className="animate-fade-in-up text-center">
      <h1 className="text-xl sm:text-2xl font-semibold text-muted-foreground tracking-tight">{text}</h1>
    </div>
  );
};

export default GreetingMessage;