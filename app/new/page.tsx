import type { Metadata } from "next";
import Home from "@/app/page";

export const metadata: Metadata = {
  title: "New Chat - Sanmine",
};

export default function NewChatPage() {
  return <Home />;
}
