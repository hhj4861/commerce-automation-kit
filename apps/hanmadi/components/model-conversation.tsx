"use client";
import type { ComponentProps } from "react";
import { ConversationRoom } from "./conversation-room";
import { GuidedSpeakingRoom } from "./guided-speaking-room";

export function ModelConversation({ guided, ...props }: ComponentProps<typeof ConversationRoom> & { guided: boolean }) {
  return <>
    <p className="mt-5 text-sm text-ink-soft">기본 Gemini로 연습해요. 별도 AI 계정 연결은 필요 없어요.</p>
    {guided ? <GuidedSpeakingRoom {...props} /> : <ConversationRoom {...props} />}
  </>;
}
