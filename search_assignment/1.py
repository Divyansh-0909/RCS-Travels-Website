nodes = list("ABCDEFGHIJKL")
edges = [
    ("A", "B"), ("B", "C"), ("C", "D"),
    ("E", "F"), ("F", "G"), ("G", "H"),
    ("I", "J"), ("J", "K"), ("K", "L"),
    ("A", "E"), ("E", "I"), ("B", "F"),
    ("F", "J"), ("C", "G"), ("G", "K"),
    ("D", "H"), ("H", "L")
]

matrix = [[0 for _ in nodes] for _ in nodes]
index = {node: i for i, node in enumerate(nodes)}

for left, right in edges:
    i = index[left]
    j = index[right]
    matrix[i][j] = 1
    matrix[j][i] = 1

print("Problem graph")
print("A---B---C---D")
print("|   |   |   |")
print("E---F---G---H")
print("|   |   |   |")
print("I---J---K---L")
print("Start: A    Goal: L")
print("\nAdjacency matrix")
print("  " + " ".join(nodes))
for node, row in zip(nodes, matrix):
    print(node, *row)
