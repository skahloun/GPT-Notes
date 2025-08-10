import { AssemblyAI } from "assemblyai";

export class AssemblyAIService {
  private client: AssemblyAI;

  constructor(apiKey: string) {
    this.client = new AssemblyAI({ apiKey });
  }

  async transcribeStreaming(onResult: (partial: boolean, text: string, speaker?: string) => void) {
    // Placeholder streaming setup - user can wire this similarly to AWS if needed.
    // AssemblyAI's real-time SDK would be used in a production setup.
    throw new Error("AssemblyAI streaming not fully implemented in this demo. Use AWS by default.");
  }
}
