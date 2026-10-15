// Only the latest request may publish into a mounted screen.
export function createRequestSequence() {
    let active = 0;
    return {
        begin() {
            const id = ++active;
            return () => id === active;
        },
        invalidate() { active++; },
    };
}
