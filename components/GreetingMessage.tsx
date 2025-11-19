import React from 'react';

interface GreetingMessageProps {
  text: string;
}

const GreetingMessage: React.FC<GreetingMessageProps> = ({ text }) => {
  return (
    <div className="animate-fade-in-up">
      <h1 className="text-2xl sm:text-3xl font-semibold text-muted-foreground">{text}</h1>
    </div>
  );
};

export default GreetingMessage;
