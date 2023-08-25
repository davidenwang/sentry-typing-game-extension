import { colors, getGameGlobals } from "./gameGlobals";

enum ObjectState {
    MOVING,
    ATTACKING_WINDUP,
    ATTACKING,
    BEING_DESTROYED,
}

/**
 * Based on the index of the issue in the issue list scale the speed with the given modifier
 */
const SPEED_INDEX_RANGES: Record<number, [number, number]> = {
    0: [2, 0],
    2: [5, 5],
    6: [10, 5],
    9: [20, 5],
}

export class IssueGameObject {
    domNode: HTMLElement;
    nodeText: string;
    startTime: DOMHighResTimeStamp | null;
    lastTimestamp: DOMHighResTimeStamp | null;
    /**
     * In pixels per second
     */
    ySpeed: number;
    xSpeed: number;
    /**
     * In frequency of finishing the animation e.g. 1 per second
     */
    scaleSpeed: number;
    originalY: number;
    originalX: number;
    width: number;
    traveledDistanceY: number;
    traveledDistanceX: number;
    state: ObjectState;
    timeOffset: number;

    constructor(domNode: HTMLElement, index: number) {
        this.domNode = domNode;
        this.nodeText = this.getDomText();
        this.state = ObjectState.MOVING;
        this.bugifyNode();

        this.timeOffset = Math.random() * 10;

        this.startTime = null;
        this.lastTimestamp = null;

        // Default to max speed and downscale based on index
        const [maxBaseSpeed, maxModifier] = Object.values(SPEED_INDEX_RANGES).slice(-1)[0];
        this.ySpeed = Math.round(Math.random() * maxModifier) + maxBaseSpeed;
        Object.entries(SPEED_INDEX_RANGES).every(([speedIndex, [base, modifier]]) => {
            if (index <= parseInt(speedIndex)) {
                this.ySpeed = Math.round(Math.random() * modifier) + base;
                return false;
            }
            return true;
        });
        this.xSpeed = (Math.random() * 10 - 5);

        const {top, left, right} = domNode.getBoundingClientRect();
        this.traveledDistanceY = 0;
        this.traveledDistanceX = 0;
        this.originalY = top;
        this.originalX = left;
        this.width = right - left;

        this.scaleSpeed = 0.5;
    }

    bugifyNode() {
        this.domNode.style.position = 'absolute';
        this.domNode.style.backgroundColor = 'white';
        this.domNode.style.height = 'inherit';
        this.domNode.style.opacity = '1';
        this.domNode.style.transition = 'opacity 1s';
    }

    step(timestamp: DOMHighResTimeStamp) {
        if (!this.startTime || !this.lastTimestamp) {
            this.startTime = timestamp;
            this.lastTimestamp = timestamp;
        }

        // Don't animate the objects if they're already off screen
        if (this.domNode.getBoundingClientRect().bottom < 0 || this.state === ObjectState.BEING_DESTROYED) {
            return;
        }

        const elapsedSinceLastLoop = (timestamp - this.lastTimestamp) / 1000;
        const diffInSeconds = (timestamp - this.startTime) / 1000;
        const animationDiff = diffInSeconds + this.timeOffset;

        this.domNode.style.transform = `${this.stepMoveAnimation(elapsedSinceLastLoop)} ${this.stepJitterAnimation(animationDiff)} ${this.stepScaleAnimation(animationDiff)}`;
        this.lastTimestamp = timestamp;
    }

    isAttacking() {
        return this.state === ObjectState.ATTACKING || this.state === ObjectState.ATTACKING_WINDUP;
    }

    stepMoveAnimation(elapsedSinceLastLoop: number) {
        const {headerBarrierBroken, headerBarrierBottom, searchBarBottom, leftBound, rightBound, gameLost, damageBarrier, damageSearchBar} = getGameGlobals();

        if (!this.isAttacking() && !headerBarrierBroken && this.originalY - this.traveledDistanceY < headerBarrierBottom) {
            damageBarrier();
            this.state = ObjectState.ATTACKING_WINDUP;
        } else if (!this.isAttacking() && headerBarrierBroken && !gameLost && this.originalY - this.traveledDistanceY < searchBarBottom) {
            damageSearchBar();
            this.state = ObjectState.ATTACKING_WINDUP;
        }


        if (this.isAttacking()) {
            return this.stepAttackAnimation(elapsedSinceLastLoop);
        } else {
            this.traveledDistanceY += elapsedSinceLastLoop * this.ySpeed;
            this.traveledDistanceX += elapsedSinceLastLoop * this.xSpeed;
            if (this.originalX + this.traveledDistanceX + this.width >= rightBound || this.originalX + this.traveledDistanceX <= leftBound) {
                this.xSpeed *= -1;
            }
            return `translateY(${-1 * Math.round(this.traveledDistanceY)}px) translateX(${Math.round(this.traveledDistanceX)}px)`;
        }
    }

    stepAttackAnimation(elapsedSinceLastLoop: number) {
        const maxDistanceFromBarrier = 15;
        const windupSpeed = 10;
        const attackSpeed = 80;
        const {headerBarrierBottom, searchBarBottom, headerBarrierBroken} = getGameGlobals();
        const bottomBound = headerBarrierBroken ? searchBarBottom : headerBarrierBottom;

        if (this.state === ObjectState.ATTACKING_WINDUP) {
            this.traveledDistanceY -= windupSpeed * elapsedSinceLastLoop;
            if (this.originalY - this.traveledDistanceY > bottomBound + maxDistanceFromBarrier) {
                this.state = ObjectState.ATTACKING;
            }
        } else {
            this.traveledDistanceY += attackSpeed * elapsedSinceLastLoop;
            if (this.originalY - this.traveledDistanceY < bottomBound) {
                this.state = ObjectState.MOVING;
            }
        }

        return `translateY(${-1 * Math.round(this.traveledDistanceY)}px) translateX(${this.traveledDistanceX}px)`;
    }

    stepScaleAnimation(elapsedSeconds: number) {
        // TODO: base this modifier off the length of the word
        const scaleModifier = 0.05;
        const theta = (elapsedSeconds * this.scaleSpeed * 2 * Math.PI) % (2 * Math.PI);
        const xScale = 1 + scaleModifier * Math.sin(theta);
        const yScale = 1 + scaleModifier * Math.sin(theta + Math.PI);
        return `scale(${xScale}, ${yScale})`;
    }

    stepJitterAnimation(elapsedSeconds: number) {
        const jittersPerSecond = 15;
        const jitterFrequency = 2;
        const jitterLength = 0.5;

        const shouldJitterBasedOnTime = Math.floor(elapsedSeconds) % jitterFrequency === 0 && elapsedSeconds - Math.floor(elapsedSeconds) < jitterLength;
        const shouldJitter = this.state === ObjectState.ATTACKING || (shouldJitterBasedOnTime && this.state !== ObjectState.ATTACKING_WINDUP);
        if (shouldJitter) {
            const jitterProgress = Math.floor((elapsedSeconds - Math.floor(elapsedSeconds)) * jittersPerSecond)
            if (jitterProgress % 2 === 0) {
                return 'rotate(2deg)';
            } else {
                return 'rotate(-2deg)';
            }
        }
        return '';
    }

    getDomText() {
        const text: string[] = [];
        this.domNode.childNodes.forEach(child => text.push(child.textContent ?? ''));
        return text.join('');
    }

    resetStrikethrough() {
        const spanText = this.getDomText();
        this.domNode.textContent = spanText;
    }

    strikethrough(length: number, mistyped: boolean) {
        const spanText = this.nodeText;
        const strikedText = spanText.slice(0, length);
        const regularText = spanText.slice(length);

        const regularNode = document.createElement("span");
        regularNode.textContent = regularText.trim();
        const strikedNode = document.createElement("s");
        strikedNode.textContent = strikedText.trim();

        this.domNode.textContent = '';
        this.domNode.appendChild(strikedNode);
        if (strikedText.charAt(strikedText.length - 1) === ' ' || regularText.charAt(0) === ' ') {
            this.domNode.appendChild(document.createTextNode("\u00A0"));
        }
        this.domNode.appendChild(regularNode);

        this.domNode.style.color = mistyped ? colors.red : 'inherit';
    }

    destroy() {
        this.state = ObjectState.BEING_DESTROYED;
        this.domNode.style.opacity = '0';
    }
}