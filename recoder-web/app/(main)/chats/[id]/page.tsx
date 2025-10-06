// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';
import { getPrisma, inMemoryStore } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { cache } from "react";
import PageClient from "./page.client";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  const chat = await getChatById(id);

  if (!chat) notFound();

  return <PageClient chat={chat} />;
}

const getChatById = cache(async (id: string) => {
  const prisma = getPrisma();

  if (!prisma) {
    // In-memory storage
    const chat = inMemoryStore.chats.get(id);
    if (!chat) return null;

    // Sort messages by position
    const sortedMessages = [...chat.messages].sort((a: any, b: any) =>
      (a.position ?? 0) - (b.position ?? 0)
    );

    return {
      ...chat,
      messages: sortedMessages,
    };
  }

  // Database storage
  return await prisma.chat.findFirst({
    where: { id },
    include: { messages: { orderBy: { position: "asc" } } },
  });
});

export type Chat = NonNullable<Awaited<ReturnType<typeof getChatById>>>;
export type Message = Chat["messages"][number];

export const runtime = "edge";
export const maxDuration = 45;
