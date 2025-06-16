// planAgent.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { GraphState } from "../graph/graphState.js";
import dotenv from "dotenv";

dotenv.config();

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  apiKey: process.env.GEMINI_API_KEY!,
});

const planPrompt = ChatPromptTemplate.fromTemplate(`
You are a DevOps project planner.

The user asked:
"{userMessage}"

Create a step-by-step plan to complete this task in a DevOps environment using GitLab. Focus on clarity and sequencing.

Your response should be a bullet list or numbered list of concrete steps.
`);

export async function PlanAgent(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log("---PLAN AGENT---");

  const prompt = await planPrompt.format({
    userMessage: state.userMessage,
  });

  const plans = await model.pipe(new StringOutputParser()).invoke(prompt);

  return {
    plans: plans.trim(),
  };
}
