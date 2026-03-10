'use client';

import { useState, useCallback } from 'react';
import { Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useSubmitFeedback } from '@/hooks/feedback/use-feedback';
import { toast } from '@/lib/toast';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId?: string;
  messageId?: string;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  threadId,
  messageId,
}: FeedbackDialogProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [helpImprove, setHelpImprove] = useState(true);

  const { mutate: submitFeedback, isPending } = useSubmitFeedback();

  const resetForm = useCallback(() => {
    setRating(0);
    setHoveredRating(0);
    setFeedbackText('');
    setHelpImprove(true);
  }, []);

  const handleSubmit = useCallback(() => {
    if (rating === 0) {
      toast.warning('Please select a rating before submitting.');
      return;
    }

    submitFeedback(
      {
        rating,
        feedback_text: feedbackText.trim() || undefined,
        help_improve: helpImprove,
        thread_id: threadId,
        message_id: messageId,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      },
    );
  }, [
    rating,
    feedbackText,
    helpImprove,
    threadId,
    messageId,
    submitFeedback,
    resetForm,
    onOpenChange,
  ]);

  const displayRating = hoveredRating || rating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Let us know how your experience has been.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Star Rating */}
          <div className="flex flex-col gap-2">
            <Label>Rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rounded-sm p-0.5 transition-colors hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onMouseEnter={() => setHoveredRating(value)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(value)}
                  aria-label={`Rate ${value} out of 5`}
                >
                  <Star
                    className={`size-6 transition-colors ${
                      value <= displayRating
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted-foreground'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Text */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="feedback-text">Feedback</Label>
            <Textarea
              id="feedback-text"
              placeholder="Tell us what you think..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Help Improve Checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="help-improve"
              checked={helpImprove}
              onCheckedChange={(checked) => setHelpImprove(checked === true)}
            />
            <Label htmlFor="help-improve" className="cursor-pointer text-sm font-normal">
              Help us improve
            </Label>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={isPending || rating === 0}>
            {isPending ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
