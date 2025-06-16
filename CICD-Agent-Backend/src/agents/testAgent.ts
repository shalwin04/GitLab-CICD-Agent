// testAgent.ts
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

const testPrompt = ChatPromptTemplate.fromTemplate(`
You are a DevOps code reviewer.

Here is the code:
"{generatedCode}"

Evaluate it for correctness, syntax issues, and logical consistency.
If everything looks good, say "Test Passed". Otherwise, explain any problems briefly.
`);

export async function TestAgent(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log("---TEST AGENT---");

  const prompt = await testPrompt.format({
    generatedCode: state.generatedCode,
  });

  const testResults = await model.pipe(new StringOutputParser()).invoke(prompt);

  return {
    testResults: testResults.trim(),
  };
}
