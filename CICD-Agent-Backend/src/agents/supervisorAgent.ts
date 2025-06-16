import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PlanAgent } from "./planAgent.js";
import { CodeAgent } from "./codeAgent.js";
import { TestAgent } from "./testAgent.js";
import { GraphState } from "../graph/graphState.js";
import dotenv from "dotenv";

dotenv.config();

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  apiKey: process.env.GEMINI_API_KEY!,
});

// Prompt template for reasoning which agents to call
const supervisorPrompt = ChatPromptTemplate.fromTemplate(`
You are a DevOps supervisor agent. You coordinate the following agents to complete tasks:
- PlanAgent: Creates a step-by-step strategy for the user's request.
- CodeAgent: Writes code for DevOps tasks (scripts, pipelines, etc.)
- TestAgent: Validates or simulates code before execution.
- ChatAgent: Connects with GitLab MCP server to execute the final actions.

Here is the user's request:
"{userMessage}"

Here is the current state:
- Plan: "{plans}"
- Code: "{generatedCode}"
- Test Results: "{testResults}"
- Final Result: "{finalResult}"

Decision Logic:
1. For simple direct queries that can be executed immediately (like "list my projects", "show repositories", "get file contents"), go to "chat"
2. For complex tasks that need planning, follow this sequence:
   - If no plan exists, go to "plan"
   - If plan exists but no code, go to "code"
   - If code exists but no test results, go to "test"
   - If plan, code, and tests exist but no final result, go to "chat"
3. If everything is complete, go to "end"

Which agent should be called next? Answer with ONE of:
- "plan"
- "code"
- "test"
- "chat"
- "end"

ONLY respond with one of the above values. Do not explain.
`);

const decideNextAgent = async (state: typeof GraphState.State) => {
  const prompt = await supervisorPrompt.format({
    userMessage: state.userMessage || "",
    plans: state.plans || "",
    generatedCode: state.generatedCode || "",
    testResults: state.testResults || "",
    finalResult: state.finalResult || "",
  });

  const response = await model.pipe(new StringOutputParser()).invoke(prompt);

  const nextAgent = response.trim().toLowerCase();
  console.log("Supervisor chose agent:", nextAgent);
  return nextAgent;
};

// Node functions that return state updates
const planNode = async (
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> => {
  console.log("🔄 Plan node executing...");
  const result = await PlanAgent(state);
  return {
    plans: result.plans,
    agentTrace: [...(state.agentTrace || []), "plan"],
  };
};

const codeNode = async (
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> => {
  console.log("🔄 Code node executing...");
  const result = await CodeAgent(state);
  return {
    generatedCode: result.generatedCode,
    agentTrace: [...(state.agentTrace || []), "code"],
  };
};

const testNode = async (
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> => {
  console.log("🔄 Test node executing...");
  const result = await TestAgent(state);
  return {
    testResults: result.testResults,
    agentTrace: [...(state.agentTrace || []), "test"],
  };
};

// Supervisor node that returns state updates instead of just the decision
const supervisorNode = async (
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> => {
  console.log("🔄 Supervisor node executing...");

  // Add supervisor to the trace
  const updatedTrace = [...(state.agentTrace || []), "supervisor"];

  // Just return the trace update - the routing will be handled by the conditional edges
  return {
    agentTrace: updatedTrace,
  };
};

// Export the supervisor agent structure
export const supervisorAgent = {
  decideNextAgent,
  nodes: {
    supervisor: supervisorNode, // Use the node version that returns state
    plan: planNode,
    code: codeNode,
    test: testNode,
  },
};
