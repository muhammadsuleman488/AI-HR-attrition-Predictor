import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "2mb" }));

interface InsightsPayload {
  summary: {
    scopeLabel: string;
    totalEmployees: number;
    activeEmployees: number;
    exitedEmployees: number;
    attritionRatePct: number;
    avgSalaryNGN: number;
    avgPerformance: number;
    avgSatisfaction: number;
    avgTrainingHours: number;
    avgAbsenceDays: number;
    trainingPerformanceCorrR: number | null;
    departmentBreakdown: Array<{
      department: string;
      headcount: number;
      exited: number;
      attritionRatePct: number;
      avgSalaryNGN: number;
    }>;
    driversSummary: Array<{
      factor: string;
      highestGroup: string;
      highestRatePct: number;
      highestCount: number;
      lowestGroup: string;
      lowestRatePct: number;
      lowestCount: number;
    }>;
    clusters: Array<{
      name: string;
      tierLabel: string;
      count: number;
      sharePct: number;
      attritionRatePct: number;
      avgSatisfaction: number;
      avgPerformance: number;
      avgAbsenceDays: number;
      avgTrainingHours: number;
      avgSalaryNGN: number;
      overtimePct: number;
      topDepartments: string[];
    }>;
    stayedVsLeft: Array<{
      metric: string;
      stayedAvg: string;
      leftAvg: string;
      difference: string;
    }>;
    modelMetrics?: {
      modelName: string;
      accuracy: number;
      precision: number;
      recall: number;
      f1: number;
      rocAuc: number | null;
      topFeatures: Array<{ feature: string; importance: number }>;
      reliable: boolean;
    };
  };
}

app.post("/api/insights", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      res.status(500).json({
        error: "GEMINI_API_KEY is not configured. Configure it in the Settings > Secrets panel to generate AI Workforce Intelligence.",
      });
      return;
    }

    const body = req.body as InsightsPayload;
    if (!body?.summary || typeof body.summary.totalEmployees !== "number") {
      res.status(400).json({ error: "Invalid aggregated workforce summary payload." });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const prompt = `You are a Senior HR Analytics Consultant advising a CEO and CHRO.
Analyze ONLY the aggregated workforce analytics JSON below. Never invent numbers, percentages, or claims not present in the JSON.
Explicitly distinguish observed statistical associations/correlations from causation and predictive risk estimates.

Aggregated Workforce Summary:
${JSON.stringify(body.summary, null, 2)}

Provide an executive briefing answering:
1. Which departments have the highest historical attrition (cite exact counts and %)?
2. Which employee characteristics are most associated with retention vs attrition?
3. Which workforce clusters show higher or lower historical attrition?
4. What observed relationships exist between satisfaction, training, performance, and attrition (including Pearson r)?
5. Provide 3 to 5 prioritized, evidence-backed recommendations for HR leadership.`;

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        systemInstruction:
          "You are an executive HR analytics advisor. Produce concise, precise, data-grounded JSON insights using exact figures from the provided summary. Never extrapolate beyond the provided numbers or claim causation from observational correlations.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveHeadline: {
              type: Type.STRING,
              description: "One-sentence executive takeaway grounded in the primary dataset metrics.",
            },
            departmentAttritionInsight: {
              type: Type.STRING,
              description: "Answer on which departments show highest and lowest historical attrition with exact figures.",
            },
            retentionCharacteristicsInsight: {
              type: Type.STRING,
              description: "Answer on which characteristics are associated with retention vs historical exit.",
            },
            clusterSegmentsInsight: {
              type: Type.STRING,
              description: "Interpretation of the K-Means workforce clusters and their historical attrition spread.",
            },
            metricsRelationshipInsight: {
              type: Type.STRING,
              description: "Analysis of satisfaction, training hours, performance rating, and attrition relationships without claiming causation.",
            },
            prioritizedRecommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  priority: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  evidence: { type: Type.STRING },
                  action: { type: Type.STRING },
                  targetGroup: { type: Type.STRING },
                },
                required: ["priority", "title", "evidence", "action", "targetGroup"],
              },
            },
            methodologyCaveat: {
              type: Type.STRING,
              description: "Brief statistical note distinguishing historical observations from causal claims.",
            },
          },
          required: [
            "executiveHeadline",
            "departmentAttritionInsight",
            "retentionCharacteristicsInsight",
            "clusterSegmentsInsight",
            "metricsRelationshipInsight",
            "prioritizedRecommendations",
            "methodologyCaveat",
          ],
        },
      },
    });

    const rawText = (response.text ?? "").trim();
    if (!rawText) {
      res.status(502).json({ error: "Gemini returned an empty response." });
      return;
    }

    const parsed = JSON.parse(rawText);
    res.json({ insights: parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate AI workforce insights.";
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === "production" || fs.existsSync(path.join(__dirname, "dist", "index.html"));

  if (!isProd || process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`HR Workforce Analytics server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
