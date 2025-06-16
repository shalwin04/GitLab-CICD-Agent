// codeAgent.ts
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

const codePrompt = ChatPromptTemplate.fromTemplate(`
You are a DevOps coding agent.

Given this plan:
"{plans}"

Generate the GitLab CI/CD YAML or shell script required to implement this.
Respond ONLY with the code or script in a single block.
`);

export async function CodeAgent(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log("---CODE AGENT---");

  const prompt = await codePrompt.format({
    plans: state.plans,
  });

  const generatedCode = await model
    .pipe(new StringOutputParser())
    .invoke(prompt);

  return {
    generatedCode: generatedCode.trim(),
  };
}
