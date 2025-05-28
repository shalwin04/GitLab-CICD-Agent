import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';

const Chat: React.FC = () => {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<string[]>([]);

  const sendMessage = () => {
    if (message.trim()) {
      setChatHistory([...chatHistory, message]);
      setMessage('');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Card className="h-full">
          <ScrollArea className="h-full p-4">
            {chatHistory.map((msg, index) => (
              <div
                key={index}
                className="bg-muted p-3 rounded-md mb-2 w-fit max-w-full"
              >
                <p className="text-sm">{msg}</p>
              </div>
            ))}
          </ScrollArea>
        </Card>
      </div>
      <div className="flex gap-2 p-4 border-t">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-1"
        />
        <Button
          onClick={sendMessage}
          variant="outline"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default Chat;
