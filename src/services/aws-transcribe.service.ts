import { TranscribeStreamingClient, StartStreamTranscriptionCommand, AudioEvent, StartStreamTranscriptionCommandInput } from "@aws-sdk/client-transcribe-streaming";
import { PassThrough, Readable } from "stream";

export type TranscribeOptions = {
  languageCode?: string;
  vocabName?: string;
  languageModelName?: string;
  speakerLabels?: boolean;
  minSpeakerCount?: number;
  maxSpeakerCount?: number;
};

export class AwsTranscribeService {
  private client: TranscribeStreamingClient;

  constructor(region: string) {
    this.client = new TranscribeStreamingClient({ region });
  }

  async streamTranscription(pcmReadable: Readable, opts: TranscribeOptions, onResult: (partial: boolean, text: string, speaker?: string) => void) {
    const audioStream = async function* () {
      for await (const chunk of pcmReadable) {
        yield { AudioEvent: { AudioChunk: chunk } as AudioEvent } as any;
      }
    };

    // Simplified configuration to avoid validation errors
    const input: StartStreamTranscriptionCommandInput = {
      LanguageCode: (opts.languageCode || process.env.AWS_TRANSCRIBE_LANGUAGE_CODE || "en-US") as any,
      MediaEncoding: "pcm",
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream()
    };

    // Only add optional parameters if they are provided
    if (opts.vocabName) (input as any).VocabularyName = opts.vocabName;
    if (opts.languageModelName) (input as any).LanguageModelName = opts.languageModelName;

    const command = new StartStreamTranscriptionCommand(input);

    const response = await this.client.send(command);

    for await (const evt of response.TranscriptResultStream || []) {
      // @ts-ignore
      const results = evt.TranscriptEvent?.Transcript?.Results || [];
      for (const r of results) {
        const partial = !!r.IsPartial;
        const alternatives = r.Alternatives || [];
        const transcript = alternatives[0]?.Transcript || "";
        const speaker = alternatives[0]?.Items?.[0]?.Speaker || undefined;
        if (transcript) {
          onResult(partial, transcript, speaker);
        }
      }
    }
  }
}