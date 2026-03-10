'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useThreadMessageSearch } from '@/hooks/threads/use-thread-search-messages';

interface ThreadMessageSearchProps {
  threadId: string;
}

export function ThreadMessageSearch({ threadId }: ThreadMessageSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data } = useThreadMessageSearch(threadId, debouncedQuery);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setDebouncedQuery('');
    setCurrentIndex(0);
  }, []);

  const navigateResult = useCallback((direction: 'up' | 'down') => {
    if (!data?.results.length) return;
    setCurrentIndex((prev) => {
      if (direction === 'down') return (prev + 1) % data.results.length;
      return (prev - 1 + data.results.length) % data.results.length;
    });
  }, [data?.results.length]);

  // Scroll to result
  useEffect(() => {
    if (!data?.results[currentIndex]) return;
    const messageId = data.results[currentIndex].message_id;
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 2000);
    }
  }, [currentIndex, data?.results]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && !isOpen) {
        e.preventDefault();
        handleOpen();
      }
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleOpen, handleClose]);

  if (!isOpen) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleOpen}>
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 bg-background border rounded-md px-2 py-1">
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setCurrentIndex(0); }}
        placeholder="Search messages..."
        className="h-7 border-0 shadow-none text-sm px-1 focus-visible:ring-0"
        onKeyDown={(e) => {
          if (e.key === 'Enter') navigateResult(e.shiftKey ? 'up' : 'down');
        }}
      />
      {data && data.count > 0 && (
        <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
          {currentIndex + 1}/{data.count}
        </Badge>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigateResult('up')} disabled={!data?.count}>
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigateResult('down')} disabled={!data?.count}>
        <ChevronDown className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
