import { cookies } from 'next/headers';

import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { auth, signIn } from '../(auth)/auth';
import { redirect } from 'next/navigation';
import { PremiumUpgradeBanner } from '@/components/premium-upgrade-banner';
import { getMessageCountByUserId } from '@/lib/db/queries';
import { entitlementsByUserType } from '@/lib/ai/entitlements';

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  const id = generateUUID();

  // Get message count for banner
  const userType = session.user.type;
  const entitlements = entitlementsByUserType[userType];

  let messagesRemaining = undefined;
  let isLimitReached = false;

  if (userType === 'guest' && entitlements.maxMessagesTotal) {
    const totalMessages = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: undefined,
    });
    messagesRemaining = Math.max(0, entitlements.maxMessagesTotal - totalMessages);
    isLimitReached = messagesRemaining === 0;
  }

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');

  if (!modelIdFromCookie) {
    return (
      <>
        {(userType === 'guest' || userType === 'regular') && (
          <PremiumUpgradeBanner
            userType={userType}
            messagesRemaining={messagesRemaining}
            isLimitReached={isLimitReached}
          />
        )}
        <Chat
          key={id}
          id={id}
          initialMessages={[]}
          initialChatModel={DEFAULT_CHAT_MODEL}
          initialVisibilityType="private"
          isReadonly={false}
          session={session}
          autoResume={false}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      {(userType === 'guest' || userType === 'regular') && (
        <PremiumUpgradeBanner
          userType={userType}
          messagesRemaining={messagesRemaining}
          isLimitReached={isLimitReached}
        />
      )}
      <Chat
        key={id}
        id={id}
        initialMessages={[]}
        initialChatModel={modelIdFromCookie.value}
        initialVisibilityType="private"
        isReadonly={false}
        session={session}
        autoResume={false}
      />
      <DataStreamHandler />
    </>
  );
}
