import { useState, useCallback } from 'react';
import { useChatStore } from '@/lib/store';
import { apiClient } from '@/lib/services/api';
import type { ChatMessage, APIError } from '@/lib/types';

export function useChat() {
  const { messages, isLoading, error, addMessage, setLoading, setError } = useChatStore();
  const [retryCount, setRetryCount] = useState(0);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      // Add user message
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      addMessage(userMessage);
      setLoading(true);
      setError(null);

      try {
        // Call service-d API
        const response = await apiClient.sendChatMessage({
          question: content,
          context: messages.length > 0 ? JSON.stringify(messages.slice(-5)) : undefined,
        });

        // Add assistant message
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.answer,
          timestamp: new Date().toISOString(),
        };

        addMessage(assistantMessage);
        setRetryCount(0);
      } catch (err) {
        const error = err as APIError;
        console.error('[Chat] Error sending message:', error);
        setError(error.message || 'Failed to send message. Please try again.');

        // Optionally add error message to chat
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
          timestamp: new Date().toISOString(),
        };
        addMessage(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [messages, isLoading, addMessage, setLoading, setError]
  );

  const retry = useCallback(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
      const lastUserMessage = messages[messages.length - 1];
      setRetryCount((prev) => prev + 1);
      sendMessage(lastUserMessage.content);
    }
  }, [messages, sendMessage]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    retry,
    retryCount,
  };
}
