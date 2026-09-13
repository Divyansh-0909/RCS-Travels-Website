from collections import deque

nodes = list("ABCDEFGHIJKL")
edges = [
    ("A", "B"), ("B", "C"), ("C", "D"),
    ("E", "F"), ("F", "G"), ("G", "H"),
    ("I", "J"), ("J", "K"), ("K", "L"),
    ("A", "E"), ("E", "I"), ("B", "F"),
    ("F", "J"), ("C", "G"), ("G", "K"),
    ("D", "H"), ("H", "L")
]
graph = {node: [] for node in nodes}

for left, right in edges:
    graph[left].append(right)
    graph[right].append(left)

def search(start, goal, take, order):
    frontier = deque([[start]])
    visited = {start}
    while frontier:
        path = take(frontier)
        node = path[-1]
        if node == goal:
            return path
        for neighbor in order(graph[node]):
            if neighbor not in visited:
                visited.add(neighbor)
                frontier.append(path + [neighbor])

def dfs(start, goal):
    return search(start, goal, deque.pop, reversed)

def bfs(start, goal):
    return search(start, goal, deque.popleft, iter)

def expand(path):
    return [path + [neighbor] for neighbor in graph[path[-1]] if neighbor not in path]

def dls(start, goal, limit):
    stack = [[start]]
    while stack:
        path = stack.pop()
        if path[-1] == goal:
            return path
        if len(path) <= limit:
            stack.extend(reversed(expand(path)))
    return []

def iddfs(start, goal):
    for limit in range(len(nodes)):
        path = dls(start, goal, limit)
        if path:
            return path

start = "A"
goal = "L"
limit = 5

print("DFS :", " -> ".join(dfs(start, goal)))
print("BFS :", " -> ".join(bfs(start, goal)))
print("DLS :", " -> ".join(dls(start, goal, limit)))
print("ID  :", " -> ".join(iddfs(start, goal)))
