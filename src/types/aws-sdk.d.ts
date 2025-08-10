declare module '@aws-sdk/client-cost-explorer' {
  export class CostExplorerClient {
    constructor(config?: any);
    send(command: any): Promise<any>;
  }
  export class GetCostAndUsageCommand {
    constructor(params: any);
  }
}