"""Wire the guardrail graph:

guard_input -> retrieve_manual -> maker -> judge -> rule_check -> decide
decide: approve -> END | rewrite -> maker | fallback -> fallback -> END
"""

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.graph import nodes
from app.graph.state import ChatState


def build_graph() -> CompiledStateGraph:
    g = StateGraph(ChatState)
    g.add_node("guard_input", nodes.guard_input)
    g.add_node("retrieve_manual", nodes.retrieve_manual)
    g.add_node("maker", nodes.maker)
    g.add_node("judge", nodes.judge)
    g.add_node("rule_check", nodes.rule_check)
    g.add_node("decide", nodes.decide)
    g.add_node("fallback", nodes.fallback)

    g.add_edge(START, "guard_input")
    g.add_edge("guard_input", "retrieve_manual")
    g.add_edge("retrieve_manual", "maker")
    g.add_edge("maker", "judge")
    g.add_edge("judge", "rule_check")
    g.add_edge("rule_check", "decide")
    g.add_conditional_edges("decide", lambda s: s["next"],
                            {"approve": END, "rewrite": "maker", "fallback": "fallback"})
    g.add_edge("fallback", END)
    return g.compile()


GRAPH = build_graph()
