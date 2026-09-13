from heapq import heappop, heappush

nodes = list("ABCDEFGHIJKL")
weighted_edges = [
    ("A", "B", 6), ("B", "C", 6), ("C", "D", 6),
    ("E", "F", 3), ("F", "G", 3), ("G", "H", 3),
    ("I", "J", 1), ("J", "K", 1), ("K", "L", 1),
    ("A", "E", 1), ("E", "I", 1), ("B", "F", 3),
    ("F", "J", 3), ("C", "G", 3), ("G", "K", 3),
    ("D", "H", 3), ("H", "L", 3)
]
heuristic = {
    "A": 5, "B": 4, "C": 3, "D": 2,
    "E": 4, "F": 3, "G": 2, "H": 1,
    "I": 3, "J": 2, "K": 1, "L": 0
}
graph = {node: [] for node in nodes}

for left, right, cost in weighted_edges:
    graph[left].append((right, cost))
    graph[right].append((left, cost))

def greedy(start, goal):
    frontier = [(heuristic[start], start, [start], 0)]
    visited = set()
    while frontier:
        _, node, path, cost = heappop(frontier)
        if node == goal:
            return path, cost
        if node not in visited:
            visited.add(node)
            for neighbor, edge_cost in graph[node]:
                if neighbor not in visited:
                    heappush(frontier, (heuristic[neighbor], neighbor, path + [neighbor], cost + edge_cost))

path, cost = greedy("A", "L")
print("Greedy path:", " -> ".join(path))
print("Travel time:", cost)
