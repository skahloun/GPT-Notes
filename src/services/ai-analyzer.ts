import OpenAI from "openai";
import { openAIUsageTracker, OpenAIUsageRecord } from "./openai-usage-tracker";

export interface NoteSections {
  introduction: string[];
  keyConcepts: string[];
  explanations: string[];
  definitions: string[];
  summary: string[];
  examQuestions: string[];
  diarizedHints?: string[];
}

export class AIAnalyzer {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async refineAndSummarize(
    transcript: string, 
    classTitle: string, 
    userId?: string, 
    sessionId?: string
  ): Promise<{ 
    refinedTranscript: string, 
    notes: NoteSections,
    usage?: OpenAIUsageRecord 
  }> {
    const system = `You are an academic note generator. Be accurate, concise, and structured. If speaker labels are inconsistent, fix them based on context. Prefer labeling the main lecturer as "Professor".`;

    const user = `Refine speaker labels handling overlaps by context. Transcript (may contain overlaps):\n\n${transcript}\n\nThen generate structured notes for the class "${classTitle}" with these sections:\n- Introduction (bullet points)\n- Key Concepts (bullet points)\n- Explanations (bullet points)\n- Definitions (bullet points)\n- Summary (bullet points)\n- Potential Exam Questions (bullet points)\nReturn JSON with keys: refinedTranscript, notes{introduction,keyConcepts,explanations,definitions,summary,examQuestions}`;

    const model = "gpt-4o-mini";
    const resp = await this.openai.chat.completions.create({
      model: model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" },
      user: userId ? `user_${userId}` : undefined // For OpenAI abuse monitoring
    } as any);

    // Create usage record if userId and sessionId provided
    let usageRecord: OpenAIUsageRecord | undefined;
    if (userId && sessionId) {
      usageRecord = openAIUsageTracker.createUsageRecord(
        userId,
        sessionId,
        model,
        resp,
        {
          operation: 'refineAndSummarize',
          classTitle,
          transcriptLength: transcript.length
        }
      );
    }

    try {
      const content = resp.choices[0].message.content || "{}";
      const parsed = JSON.parse(content);
      return {
        refinedTranscript: parsed.refinedTranscript || transcript,
        notes: parsed.notes as NoteSections,
        usage: usageRecord
      };
    } catch (e) {
      // Fallback: simple notes
      return {
        refinedTranscript: transcript,
        notes: {
          introduction: ["(auto) Notes generation failed to parse JSON."],
          keyConcepts: [], explanations: [], definitions: [], summary: [], examQuestions: []
        },
        usage: usageRecord
      };
    }
  }
}
