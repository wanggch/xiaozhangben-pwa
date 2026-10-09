let n = 0;
export const uid = () => Date.now().toString(36) + (n++ % 1296).toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);
