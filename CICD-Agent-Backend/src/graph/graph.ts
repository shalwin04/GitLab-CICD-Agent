// In graph.js
import { END, START, StateGraph } from "@langchain/langgraph";
import { GraphState } from "./graphState.js";
import { supervisorAgent } from "../agents/supervisorAgent.js";
import { createChatAgentNode } from "../agents/chatAgent.js";

// Factory function to create the graph with a specific GitLab token from OAuth
export const createDevopsGraph = (gitlabToken: string) => {
  console.log(`🔧 Creating DevOps graph with GitLab token`);

  // Create chat agent node with the OAuth token
  const chatAgentNode = createChatAgentNode(gitlabToken);

  return new StateGraph(GraphState)
    .addNode("supervisor", supervisorAgent.nodes.supervisor)
    .addNode("plan", supervisorAgent.nodes.plan)
    .addNode("code", supervisorAgent.nodes.code)
    .addNode("test", supervisorAgent.nodes.test)
    .addNode("chat", chatAgentNode) // This node now has access to the OAuth token
    .addEdge(START, "supervisor")
    .addConditionalEdges(
      "supervisor",
      (state: typeof GraphState.State) =>
        supervisorAgent.decideNextAgent(state),
      {
        plan: "plan",
        code: "code",
        test: "test",
        chat: "chat",
        end: END,
      }
    )
    .addEdge("plan", "supervisor")
    .addEdge("code", "supervisor")
    .addEdge("test", "supervisor")
    .addEdge("chat", "supervisor");
};

// Note: No default export since we always need a token from OAuth
// Each request creates a new graph instance with the session's token
