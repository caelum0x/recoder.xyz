interface EmailProviderInfo {
  name: string;
  url: string;
}

const providers: Record<string, { name: string; webUrl: string; mobileUrl: string }> = {
  'gmail.com': { name: 'Gmail', webUrl: 'https://mail.google.com', mobileUrl: 'googlegmail://' },
  'googlemail.com': { name: 'Gmail', webUrl: 'https://mail.google.com', mobileUrl: 'googlegmail://' },
  'outlook.com': { name: 'Outlook', webUrl: 'https://outlook.live.com', mobileUrl: 'ms-outlook://' },
  'hotmail.com': { name: 'Outlook', webUrl: 'https://outlook.live.com', mobileUrl: 'ms-outlook://' },
  'live.com': { name: 'Outlook', webUrl: 'https://outlook.live.com', mobileUrl: 'ms-outlook://' },
  'msn.com': { name: 'Outlook', webUrl: 'https://outlook.live.com', mobileUrl: 'ms-outlook://' },
  'yahoo.com': { name: 'Yahoo Mail', webUrl: 'https://mail.yahoo.com', mobileUrl: 'ymail://' },
  'yahoo.de': { name: 'Yahoo Mail', webUrl: 'https://mail.yahoo.com', mobileUrl: 'ymail://' },
  'yahoo.co.uk': { name: 'Yahoo Mail', webUrl: 'https://mail.yahoo.com', mobileUrl: 'ymail://' },
  'icloud.com': { name: 'Mail', webUrl: 'https://www.icloud.com/mail', mobileUrl: 'message://' },
  'me.com': { name: 'Mail', webUrl: 'https://www.icloud.com/mail', mobileUrl: 'message://' },
  'mac.com': { name: 'Mail', webUrl: 'https://www.icloud.com/mail', mobileUrl: 'message://' },
  'protonmail.com': { name: 'ProtonMail', webUrl: 'https://mail.proton.me', mobileUrl: 'protonmail://' },
  'proton.me': { name: 'ProtonMail', webUrl: 'https://mail.proton.me', mobileUrl: 'protonmail://' },
  'pm.me': { name: 'ProtonMail', webUrl: 'https://mail.proton.me', mobileUrl: 'protonmail://' },
  'aol.com': { name: 'AOL Mail', webUrl: 'https://mail.aol.com', mobileUrl: 'https://mail.aol.com' },
  'zoho.com': { name: 'Zoho Mail', webUrl: 'https://mail.zoho.com', mobileUrl: 'https://mail.zoho.com' },
};

export function getEmailProviderInfo(email: string): EmailProviderInfo | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  const provider = providers[domain];
  if (!provider) return null;

  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return {
    name: provider.name,
    url: isMobile ? provider.mobileUrl : provider.webUrl,
  };
}
