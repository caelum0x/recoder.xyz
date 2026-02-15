"use client";

import { Dialog } from "@repo/design-system/components/precomposed/dialog";
import { Input } from "@repo/design-system/components/precomposed/input";
import { Textarea } from "@repo/design-system/components/precomposed/textarea";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useState } from "react";
import { createInterview } from "@/actions/interviews/create";

export const CreateInterviewDialog = () => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const disabled =
    loading || !title.trim() || !(transcript.trim() || audioUrl.trim());

  const handleSubmit = async () => {
    if (disabled) {
      return;
    }

    setLoading(true);

    try {
      const response = await createInterview(title, transcript, audioUrl);

      if ("error" in response) {
        throw new Error(response.error);
      }

      setTitle("");
      setTranscript("");
      setAudioUrl("");
      setOpen(false);
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      cta="Create"
      description="Add an interview transcript for AI analysis."
      disabled={disabled}
      modal={false}
      onClick={handleSubmit}
      onOpenChange={setOpen}
      open={open}
      title="New Interview"
      trigger={
        <Button className="w-fit" onClick={() => setOpen(true)}>
          Add interview
        </Button>
      }
    >
      <div className="space-y-4">
        <Input
          className="bg-background"
          label="Title"
          onChangeText={setTitle}
          placeholder="Quarterly customer interview"
          value={title}
        />
        <Input
          className="bg-background"
          label="Audio URL (optional)"
          onChangeText={setAudioUrl}
          placeholder="https://example.com/interview.mp3"
          value={audioUrl}
        />
        <Textarea
          className="min-h-[220px] bg-background"
          label="Transcript"
          onChangeText={setTranscript}
          placeholder="Paste the transcript here..."
          value={transcript}
        />
      </div>
    </Dialog>
  );
};
