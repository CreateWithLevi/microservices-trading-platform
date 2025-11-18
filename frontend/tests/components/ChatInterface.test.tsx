import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInterface from '@/components/ChatInterface';
import { useChatStore } from '@/lib/store';
import * as api from '@/lib/services/api';

// Mock the API client
vi.mock('@/lib/services/api', () => ({
  apiClient: {
    sendChatMessage: vi.fn(),
  },
}));

describe('ChatInterface Component', () => {
  beforeEach(() => {
    // Reset the store before each test
    useChatStore.setState({ messages: [], isLoading: false, error: null });
    vi.clearAllMocks();
  });

  it('should render the chat interface with initial state', () => {
    render(<ChatInterface />);

    expect(screen.getByText('AI Trading Assistant')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask a question...')).toBeInTheDocument();
    expect(screen.getByText('Start a conversation!')).toBeInTheDocument();
  });

  it('should send a message when form is submitted', async () => {
    const user = userEvent.setup();
    const mockResponse = { answer: 'Test response from AI', confidence: 0.95 };

    // Mock API call
    vi.spyOn(api.apiClient, 'sendChatMessage').mockResolvedValue(mockResponse);

    render(<ChatInterface />);

    const input = screen.getByPlaceholderText('Ask a question...');
    const sendButton = screen.getByRole('button', { name: /send/i });

    // Type a message
    await user.type(input, 'What are the latest trade trends?');
    await user.click(sendButton);

    // Verify API was called
    await waitFor(() => {
      expect(api.apiClient.sendChatMessage).toHaveBeenCalledWith({
        question: 'What are the latest trade trends?',
        context: undefined,
      });
    });

    // Verify user message appears
    await waitFor(() => {
      expect(screen.getByText('What are the latest trade trends?')).toBeInTheDocument();
    });

    // Verify AI response appears
    await waitFor(() => {
      expect(screen.getByText('Test response from AI')).toBeInTheDocument();
    });
  });

  it('should display loading state while sending message', async () => {
    const user = userEvent.setup();

    // Mock a delayed API response
    vi.spyOn(api.apiClient, 'sendChatMessage').mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ answer: 'Delayed response' }), 1000)
        )
    );

    render(<ChatInterface />);

    const input = screen.getByPlaceholderText('Ask a question...');
    const sendButton = screen.getByRole('button', { name: /send/i });

    await user.type(input, 'Test question');
    await user.click(sendButton);

    // Check loading state
    await waitFor(() => {
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
      expect(sendButton).toHaveTextContent('Sending...');
      expect(sendButton).toBeDisabled();
    });
  });

  it('should handle API errors gracefully', async () => {
    const user = userEvent.setup();

    // Mock API error
    vi.spyOn(api.apiClient, 'sendChatMessage').mockRejectedValue({
      message: 'Service unavailable',
      code: '503',
    });

    render(<ChatInterface />);

    const input = screen.getByPlaceholderText('Ask a question...');
    const sendButton = screen.getByRole('button', { name: /send/i });

    await user.type(input, 'Test question');
    await user.click(sendButton);

    // Verify error message appears
    await waitFor(() => {
      expect(screen.getByText(/Service unavailable/i)).toBeInTheDocument();
    });
  });

  it('should clear input after sending message', async () => {
    const user = userEvent.setup();

    vi.spyOn(api.apiClient, 'sendChatMessage').mockResolvedValue({
      answer: 'Response',
    });

    render(<ChatInterface />);

    const input = screen.getByPlaceholderText('Ask a question...') as HTMLInputElement;
    const sendButton = screen.getByRole('button', { name: /send/i });

    await user.type(input, 'Test message');
    expect(input.value).toBe('Test message');

    await user.click(sendButton);

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('should disable send button when input is empty', () => {
    render(<ChatInterface />);

    const sendButton = screen.getByRole('button', { name: /send/i });

    expect(sendButton).toBeDisabled();
  });

  it('should display multiple messages in conversation', async () => {
    const messages = [
      {
        id: '1',
        role: 'user' as const,
        content: 'First question',
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        role: 'assistant' as const,
        content: 'First answer',
        timestamp: new Date().toISOString(),
      },
      {
        id: '3',
        role: 'user' as const,
        content: 'Second question',
        timestamp: new Date().toISOString(),
      },
    ];

    useChatStore.setState({ messages });

    render(<ChatInterface />);

    expect(screen.getByText('First question')).toBeInTheDocument();
    expect(screen.getByText('First answer')).toBeInTheDocument();
    expect(screen.getByText('Second question')).toBeInTheDocument();
  });
});
