import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LeadCaptureForm } from '@/components/LeadCaptureForm';

describe('LeadCaptureForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
    );
    window.sessionStorage.clear();
  });

  it('submits an email to the newsletter endpoint and shows success state', async () => {
    window.sessionStorage.setItem(
      'recoder_utm',
      JSON.stringify({ utm_source: 'twitter', utm_campaign: 'launch' })
    );

    render(<LeadCaptureForm source="homepage_hero_lead_capture" />);

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'founder@recoder.xyz' },
    });
    fireEvent.click(screen.getByRole('button', { name: /get updates/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/newsletter/subscribe',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      email: 'founder@recoder.xyz',
      source: 'homepage_hero_lead_capture',
      utm_source: 'twitter',
      utm_campaign: 'launch',
    });

    expect(await screen.findByText("You're on the list.")).toBeDefined();
  });
});
