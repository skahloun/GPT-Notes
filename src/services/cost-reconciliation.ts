import { usageTracker } from './usage-tracker';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

export class CostReconciliationService {
  private db: any;
  
  async initialize() {
    this.db = await open({
      filename: path.join(process.cwd(), "class-notes.db"),
      driver: sqlite3.Database
    });
    
    // Create table for reconciliation history
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS cost_reconciliation (
        id TEXT PRIMARY KEY,
        date TEXT,
        service TEXT,
        aws_total_cost REAL,
        app_estimated_cost REAL,
        reconciled_at TEXT,
        details TEXT
      );
    `);
  }
  
  // Run daily reconciliation
  async reconcileYesterdaysCosts() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    console.log(`Starting cost reconciliation for ${dateStr}`);
    
    try {
      // Get yesterday's usage from database
      const userUsage = await this.getUserUsageForDate(dateStr);
      
      // Get actual AWS costs and allocate to users
      const userCosts = await usageTracker.allocateCostsToUsers(dateStr, userUsage);
      
      // Update user cost totals in database
      for (const [userId, actualCost] of userCosts.entries()) {
        await this.updateUserCost(userId, actualCost, dateStr);
      }
      
      // Log reconciliation
      await this.logReconciliation(dateStr, userCosts);
      
      console.log(`Cost reconciliation completed for ${dateStr}`);
    } catch (error) {
      console.error(`Cost reconciliation failed for ${dateStr}:`, error);
    }
  }
  
  // Get user usage for a specific date
  private async getUserUsageForDate(date: string): Promise<Map<string, number>> {
    const sessions = await this.db.all(`
      SELECT userId, SUM(duration_minutes) as total_minutes
      FROM sessions
      WHERE DATE(createdAt) = ?
      GROUP BY userId
    `, [date]);
    
    const usage = new Map<string, number>();
    sessions.forEach((row: any) => {
      usage.set(row.userId, row.total_minutes);
    });
    
    return usage;
  }
  
  // Update user's actual cost
  private async updateUserCost(userId: string, actualCost: number, date: string) {
    // Get the estimated cost for comparison
    const estimated = await this.db.get(`
      SELECT SUM(aws_cost) as estimated_cost
      FROM sessions
      WHERE userId = ? AND DATE(createdAt) = ?
    `, [userId, date]);
    
    const estimatedCost = estimated?.estimated_cost || 0;
    const adjustment = actualCost - estimatedCost;
    
    // Update the user's total with the adjustment
    await this.db.run(`
      UPDATE users
      SET total_aws_cost = total_aws_cost + ?
      WHERE id = ?
    `, [adjustment, userId]);
    
    // Log the adjustment
    await this.db.run(`
      INSERT INTO usage_logs(id, userId, sessionId, service, operation, cost, details)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `, [
      Date.now().toString(),
      userId,
      'reconciliation',
      'AWS',
      'Cost Reconciliation',
      adjustment,
      JSON.stringify({
        date,
        estimated: estimatedCost,
        actual: actualCost,
        adjustment
      })
    ]);
  }
  
  // Log reconciliation details
  private async logReconciliation(date: string, userCosts: Map<string, number>) {
    const totalActualCost = Array.from(userCosts.values()).reduce((sum, cost) => sum + cost, 0);
    
    const estimatedResult = await this.db.get(`
      SELECT SUM(aws_cost) as total_estimated
      FROM sessions
      WHERE DATE(createdAt) = ?
    `, [date]);
    
    const totalEstimated = estimatedResult?.total_estimated || 0;
    
    await this.db.run(`
      INSERT INTO cost_reconciliation(id, date, service, aws_total_cost, app_estimated_cost, reconciled_at, details)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `, [
      Date.now().toString(),
      date,
      'AWS Transcribe',
      totalActualCost,
      totalEstimated,
      new Date().toISOString(),
      JSON.stringify({
        userCount: userCosts.size,
        userBreakdown: Array.from(userCosts.entries())
      })
    ]);
  }
}

// Singleton instance
export const costReconciliation = new CostReconciliationService();

// Schedule daily reconciliation (runs at 2 AM)
export function scheduleDailyReconciliation() {
  const runReconciliation = async () => {
    await costReconciliation.initialize();
    await costReconciliation.reconcileYesterdaysCosts();
  };
  
  // Calculate time until 2 AM
  const now = new Date();
  const next2AM = new Date(now);
  next2AM.setHours(2, 0, 0, 0);
  
  if (next2AM.getTime() <= now.getTime()) {
    next2AM.setDate(next2AM.getDate() + 1);
  }
  
  const msUntil2AM = next2AM.getTime() - now.getTime();
  
  // Schedule first run
  setTimeout(() => {
    runReconciliation();
    
    // Then run every 24 hours
    setInterval(runReconciliation, 24 * 60 * 60 * 1000);
  }, msUntil2AM);
  
  console.log(`Cost reconciliation scheduled to run daily at 2 AM, first run in ${Math.round(msUntil2AM / 1000 / 60)} minutes`);
}