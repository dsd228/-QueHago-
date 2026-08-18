import type { AnalysisResult } from "./schema";

export type ImageAnalysisInput = {
  base64: string;
  mimeType: "image/png" | "image/jpeg";
  fileName: string;
  userContext?: string;
};

export type ImageAnalysisOutput = {
  analysis: AnalysisResult;
  extractedText: string;
};

export interface AnalysisProvider {
  analyzeText(content: string): Promise<AnalysisResult>;
  analyzeImage?(input: ImageAnalysisInput): Promise<ImageAnalysisOutput>;
}
