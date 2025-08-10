import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';

export interface UsageRecord {
  userId: string;
  sessionId: string;
  service: 'transcribe' | 'openai';
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  metadata?: any;
}

export class UsageTracker {
  private activeSession = new Map<string, UsageRecord>();
  private costExplorerClient: CostExplorerClient;

  constructor() {
    // Cost Explorer only works in us-east-1
    this.costExplorerClient = new CostExplorerClient({ region: 'us-east-1' });
  }

  // Start tracking a transcription session
  startTranscribeSession(userId: string, sessionId: string): void {
    this.activeSession.set(sessionId, {
      userId,
      sessionId,
      service: 'transcribe',
      startTime: new Date(),
      endTime: new Date(),
      durationMinutes: 0
    });
  }

  // End tracking and return duration
  endTranscribeSession(sessionId: string): number {
    const session = this.activeSession.get(sessionId);
    if (!session) return 0;

    session.endTime = new Date();
    session.durationMinutes = (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60);
    
    this.activeSession.delete(sessionId);
    return session.durationMinutes;
  }

  // Get actual AWS costs for a date range
  async getActualAWSCosts(startDate: string, endDate: string) {
    try {
      const params = {
        TimePeriod: {
          Start: startDate, // YYYY-MM-DD format
          End: endDate
        },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost', 'UsageQuantity'],
        Filter: {
          Dimensions: {
            Key: 'SERVICE',
            Values: ['Amazon Transcribe']
          }
        },
        GroupBy: [{
          Type: 'DIMENSION',
          Key: 'USAGE_TYPE'
        }]
      };

      const command = new GetCostAndUsageCommand(params);
      const response = await this.costExplorerClient.send(command);
      
      return this.parseAWSCostResponse(response);
    } catch (error) {
      console.error('Failed to get AWS costs:', error);
      throw error;
    }
  }

  // Parse AWS cost response
  private parseAWSCostResponse(response: any) {
    const costs: any[] = [];
    
    if (response.ResultsByTime) {
      response.ResultsByTime.forEach((timeResult: any) => {
        const date = timeResult.TimePeriod.Start;
        
        timeResult.Groups?.forEach((group: any) => {
          const usageType = group.Keys[0];
          const cost = parseFloat(group.Metrics.UnblendedCost.Amount);
          const usage = parseFloat(group.Metrics.UsageQuantity.Amount);
          
          costs.push({
            date,
            usageType,
            cost,
            usage,
            unit: group.Metrics.UsageQuantity.Unit
          });
        });
      });
    }
    
    return costs;
  }

  // Allocate actual costs to users based on their usage proportion
  async allocateCostsToUsers(date: string, userUsageMinutes: Map<string, number>) {
    // Get actual AWS costs for the date
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const costs = await this.getActualAWSCosts(
      date,
      nextDate.toISOString().split('T')[0]
    );
    
    // Calculate total cost for streaming
    const streamingCost = costs
      .filter(c => c.usageType.includes('Streaming'))
      .reduce((sum, c) => sum + c.cost, 0);
    
    // Calculate total minutes used
    const totalMinutes = Array.from(userUsageMinutes.values())
      .reduce((sum, minutes) => sum + minutes, 0);
    
    if (totalMinutes === 0) return new Map<string, number>();
    
    // Allocate costs proportionally
    const userCosts = new Map<string, number>();
    const costPerMinute = streamingCost / totalMinutes;
    
    userUsageMinutes.forEach((minutes, userId) => {
      userCosts.set(userId, minutes * costPerMinute);
    });
    
    return userCosts;
  }
}

// Singleton instance
export const usageTracker = new UsageTracker();