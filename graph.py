from graphviz import Digraph

# Create architecture diagram for the self-improving AutoCritic agent
dot = Digraph(comment='AutoCritic: Self-Improving Coding Agent Architecture')

# User interaction
dot.node('A', 'Code Input (UI)', shape='box')
dot.node('B', 'Submit Code for Critique', shape='box')

# LLM Processing
dot.node('C', 'LangChain Agent (Critique Generator)', shape='ellipse')
dot.node('D', 'Local LLM (Ollama)', shape='ellipse')

# Feedback
dot.node('E', 'Feedback Panel (Accept / Reject / Edit)', shape='box')
dot.node('F', 'User Feedback Logger', shape='box')

# Memory
dot.node('G', 'Embedding Store (FAISS/Chroma)', shape='cylinder')
dot.node('H', 'Critique History & User Pattern DB', shape='cylinder')

# Learning loop
dot.node('I', 'Prompt Modifier / Tuner (Meta-Agent)', shape='diamond')

# Flow
dot.edges(['AB', 'BC', 'CD', 'CE', 'EF', 'FG', 'FH'])
dot.edge('G', 'C', label='Similar Past Critiques')
dot.edge('H', 'I', label='Analyze Usage Logs')
dot.edge('I', 'C', label='Update Prompt Strategy')

# Render the diagram
dot.render('/mnt/data/autocritic_architecture', format='png', cleanup=False)
'/mnt/data/autocritic_architecture.png'