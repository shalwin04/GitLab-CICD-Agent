// graphState.ts

import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

// State of the multi-agent GitLab DevOps system
export const GraphState = Annotation.Root({
  // 🔹 User input from frontend
  userMessage: Annotation<BaseMessage>({
    reducer: (x, y) => y ?? x ?? "",
  }),

  // 🔹 PLAN AGENT output
  plans: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
  }),

  // 🔹 CODE AGENT output
  generatedCode: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
  }),

  // 🔹 TEST AGENT output
  testResults: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
  }),

  // 🔹 CHAT AGENT output from GitLab MCP Server
  finalResult: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
  }),

  // 🔸 Optional: Track which agents were used in what order
  agentTrace: Annotation<string[]>({
    reducer: (x, y) => (x || []).concat(y || []),
    default: () => [],
  }),
});
