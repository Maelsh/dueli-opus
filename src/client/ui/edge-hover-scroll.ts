/**
 * @file src/client/ui/edge-hover-scroll.ts
 * @description UNIT41.2-P1 (G7): edge-hover auto-scroll for horizontal rails.
 *
 * One shared, direction-aware helper for the Home rails and the recommendation
 * carousel. It binds to the scroller's wrapper, scrolls while the pointer stays
 * in either edge zone, disables scroll-snap during the continuous scroll (so
 * snap cannot fight it), and restores snap on leave.
 *
 * No `Math.random`, no global state: every wrapper is marked so a re-render
 * never stacks a second interval on the same node.
 */

export interface EdgeHoverScrollOptions {
    /** Pixels per frame. Default 8. */
    speed?: number;
    /** Fraction of the wrapper width that counts as an edge zone. Default 0.1. */
    edgeRatio?: number;
    /** Document direction. Default false (LTR). */
    isRTL?: boolean;
}

export interface EdgeHoverScrollHandle {
    destroy(): void;
}

/**
 * Pure direction decision (exported for tests).
 *
 * Returns `+1` when the pointer is on the edge that reveals MORE content
 * (forward), `-1` when it is on the edge that goes BACK, and `0` in the
 * middle. In LTR the overflow end is on the right; in RTL it is on the left.
 */
export function edgeScrollDirection(
    x: number,
    width: number,
    edgeRatio: number,
    isRTL: boolean
): -1 | 0 | 1 {
    if (!(width > 0) || !(edgeRatio > 0)) return 0;
    const edgeZone = width * edgeRatio;
    const inRight = x > width - edgeZone;
    const inLeft = x < edgeZone;
    if (!inRight && !inLeft) return 0;
    const forwardEdge = isRTL ? inLeft : inRight;
    return forwardEdge ? 1 : -1;
}

/**
 * Attach edge-hover auto-scroll to one horizontal scroller.
 *
 * The wrapper is marked (`data-dueli-edge-scroll="1"`) so calling this again
 * on the same wrapper is a no-op — rails re-render their section (a NEW
 * wrapper) and re-call this after every card append without double-binding.
 */
export function attachEdgeHoverScroll(
    scroller: HTMLElement,
    options: EdgeHoverScrollOptions = {}
): EdgeHoverScrollHandle {
    const wrapper = scroller.parentElement;
    if (!wrapper) return { destroy: () => undefined };
    const host: HTMLElement = wrapper;

    if (host.getAttribute('data-dueli-edge-scroll') === '1') {
        return { destroy: () => undefined };
    }
    host.setAttribute('data-dueli-edge-scroll', '1');

    const speed = options.speed ?? 8;
    const edgeRatio = options.edgeRatio ?? 0.1;
    const isRTL = options.isRTL ?? false;

    let interval: ReturnType<typeof setInterval> | null = null;
    let direction: -1 | 0 | 1 = 0;

    function stop(): void {
        if (interval !== null) {
            clearInterval(interval);
            interval = null;
        }
        direction = 0;
        scroller.classList.remove('dueli-auto-scrolling');
    }

    function start(next: -1 | 1): void {
        if (direction === next && interval !== null) return;
        stop();
        direction = next;
        // Disable scroll-snap while auto-scrolling so it cannot fight the
        // continuous scroll; restored on stop.
        scroller.classList.add('dueli-auto-scrolling');
        interval = setInterval(() => {
            // forward (+1) is right in LTR and left in RTL.
            const delta = isRTL ? -next * speed : next * speed;
            scroller.scrollBy({ left: delta });
        }, 16);
    }

    function onMouseMove(event: MouseEvent): void {
        const rect = host.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const next = edgeScrollDirection(x, rect.width, edgeRatio, isRTL);
        if (next === 0) {
            stop();
        } else {
            start(next);
        }
    }

    function onMouseLeave(): void {
        stop();
    }

    wrapper.addEventListener('mousemove', onMouseMove);
    wrapper.addEventListener('mouseleave', onMouseLeave);

    return {
        destroy() {
            stop();
            host.removeEventListener('mousemove', onMouseMove);
            host.removeEventListener('mouseleave', onMouseLeave);
            host.removeAttribute('data-dueli-edge-scroll');
        },
    };
}
