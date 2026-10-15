import type { SourceRef } from '../contracts.ts';

function visitRefs(value: object, visit: (owner: object, refs: SourceRef[]) => void): void {
  for (const [key, child] of Object.entries(value)) {
    if (key === 'refs' && Array.isArray(child)) visit(value, child as SourceRef[]);
    else if (typeof child === 'object' && child !== null) visitRefs(child, visit);
  }
}

export function sourceRefs(value: object): SourceRef[] {
  const result: SourceRef[] = [];
  visitRefs(value, (_owner, refs) => result.push(...refs));
  return result;
}

export function mapSourceRefs<T extends object>(value: T, replace: (refs: SourceRef[]) => SourceRef[]): T {
  const result = structuredClone(value);
  visitRefs(result, (owner, refs) => Object.assign(owner, { refs: replace(refs) }));
  return result;
}
