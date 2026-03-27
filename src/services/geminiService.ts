import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { WatchlistItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface DetailedFilmInfo {
  title: string;
  type: 'film' | 'tv' | 'anime';
  summary: string;
  cast: string[];
  director?: string;
  releaseYear?: number;
  rating?: string;
  duration?: string;
  genres: string[];
  availability: {
    platform: string;
    isAvailable: boolean;
  }[];
  posterUrl?: string;
  sourceUrl?: string;
}

export async function searchFilm(query: string): Promise<DetailedFilmInfo | null> {
  const model = "gemini-3.1-flash-lite-preview";
  const currentDate = new Date().toLocaleDateString();
  
  const prompt = `
    Today's date is ${currentDate}. 
    Find CURRENT official info for: "${query}".
    
    CRITICAL: Verify streaming availability specifically for the user's region (likely Europe/Italy based on context). 
    Check if it is ACTUALLY on Netflix, Prime Video, Now, or Disney+ TODAY. 
    If it was recently removed, mark it as unavailable.
    
    Return strictly JSON with: title, type, summary, cast, director, releaseYear, rating, duration, genres, availability (array of {platform, isAvailable}), posterUrl, sourceUrl.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // includeServerSideToolInvocations is required for search grounding
        toolConfig: { includeServerSideToolInvocations: true },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["film", "tv", "anime"] },
            summary: { type: Type.STRING },
            cast: { type: Type.ARRAY, items: { type: Type.STRING } },
            director: { type: Type.STRING },
            releaseYear: { type: Type.NUMBER },
            rating: { type: Type.STRING },
            duration: { type: Type.STRING },
            genres: { type: Type.ARRAY, items: { type: Type.STRING } },
            availability: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  platform: { type: Type.STRING },
                  isAvailable: { type: Type.BOOLEAN }
                },
                required: ["platform", "isAvailable"]
              }
            },
            posterUrl: { type: Type.STRING },
            sourceUrl: { type: Type.STRING }
          },
          required: ["title", "type", "summary", "cast", "genres", "availability"]
        }
      }
    });

    // Safely extract text from the first candidate's content parts
    const candidate = response.candidates?.[0];
    const textPart = candidate?.content?.parts?.find(p => p.text)?.text;
    
    if (!textPart) {
      console.error("Search Error: No text part found in response", response);
      return null;
    }

    const cleanJson = textPart.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    
    try {
      return JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Search Error: Failed to parse JSON", parseError, "Raw text:", textPart);
      return null;
    }
  } catch (error) {
    console.error("Search Error:", error);
    return null;
  }
}

export async function getRecommendation(mood: string, history: WatchlistItem[]) {
  const model = "gemini-3.1-flash-lite-preview";
  
  const historyText = history
    .filter(item => item.status === 'watched')
    .map(item => `- ${item.title} (${item.type}, ${item.platform})`)
    .join('\n');

  const prompt = `
    Suggest ONE film/TV/anime for mood: "${mood}".
    History: ${historyText || "None"}.
    Explain briefly why it fits.
    Return Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
      }
    });
    return response.text;
  } catch (error) {
    console.error("AI Error:", error);
    return "Sorry, I couldn't get a recommendation right now. Try again later!";
  }
}
