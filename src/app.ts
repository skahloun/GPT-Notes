import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";
import jwt from "jsonwebtoken";

import { AwsTranscribeService } from "./services/aws-transcribe.service";
import { AIAnalyzer } from "./services/ai-analyzer";
import { GoogleDocsService } from "./services/google-docs.service";
import { notesToDocText } from "./utils/export-utils";
import { usageTracker } from "./services/usage-tracker";
import { db } from "./config/database";
import { paymentService } from "./services/payment.service";
import { securityHeaders } from "./middleware/security";
import paypalRoutes from "./routes/paypal.routes";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/audio" });

// Apply security headers (including CSP for PayPal)
// Temporarily disabled to avoid CSP conflicts with nginx
// app.use(securityHeaders);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "20mb" }));
app.use(cookieParser());

const PORT = parseInt(process.env.PORT || "6001");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// --- DB setup ---
// Database will use PostgreSQL if DATABASE_URL is set, otherwise SQLite
(async () => {
  await db.initialize();
  console.log(`Database initialized: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}`);
})();

// --- Auth (very simple demo) ---
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  const id = uuidv4();
  try {
    // Check if this is a test account
    const isTestAccount = email.toLowerCase().startsWith('test@') || email.toLowerCase().endsWith('@test.com');
    
    if (isTestAccount) {
      // Create test account with unlimited access
      await db.run(`
        INSERT INTO users(
          id, email, password, tier, 
          subscription_plan, subscription_status, hours_limit, 
          credits_balance, is_test_account
        ) VALUES(?,?,?,?,?,?,?,?,?)
      `, [id, email, password, "test", "unlimited", "active", 9999, 9999, 1]);
    } else {
      // Regular account creation
      await db.run("INSERT INTO users(id,email,password,tier) VALUES(?,?,?,?)", [id, email, password, "free"]);
    }
    res.json({ ok: true });
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const row = await db.get("SELECT * FROM users WHERE email=? AND password=?", [email, password]);
  if (!row) return res.status(401).json({ error: "Invalid credentials" });
  
  // Update last login
  await db.run("UPDATE users SET last_login=? WHERE id=?", [new Date().toISOString(), row.id]);
  
  const token = jwt.sign({ uid: row.id, tier: row.tier }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
});

// --- Admin Authentication ---
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;
  
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid admin credentials" });
  }
  
  const adminToken = jwt.sign({ isAdmin: true, username: ADMIN_USERNAME }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ token: adminToken });
});

function authMiddleware(req:any, res:any, next:any) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function adminMiddleware(req:any, res:any, next:any) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No admin token" });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid admin token" });
  }
}

// --- Google OAuth ---
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:6001/auth/google/callback";
console.log("Google OAuth redirect URI:", GOOGLE_REDIRECT_URI);

const googleService = new GoogleDocsService(
  process.env.GOOGLE_CLIENT_ID || "",
  process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_REDIRECT_URI
);

app.get("/auth/google", async (req:any, res) => {
  // Get the user token from the query parameter
  const userToken = req.query.token as string;
  
  // Generate the auth URL with state parameter
  const authUrl = googleService.generateAuthUrl([
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/documents"
  ]);
  
  // Add the user token as state parameter
  const urlWithState = authUrl + (userToken ? `&state=${encodeURIComponent(userToken)}` : '');
  res.redirect(urlWithState);
});

app.get("/auth/google/callback", async (req:any, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string; // User token passed as state
  
  if (!code) return res.status(400).send("Missing code");
  
  try {
    const tokens = await googleService.setCredentialsFromCode(code);
    
    // Determine which user to save tokens for
    let userId = "demo-user";
    if (state && state !== "demo-token") {
      try {
        const payload: any = jwt.verify(state, JWT_SECRET);
        userId = payload.uid;
      } catch (e) {
        console.error("Invalid state token, falling back to demo-user");
      }
    }
    
    // Save tokens to the correct user
    await db.run("UPDATE users SET google_tokens=? WHERE id=?", [JSON.stringify(tokens), userId]);
    
    // Redirect back to the app with success message
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Google Connected</title>
        <style>
          body { font-family: system-ui; padding: 40px; text-align: center; }
          .success { color: #22c55e; font-size: 24px; margin-bottom: 20px; }
          .message { color: #64748b; margin-bottom: 30px; }
          button { background: #3b82f6; color: white; border: none; padding: 12px 24px; 
                   border-radius: 8px; cursor: pointer; font-size: 16px; }
          button:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <div class="success">✅ Google Connected Successfully!</div>
        <div class="message">Your Google account has been connected. You can now close this window.</div>
        <button onclick="window.close()">Close Window</button>
        <script>
          // Try to close the window automatically after 3 seconds
          setTimeout(() => {
            window.close();
            // If window.close() doesn't work, redirect to the app
            window.location.href = '${process.env.NODE_ENV === 'production' ? 'https://gpt-notes-gbtn.onrender.com' : 'http://localhost:6001'}';
          }, 3000);
        </script>
      </body>
      </html>
    `);
  } catch (e: any) {
    console.error("Error saving tokens:", e);
    res.status(500).send("Error saving Google tokens: " + e.message);
  }
});

app.post("/api/save-google-tokens", authMiddleware, async (req:any, res) => {
  const tokens = req.body.tokens;
  await db.run("UPDATE users SET google_tokens=? WHERE id=?", [JSON.stringify(tokens), req.user.uid]);
  res.json({ ok: true });
});

// --- Token verification ---
app.get("/api/verify-token", authMiddleware, async (req: any, res) => {
  try {
    // Get user plan information
    const user = await db.get(`
      SELECT tier, subscription_plan, subscription_status, is_test_account 
      FROM users 
      WHERE id = ?
    `, [req.user.uid]);
    
    // Determine if user has active plan
    const hasActivePlan = user && (
      user.is_test_account === 1 || 
      user.tier === 'premium' || 
      (user.subscription_plan && user.subscription_status === 'active') ||
      user.subscription_plan === 'payg'
    );
    
    res.json({ 
      valid: true, 
      user: req.user,
      hasActivePlan: hasActivePlan
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.json({ valid: true, user: req.user, hasActivePlan: false });
  }
});

// --- User info ---
app.get("/api/user-info", authMiddleware, async (req: any, res) => {
  try {
    const row = await db.get("SELECT email, is_test_account FROM users WHERE id=?", [req.user.uid]);
    if (row) {
      res.json({ 
        email: row.email,
        isTestAccount: row.is_test_account === 1
      });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Admin API Endpoints ---
app.get("/api/admin/users", adminMiddleware, async (req: any, res) => {
  try {
    const users = await db.all(`
      SELECT 
        id, email, tier, created_at, last_login, total_sessions, 
        total_aws_cost, total_openai_cost, is_admin, is_test_account,
        subscription_plan, subscription_status
      FROM users 
      ORDER BY created_at DESC
    `);
    res.json(users);
  } catch (e: any) {
    console.error('Admin users query error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/users/:userId", adminMiddleware, async (req: any, res) => {
  try {
    const { userId } = req.params;
    
    // Admin users can delete any user account
    
    // Delete user data
    await db.run("DELETE FROM sessions WHERE userId=?", [userId]);
    await db.run("DELETE FROM usage_logs WHERE userId=?", [userId]);
    await db.run("DELETE FROM users WHERE id=?", [userId]);
    
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/stats", adminMiddleware, async (req: any, res) => {
  try {
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total_users,
        COALESCE(SUM(total_sessions), 0) as total_sessions,
        COALESCE(SUM(total_aws_cost), 0) as total_aws_cost,
        COALESCE(SUM(total_openai_cost), 0) as total_openai_cost
      FROM users
    `);
    
    // Use database-agnostic date comparison
    const isPostgreSQL = process.env.DATABASE_URL ? true : false;
    
    const recentUsers = await db.get(
      isPostgreSQL 
        ? `SELECT COUNT(*) as recent_users FROM users WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'`
        : `SELECT COUNT(*) as recent_users FROM users WHERE created_at > datetime('now', '-7 days')`
    );
    
    const activeUsers = await db.get(
      isPostgreSQL
        ? `SELECT COUNT(*) as active_users FROM users WHERE last_login > CURRENT_TIMESTAMP - INTERVAL '7 days'`
        : `SELECT COUNT(*) as active_users FROM users WHERE last_login > datetime('now', '-7 days')`
    );
    
    res.json({
      total_users: stats?.total_users || 0,
      total_sessions: stats?.total_sessions || 0,
      total_aws_cost: stats?.total_aws_cost || 0,
      total_openai_cost: stats?.total_openai_cost || 0,
      recent_users: recentUsers?.recent_users || 0,
      active_users: activeUsers?.active_users || 0
    });
  } catch (e: any) {
    console.error('Admin stats error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/usage/:userId", adminMiddleware, async (req: any, res) => {
  try {
    const { userId } = req.params;
    
    const sessions = await db.all(`
      SELECT * FROM sessions 
      WHERE userId=? 
      ORDER BY createdAt DESC 
      LIMIT 50
    `, [userId]);
    
    const usageLogs = await db.all(`
      SELECT * FROM usage_logs 
      WHERE userId=? 
      ORDER BY timestamp DESC 
      LIMIT 100
    `, [userId]);
    
    res.json({ sessions, usageLogs });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Google Auth Status API ---
app.get("/api/google-status", async (req: any, res) => {
  try {
    let userId = "demo-user"; // Default for demo mode
    
    // Check if authenticated user
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (token && token !== "demo-token") {
      try {
        const payload: any = jwt.verify(token, JWT_SECRET);
        userId = payload.uid;
      } catch (e) {
        // Fall back to demo user if token is invalid
      }
    }
    
    const row = await db.get("SELECT google_tokens FROM users WHERE id=?", [userId]);
    const connected = !!(row?.google_tokens);
    res.json({ connected });
  } catch (e: any) {
    console.error("Error checking Google status:", e);
    res.json({ connected: false });
  }
});

app.post("/api/google-disconnect", async (req: any, res) => {
  try {
    let userId = "demo-user"; // Default for demo mode
    
    // Check if authenticated user
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (token && token !== "demo-token") {
      try {
        const payload: any = jwt.verify(token, JWT_SECRET);
        userId = payload.uid;
      } catch (e) {
        // Fall back to demo user if token is invalid
      }
    }
    
    await db.run("UPDATE users SET google_tokens=NULL WHERE id=?", [userId]);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("Error disconnecting Google:", e);
    res.status(500).json({ error: e.message });
  }
});

// --- Static ---
app.use(express.static(path.join(process.cwd(), "public")));

// Admin page routes
app.get("/admin", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "admin-portal.html"));
});

app.get("/admin-portal", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "admin-portal.html"));
});

// Test admin page routes
app.get("/test-admin", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "test-admin.html"));
});

app.get("/admin-test", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "admin-test.html"));
});

// --- Cost calculation utilities ---
function calculateAWSTranscribeCost(durationMinutes: number): number {
  // AWS Transcribe pricing: $0.024 per minute (standard)
  return durationMinutes * 0.024;
}

function calculateOpenAICost(inputTokens: number, outputTokens: number): number {
  // GPT-4 pricing: $0.03/1K input tokens, $0.06/1K output tokens
  const inputCost = (inputTokens / 1000) * 0.03;
  const outputCost = (outputTokens / 1000) * 0.06;
  return inputCost + outputCost;
}

function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

async function logUsage(userId: string, sessionId: string, service: string, operation: string, cost: number, details: string) {
  try {
    await db.run(
      "INSERT INTO usage_logs(id, userId, sessionId, service, operation, cost, details) VALUES(?,?,?,?,?,?,?)",
      [uuidv4(), userId, sessionId, service, operation, cost, details]
    );
  } catch (e) {
    console.error("Failed to log usage:", e);
  }
}

// --- WebSocket: audio streaming to AWS Transcribe ---
const awsService = new AwsTranscribeService(process.env.AWS_REGION || "us-east-1");
const aiAnalyzer = new AIAnalyzer(process.env.OPENAI_API_KEY || "");

type ClientCtx = {
  userId: string;
  sessionId: string;
  classTitle: string;
  dateISO: string;
  transcriptParts: { partial: boolean; text: string; speaker?: string }[];
  pcmStream: Readable;
  startTime: number;
  awsBytes: number;
};

wss.on("connection", (ws, req) => {
  // Query params via URL, auth via header is not available; use subprotocol or initial message
  let ctx: ClientCtx | null = null;
  let closed = false;

  ws.on("message", async (raw) => {
    
    // Handle string messages (init, stop, etc.)
    let messageText = null;
    if (typeof raw === "string") {
      messageText = raw;
    } else if (Buffer.isBuffer(raw)) {
      // Check if it's a text message in buffer form
      try {
        const text = raw.toString('utf8');
        if (text.startsWith('{') && text.endsWith('}')) {
          messageText = text;
        }
      } catch (e) {
        // Not a text message, treat as binary
      }
    }
    
    if (messageText) {
      try {
        const msg = JSON.parse(messageText);
        if (msg.type === "init") {
        // Multi-tenant authentication
        try {
          let userId = "demo-user";
          
          // Check if token is provided and valid
          if (msg.token && msg.token !== "demo-token") {
            try {
              const payload:any = jwt.verify(msg.token, JWT_SECRET);
              userId = payload.uid;
              console.log("Authenticated user:", userId);
            } catch (e) {
              console.log("Invalid token provided, falling back to demo mode");
            }
          } else if (msg.token === "demo-token") {
            console.log("Demo mode user");
          }
          
          // Check if user has valid subscription or credits (skip for demo)
          if (userId !== "demo-user") {
            const user = await db.get("SELECT * FROM users WHERE id=?", [userId]);
            const hasValidPlan = user && (
              user.is_test_account === 1 ||
              (user.subscription_status === 'active' && user.hours_used_this_month < user.hours_limit) ||
              (user.tier === 'payg' && user.credits_balance > 0) ||
              user.subscription_plan === 'payg'
            );
            
            // Allow limited recording for users without active plans (handled by client-side time limits)
            // Just log the status but don't block the connection
            if (!hasValidPlan) {
              console.log(`User ${userId} connecting without active plan - client will enforce time limits`);
            }
          }
          
          const dateISO = msg.dateISO || new Date().toISOString().slice(0,10);
          const pass = new Readable({ read(){} });
          const sessionId = uuidv4();
          
          ctx = { 
            userId,
            sessionId,
            classTitle: msg.classTitle || "Untitled Class", 
            dateISO, 
            transcriptParts: [], 
            pcmStream: pass,
            startTime: Date.now(),
            awsBytes: 0
          };
          
          // Start tracking the session
          usageTracker.startTranscribeSession(userId, sessionId);
          
          ws.send(JSON.stringify({ type: "transcript", partial: true, text: "Initializing AWS Transcribe...", speaker: "System" }));
          
          // Start AWS stream
          awsService.streamTranscription(pass, {
            languageCode: process.env.AWS_TRANSCRIBE_LANGUAGE_CODE || "en-US",
            vocabName: process.env.AWS_TRANSCRIBE_VOCAB_NAME || undefined as any,
            languageModelName: process.env.AWS_TRANSCRIBE_LANGUAGE_MODEL || undefined as any,
            speakerLabels: false  // Disable speaker labeling to avoid validation issues
          }, (partial, text, speaker) => {
            if (!closed && ctx) {
              ctx.transcriptParts.push({ partial, text, speaker });
              ws.send(JSON.stringify({ type: "transcript", partial, text, speaker }));
            }
          }).then(() => {
            if (!closed && ctx) {
              ws.send(JSON.stringify({ type: "transcript", partial: true, text: "AWS Transcribe connected. Start speaking...", speaker: "System" }));
            }
          }).catch(err => {
            console.error("AWS Transcribe error:", err);
            ws.send(JSON.stringify({ type: "error", message: "Transcribe error: " + err.message }));
          });
        } catch (e:any) {
          ws.send(JSON.stringify({ type: "error", message: "Auth failed: " + e.message }));
          ws.close();
        }
      } else if (msg.type === "stop") {
        // finalize
        if (ctx && !closed) {
          console.log("Stopping session and generating notes...");
          ctx.pcmStream.push(null);
          closed = true;
          // Use all transcript parts, not just final ones, to capture the complete conversation
          const allParts = ctx.transcriptParts;
          let fullText = "";
          
          if (allParts.length === 0) {
            fullText = "";
          } else {
            // Get the latest/longest transcript from each speaker segment
            const latestTranscripts = [];
            let currentSpeaker = "";
            let currentText = "";
            
            for (const part of allParts) {
              const speaker = part.speaker || "Speaker";
              
              // If same speaker, keep the longer/latest text
              if (speaker === currentSpeaker) {
                if (part.text.length > currentText.length) {
                  currentText = part.text;
                }
              } else {
                // New speaker, save previous and start new
                if (currentText) {
                  latestTranscripts.push(`${currentSpeaker}: ${currentText}`);
                }
                currentSpeaker = speaker;
                currentText = part.text;
              }
            }
            
            // Add the last segment
            if (currentText) {
              latestTranscripts.push(`${currentSpeaker}: ${currentText}`);
            }
            
            fullText = latestTranscripts.join("\n");
          }
          console.log("Full transcript length:", fullText.length);
          console.log("Full transcript preview:", fullText.substring(0, 200) + "...");
          
          // Persist transcript
          const fileName = `transcripts/${ctx.userId}-${Date.now()}.txt`;
          const fs = await import("fs");
          const p = path.join(process.cwd(), fileName);
          await fs.promises.mkdir(path.dirname(p), { recursive: true });
          await fs.promises.writeFile(p, fullText, "utf8");

          // AI notes
          console.log("Sending generating_notes message");
          ws.send(JSON.stringify({ type: "generating_notes", message: "🤖 Analyzing transcript with AI..." }));
          
          let refinedTranscript = fullText;
          let notes: any = null;
          let openAIUsage: any = null;
          let openaiCost = 0;
          
          try {
            console.log("Calling AI analyzer...");
            console.log("OpenAI API key present:", !!process.env.OPENAI_API_KEY);
            
            if (!process.env.OPENAI_API_KEY) {
              throw new Error("OpenAI API key not configured");
            }
            
            const aiResult = await aiAnalyzer.refineAndSummarize(
              fullText, 
              ctx.classTitle,
              ctx.userId,
              ctx.sessionId
            );
            
            refinedTranscript = aiResult.refinedTranscript;
            notes = aiResult.notes;
            openAIUsage = aiResult.usage;
            openaiCost = openAIUsage?.estimatedCost || 0;
            
            console.log("Notes generated:", notes);
            console.log("Sending notes message immediately");
            ws.send(JSON.stringify({ type: "notes", notes }));
            
          } catch (e: any) {
            console.error("Error generating AI notes:", e.message);
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Failed to generate AI notes: " + e.message 
            }));
            
            // Create fallback notes
            notes = {
              introduction: ["Transcript saved but AI notes generation failed"],
              keyConcepts: [],
              explanations: [],
              definitions: [],
              summary: ["Please check your OpenAI API key configuration"],
              examQuestions: []
            };
          }
          
          const docText = notesToDocText(ctx.classTitle, ctx.dateISO, refinedTranscript, notes);

          // Google tokens
          const row = await db.get("SELECT google_tokens FROM users WHERE id=?", [ctx.userId]);
          let docUrl: string | null = null;
          if (row?.google_tokens) {
            const tokens = JSON.parse(row.google_tokens);
            const gs = new (await import("./services/google-docs.service")).GoogleDocsService(
              process.env.GOOGLE_CLIENT_ID || "", process.env.GOOGLE_CLIENT_SECRET || "", process.env.GOOGLE_REDIRECT_URI || ""
            );
            gs.setCredentials(tokens);
            const title = `${ctx.classTitle} Notes - ${ctx.dateISO}`;
            try {
              docUrl = await gs.createFormattedNotesDoc(title, ctx.classTitle, ctx.dateISO, refinedTranscript, notes, "Class Notes");
            } catch (e:any) {
              ws.send(JSON.stringify({ type: "warning", message: "Google Docs failed: " + e.message }));
            }
          } else {
            ws.send(JSON.stringify({ type: "warning", message: "Google not connected; notes not saved to Docs." }));
          }

          // Get actual duration from usage tracker
          const actualDurationMinutes = usageTracker.endTranscribeSession(ctx.sessionId);
          
          // For now, use estimated cost, but this will be reconciled with actual AWS costs
          const awsCost = calculateAWSTranscribeCost(actualDurationMinutes);

          const id = uuidv4();
          const now = new Date().toISOString();
          
          // Save session with cost data
          await db.run(`
            INSERT INTO sessions(
              id, userId, classTitle, dateISO, transcriptPath, docUrl, 
              createdAt, updatedAt, duration_minutes, aws_cost, openai_cost, transcript_length
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
          `, [
            id, ctx.userId, ctx.classTitle, ctx.dateISO, fileName, docUrl, 
            now, now, actualDurationMinutes, awsCost, openaiCost, fullText.length
          ]);

          // Log individual usage entries
          await logUsage(ctx.userId, id, 'AWS', 'Transcribe', awsCost, `${actualDurationMinutes.toFixed(2)} minutes, ${ctx.awsBytes} bytes`);
          
          // Log OpenAI usage with actual token data
          if (openAIUsage) {
            await logUsage(
              ctx.userId, 
              id, 
              'OpenAI', 
              openAIUsage.model, 
              openaiCost, 
              JSON.stringify({
                inputTokens: openAIUsage.inputTokens,
                outputTokens: openAIUsage.outputTokens,
                totalTokens: openAIUsage.totalTokens,
                requestId: openAIUsage.requestId
              })
            );
          }

          // Update user totals
          await db.run(`
            UPDATE users SET 
              total_sessions = total_sessions + 1,
              total_aws_cost = total_aws_cost + ?,
              total_openai_cost = total_openai_cost + ?
            WHERE id = ?
          `, [awsCost, openaiCost, ctx.userId]);
          
          // Charge usage based on plan (skip for demo)
          if (ctx.userId !== "demo-user") {
            await paymentService.chargeUsage(ctx.userId, actualDurationMinutes, id, db);
          }

          // Send final message with delay
          setTimeout(() => {
            console.log("Sending final message");
            ws.send(JSON.stringify({ type: "final", docUrl, transcriptPath: fileName }));
            
            // Another delay before closing
            setTimeout(() => {
              ws.close();
            }, 200);
          }, 100);
        }
      }
      } catch (e:any) {
        console.error("Error parsing JSON message:", e.message);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    } else {
      // binary: PCM 16k mono chunk
      if (ctx && !closed) {
        ctx.pcmStream.push(raw);
        if (Buffer.isBuffer(raw)) {
          ctx.awsBytes += raw.length;
        }
      }
    }
  });

  ws.on("close", () => {
    closed = true;
    if (ctx) ctx.pcmStream.push(null);
  });
});

// Sessions index
app.get("/api/sessions", authMiddleware, async (req:any, res) => {
  const rows = await db.all("SELECT * FROM sessions WHERE userId=? ORDER BY createdAt DESC", [req.user.uid]);
  res.json(rows);
});

// PayPal routes (with authentication)
app.use("/api/paypal", authMiddleware, paypalRoutes);

// Legacy payment endpoints (for backward compatibility)
app.post("/api/subscribe", authMiddleware, async (req:any, res) => {
  try {
    const { subscriptionId, plan } = req.body;
    const result = await paymentService.activateSubscription(req.user.uid, plan, subscriptionId, db);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/add-credit", authMiddleware, async (req:any, res) => {
  try {
    const { orderId, amount } = req.body;
    const result = await paymentService.addCredits(req.user.uid, parseFloat(amount), orderId, db);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/purchase-plan", authMiddleware, async (req:any, res) => {
  try {
    const { orderId, plan, amount, payerEmail } = req.body;
    
    // Map plan names to database values
    const planMapping: any = {
      'Student Plan': { plan: 'student', hours: 10 },
      'Premium Plan': { plan: 'premium', hours: 30 },
      'Unlimited Plan': { plan: 'unlimited', hours: 50 }
    };
    
    const planInfo = planMapping[plan];
    if (!planInfo) {
      throw new Error('Invalid plan selected');
    }
    
    // Update user's subscription
    await db.run(
      `UPDATE users SET 
        subscription_plan = ?, 
        subscription_status = 'active',
        subscription_start_date = datetime('now'),
        subscription_end_date = datetime('now', '+1 month'),
        hours_limit = ?,
        hours_used_this_month = 0,
        last_payment_date = datetime('now'),
        last_payment_amount = ?
      WHERE id = ?`,
      [planInfo.plan, planInfo.hours, amount, req.user.uid]
    );
    
    // Record the payment
    await db.run(
      `INSERT INTO payments (user_id, amount, payment_type, payment_method, transaction_id, created_at)
       VALUES (?, ?, 'subscription', 'paypal', ?, datetime('now'))`,
      [req.user.uid, amount, orderId]
    );
    
    res.json({ 
      success: true, 
      message: 'Plan activated successfully',
      plan: planInfo.plan,
      hoursLimit: planInfo.hours
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/billing-status", authMiddleware, async (req:any, res) => {
  try {
    console.log('Fetching billing status for user:', req.user.uid);
    
    const user = await db.get("SELECT subscription_plan, subscription_status, hours_used_this_month, hours_limit, credits_balance, is_test_account FROM users WHERE id=?", [req.user.uid]);
    
    if (!user) {
      console.error('User not found:', req.user.uid);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('User billing data:', {
      subscription_plan: user.subscription_plan,
      subscription_status: user.subscription_status,
      credits_balance: user.credits_balance,
      is_test_account: user.is_test_account
    });
    
    // Special handling for test accounts
    if (user.is_test_account === 1) {
      res.json({
        plan: 'test',
        status: 'active',
        hoursUsed: 0,
        hoursLimit: 9999,
        creditsBalance: 9999,
        isTestAccount: true
      });
    } else {
      // Check if user has credits (pay-as-you-go)
      const creditsBalance = parseFloat(user.credits_balance) || 0;
      const hasCredits = creditsBalance > 0;
      const plan = user.subscription_plan || (hasCredits ? 'payg' : 'none');
      
      const response = {
        plan: plan,
        status: plan === 'payg' && hasCredits ? 'active' : (user.subscription_status || 'inactive'),
        hoursUsed: parseFloat(user.hours_used_this_month) || 0,
        hoursLimit: parseFloat(user.hours_limit) || 0,
        creditsBalance: creditsBalance,
        isTestAccount: false
      };
      
      console.log('Sending billing response:', response);
      res.json(response);
    }
  } catch (e: any) {
    console.error('Error in billing-status endpoint:', e);
    res.status(500).json({ error: e.message });
  }
});

// Note: PayPal webhook is now handled in /api/paypal/webhook route

// Health
app.get("/api/health", (_, res) => res.json({ ok: true }));

// Debug endpoint for admin
app.get("/api/admin/debug", adminMiddleware, async (req: any, res) => {
  try {
    // Test database connection
    const testQuery = await db.get("SELECT 1 as test");
    
    // Check if users table exists
    let tableCheck;
    if (process.env.DATABASE_URL) {
      tableCheck = await db.get(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'users'
        ) as table_exists
      `);
    } else {
      tableCheck = await db.get(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='users'
      `);
    }
    
    // Count users
    let userCount;
    try {
      userCount = await db.get("SELECT COUNT(*) as count FROM users");
    } catch (e) {
      userCount = { error: e.message };
    }
    
    res.json({
      database: process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite',
      connected: !!testQuery,
      tableExists: !!tableCheck,
      userCount: userCount,
      env: {
        hasDbUrl: !!process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV
      }
    });
  } catch (e: any) {
    res.status(500).json({ 
      error: e.message,
      stack: e.stack 
    });
  }
});

server.listen(PORT, () => {
  console.log("Server listening on http://localhost:" + PORT);
  
  // Schedule daily cost reconciliation
  import('./services/cost-reconciliation').then(({ scheduleDailyReconciliation }) => {
    scheduleDailyReconciliation();
  });
});
