import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { formatTime } from '../../utils/helpers';

export default function MessageBubble({ message, isSelf }) {
  const isSent = message.status === 'sent';
  const isDelivered = message.status === 'delivered';
  const isRead = message.status === 'read';

  return (
    <div className={`flex w-full my-1 ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[85%] sm:max-w-[65%] px-3 py-1.5 rounded-lg shadow-sm text-sm break-words ${
          isSelf
            ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none'
            : 'bg-[#202c33] text-[#e9edef] rounded-tl-none border border-[#2a3942]/30'
        }`}
      >
        {/* Message Content */}
        <p className="whitespace-pre-wrap leading-relaxed pr-14 text-[13.5px]">
          {message.text}
        </p>

        {/* Timestamp & Status Checkmarks */}
        <div className="absolute bottom-1 right-2 flex items-center gap-1 text-[10.5px] text-[#8696a0] select-none">
          <span>{formatTime(message.timestamp)}</span>

          {isSelf && (
            <span className="flex items-center">
              {isRead ? (
                <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
              ) : isDelivered ? (
                <CheckCheck className="w-3.5 h-3.5 text-[#8696a0]" />
              ) : (
                <Check className="w-3.5 h-3.5 text-[#8696a0]" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
