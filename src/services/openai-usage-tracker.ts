import { AIAnalyzer } from './ai-analyzer';

export interface OpenAIUsageRecord {
  userId: string;
  sessionId: string;
  requestId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  timestamp: Date;
  metadata?: any;
}

export class OpenAIUsageTracker {
  private static instance: OpenAIUsageTracker;
  
  // Current OpenAI pricing as of 2025
  private readonly pricing = {
    'gpt-4': { input: 0.03, output: 0.06 },           // per 1K tokens
    'gpt-4-turbo': { input: 0.01, output: 0.03 },     
    'gpt-4o': { input: 0.0025, output: 0.01 },        
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-3.5-turbo': { input: 0.0015, output: 0.002 }
  };

  private constructor() {}

  static getInstance(): OpenAIUsageTracker {
    if (!OpenAIUsageTracker.instance) {
      OpenAIUsageTracker.instance = new OpenAIUsageTracker();
    }
    return OpenAIUsageTracker.instance;
  }

  // Calculate cost based on model and token usage
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const modelPricing = this.pricing[model as keyof typeof this.pricing];
    
    if (!modelPricing) {
      console.warn(`Unknown model pricing: ${model}, using GPT-4 pricing as default`);
      return this.calculateCost('gpt-4', inputTokens, outputTokens);
    }
    
    const inputCost = (inputTokens / 1000) * modelPricing.input;
    const outputCost = (outputTokens / 1000) * modelPricing.output;
    
    return inputCost + outputCost;
  }

  // Parse token usage from OpenAI response
  parseUsageFromResponse(response: any): {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } {
    const usage = response.usage || {};
    return {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0
    };
  }

  // Create usage record from OpenAI response
  createUsageRecord(
    userId: string,
    sessionId: string,
    model: string,
    response: any,
    metadata?: any
  ): OpenAIUsageRecord {
    const usage = this.parseUsageFromResponse(response);
    const estimatedCost = this.calculateCost(model, usage.inputTokens, usage.outputTokens);
    
    return {
      userId,
      sessionId,
      requestId: response.id || 'unknown',
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCost,
      timestamp: new Date(),
      metadata
    };
  }

  // Get cost breakdown for display
  getCostBreakdown(record: OpenAIUsageRecord): {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    costPerThousandTokens: number;
  } {
    const modelPricing = this.pricing[record.model as keyof typeof this.pricing] || this.pricing['gpt-4'];
    
    const inputCost = (record.inputTokens / 1000) * modelPricing.input;
    const outputCost = (record.outputTokens / 1000) * modelPricing.output;
    const totalCost = inputCost + outputCost;
    const costPerThousandTokens = record.totalTokens > 0 ? (totalCost / record.totalTokens) * 1000 : 0;
    
    return {
      inputCost,
      outputCost,
      totalCost,
      costPerThousandTokens
    };
  }
}

// Export singleton instance
export const openAIUsageTracker = OpenAIUsageTracker.getInstance();