import type { TimeBlock } from "@prisma/client";

/** Bell times and spaces every new school starts with; staff can change them in Moderation › School. */
export const DEFAULT_SLOTS: { label: string; startMinute: number; block: TimeBlock }[] = [
  { label: "7:30 am", startMinute: 7 * 60 + 30, block: "before_school" },
  { label: "Lunch", startMinute: 12 * 60 + 10, block: "lunch" },
  { label: "3:30 pm", startMinute: 15 * 60 + 30, block: "after_school" },
  { label: "4:30 pm", startMinute: 16 * 60 + 30, block: "after_school" },
  { label: "7:00 pm", startMinute: 19 * 60, block: "evening" },
];
export const DEFAULT_SPACES = ["Library", "Room 204 (Math)", "Learning commons"];
