import { notFound } from "next/navigation";
import { V2App } from "@/components/v2-app";
import { isStudyLanguage } from "@/lib/v2";
import "../../../study.css";

export const metadata = { title: "음악으로 배우기 — 한마디" };
export default async function MusicPage({ params }: { params: Promise<{ language: string; songId: string }> }) {
  const { language, songId } = await params;
  if (!isStudyLanguage(language) || !/^[a-zA-Z0-9_-]{1,100}$/.test(songId)) notFound();
  return <V2App key={`${language}:${songId}`} initialMusic={{ language, id: songId }} />;
}
