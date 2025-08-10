export interface ClassSession {
  id: string;
  userId: string;
  classTitle: string;
  dateISO: string; // YYYY-MM-DD
  transcriptPath?: string;
  docUrl?: string;
  createdAt: string;
  updatedAt: string;
}
