export const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
export const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** 安全地把对象放进 data-p 属性 */
export const dataP = (o: object) => esc(JSON.stringify(o));
export const raf2 = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));
export const vibrate = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* 不支持 */ } };
