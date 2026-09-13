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
matrix = [[0 for _ in nodes] for _ in nodes]
index = {node: i for i, node in enumerate(nodes)}

for left, right, cost in weighted_edges:
    i = index[left]
    j = index[right]
    matrix[i][j] = cost
    matrix[j][i] = cost

print("Weighted adjacency matrix")
print("  " + " ".join(nodes))
for node, row in zip(nodes, matrix):
    print(node, *row)

print("\nHeuristic values")
for node in nodes:
    print(node, heuristic[node])
