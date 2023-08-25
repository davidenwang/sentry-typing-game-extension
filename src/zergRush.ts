import { colors, getGameGlobals, setGameGlobals } from "./gameGlobals";
import { IssueGameObject} from "./gameObject";

function waitForElement<T extends Element>(selector: string): Promise<T> {
    return new Promise(resolve => {
        let elem = document.querySelector<T>(selector);
        if (elem) {
            return resolve(elem);
        }

        const observer = new MutationObserver(mutations => {
            elem = document.querySelector(selector);
            if (elem) {
                resolve(elem);
                observer.disconnect();
            } 
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    })
}

function init() {
    registerKeyPhrase();
}

const KEYPHRASE = 'DESTROY ALL BUGS';
async function registerKeyPhrase() {
    const searchBar = await waitForElement<HTMLTextAreaElement>('#smart-search-input');
    searchBar.addEventListener('input', (event: Event) => {
        if ((event.target as HTMLInputElement).value === KEYPHRASE) {
            executeZergRush();
        }
    });
}

async function executeZergRush() {
    // TODO: need to wait for issue elements to be loaded before executing
    await setGlobalState();
    const trie = generateTrieFromIssueTitles();
    await adaptSearchBarForZergRush(trie);
    window.requestAnimationFrame(gameLoop);
}

const MAX_BARRIER_HEALTHBAR_WIDTH = 600;
const MAX_BARRIER_HEALTH = 100;
let barrierHealth = MAX_BARRIER_HEALTH;

let searchHealthBarElement: HTMLElement | null = null;
const MAX_SEARCH_HEALTH = 200;
let searchBarHealth = MAX_SEARCH_HEALTH;
async function setGlobalState() {
    const issueListHeader = await waitForElement<HTMLElement>('section > div:nth-child(2) > div');
    const issueSearchHeader = await waitForElement<HTMLElement>('section > div');
    issueListHeader.style.opacity = '1';
    issueListHeader.style.transition = 'opacity 1s';
    issueSearchHeader.style.opacity = '1';
    issueSearchHeader.style.transition = 'opacity 1s';

    const {left, right, bottom} = issueListHeader.getBoundingClientRect();
    const {bottom: searchBarBottom} = issueSearchHeader.getBoundingClientRect();

    const healthBarElement = showBarrierHealthBar(issueListHeader);
    const damageBarrier = () => {
        barrierHealth -= 10;
        healthBarElement.style.width = `${Math.floor(MAX_BARRIER_HEALTHBAR_WIDTH * (barrierHealth / MAX_BARRIER_HEALTH))}px`;

        if (barrierHealth <= 0) {
            issueListHeader.style.opacity = '0';
            setGameGlobals({headerBarrierBroken: true});
            searchHealthBarElement = showSearchHealthBar(issueSearchHeader);
        }
        else if (barrierHealth <= 30) {
            healthBarElement.style.backgroundColor = colors.red;
        }
        else if (barrierHealth <= 60) {
            healthBarElement.style.backgroundColor = colors.yellow;
        }
    }

    const damageSearchBar = () => {
        if (!searchHealthBarElement) {
            return;
        }

        searchBarHealth -= 10;
        searchHealthBarElement.style.width = `${Math.floor(MAX_BARRIER_HEALTHBAR_WIDTH * (searchBarHealth / MAX_SEARCH_HEALTH))}px`;

        if (searchBarHealth <= 0) {
            issueSearchHeader.style.opacity = '0';
            setGameGlobals({gameLost: true});
            triggerEnding();
        }
        else if (searchBarHealth <= 40) {
            searchHealthBarElement.style.backgroundColor = colors.red;
        }
        else if (searchBarHealth <= 100) {
            searchHealthBarElement.style.backgroundColor = colors.yellow;
        }
    }

    setGameGlobals({headerBarrierBottom: bottom, leftBound: left, rightBound: right, searchBarBottom, damageBarrier, damageSearchBar})
}

function showBarrierHealthBar(barrierElement: HTMLElement, extraCssText?: string) {
    barrierElement.style.position = 'relative'; 
    const healthBar = document.createElement('div');
    healthBar.style.cssText = `
        width: ${MAX_BARRIER_HEALTHBAR_WIDTH}px;
        height: 30px;
        position: absolute;
        background-color: ${colors.green};

        margin: auto;
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;

        border-radius: 2px;
        z-index: 10000;
        transition: width 0.5s;
        ${extraCssText}
    `;
    barrierElement.appendChild(healthBar);
    return healthBar;
}

function showSearchHealthBar(healthBarElement: HTMLElement) {
    return showBarrierHealthBar(healthBarElement, `
        margin-top: -30px;
    `);
}

type Trie = {
    matched: IssueGameObject[];
    completed: IssueGameObject[];
    [character: string]: Trie | IssueGameObject[];
}

function isTrie(trie: Trie | IssueGameObject[]): trie is Trie {
    return 'matched' in trie;
}

const CASE_INSENSITIVE = true;
const GAME_OBJECTS: IssueGameObject[] = [];
let num_destroyed = 0;
/**
 * Fetches all issue titles to be used a text elements for the typing game
 * Returns a trie-like data structure that may look like
 * Also populates the set of game objects to be moved forward
 * {
 *  v: {
 *   matched: [div, div, div]
 *   completed: []
 *   a: {...}
 *  }
 * }
 */
function generateTrieFromIssueTitles() {
    const issueHeaderDivs = document.querySelectorAll<HTMLElement>("div[data-test-id='event-issue-header']");
    const trie: Trie = {matched: [], completed: []};
    issueHeaderDivs.forEach((header, index) => {
        const groupTitle = header.querySelector<HTMLElement>('div > a > span:nth-child(2) > span');
        if (groupTitle) {
            hideEverythingButGroupTitle(header, groupTitle);
            const issueGameObject = new IssueGameObject(groupTitle, index);
            GAME_OBJECTS.push(issueGameObject);
            const groupTitleStr = groupTitle.innerText;
            let trieTraverser = trie;
            for (let i = 0; i < groupTitleStr.length; i++) {
                const isLastChar = i === groupTitleStr.length - 1;
                const character = CASE_INSENSITIVE ? groupTitleStr.charAt(i).toLowerCase() : groupTitleStr.charAt(i);

                const traversal = trieTraverser[character];
                if (traversal && isTrie(traversal)) {
                    traversal.matched.push(issueGameObject);
                    if (isLastChar) {
                        traversal.completed.push(issueGameObject);
                    }
                } else {
                    trieTraverser[character] = {matched: [issueGameObject], completed: isLastChar ? [issueGameObject] : []}
                }
                trieTraverser = trieTraverser[character] as Trie;
            }
        }
    });
    return trie;
}

function hideEverythingButGroupTitle(header: HTMLElement, groupTitle: HTMLElement) {
    const hideNodes = (node: ChildNode) => {
        if (!node.contains(groupTitle) && node instanceof HTMLElement) {
            node.style.visibility = 'hidden';
        }
    }
    header.childNodes.forEach(hideNodes);
    header.parentNode?.childNodes.forEach(hideNodes);
    groupTitle.parentNode?.childNodes.forEach(hideNodes);
}

let simplifiedSearchBar: HTMLTextAreaElement | null = null;
async function adaptSearchBarForZergRush(trie: Trie) {
    const searchBar = await waitForElement<HTMLTextAreaElement>('#smart-search-input');
    searchBar.value = '';
    searchBar.style.color = 'black';
    searchBar.placeholder = 'DESTROY THEM ALL!';

    const searchBarDropdown = await waitForElement<HTMLElement>("div[data-test-id='smart-search-dropdown']");
    searchBarDropdown.style.visibility = 'hidden';

    simplifiedSearchBar = searchBar.cloneNode(true) as HTMLTextAreaElement;
    if (!simplifiedSearchBar || !(simplifiedSearchBar instanceof HTMLTextAreaElement)) {
        throw new Error('Expected cloned search bar to be instance of HTMLTextArea');
    }

    searchBar.parentNode?.replaceChild(simplifiedSearchBar, searchBar);
    simplifiedSearchBar.focus();

    simplifiedSearchBar.addEventListener('input', generateSearchInputHandler(trie));
}

const strikedGameObjects: IssueGameObject[] = [];
/**
 * Handles 'zapping' away errors when search bar changes
 */
function generateSearchInputHandler(trie: Trie) {
    return (event: Event) => {
        const value = (event.target as HTMLInputElement).value.trim();
        let mistyped = false;
        // traverse trie
        let currTrieLayer = trie;
        for(let i = 0; i < value.length; i++) {
            const character = CASE_INSENSITIVE ? value.charAt(i).toLowerCase() : value.charAt(i);
            const nextLayer = currTrieLayer[character] as Trie;
            if (!nextLayer) {
                mistyped = true;
                break;
            }
            currTrieLayer = nextLayer;
        }
        if (currTrieLayer) {
            // highlight all matched
            strikedGameObjects.forEach(gameObject => {
                if (!currTrieLayer.matched.includes(gameObject)) {
                    gameObject.resetStrikethrough();
                }
            });
            currTrieLayer.matched.forEach(gameObject => {
                gameObject.strikethrough(value.length, mistyped);
                strikedGameObjects.push(gameObject);
            });
            currTrieLayer.completed.forEach(gameObject => {
                gameObject.destroy();
                num_destroyed++;
                if (num_destroyed === GAME_OBJECTS.length) {
                    setGameGlobals({gameWon: true});
                    triggerEnding();
                }
                if (simplifiedSearchBar) {
                    simplifiedSearchBar.value = '';
                }
            })
        }
    }
}

async function triggerEnding() {
    const {gameWon} = getGameGlobals();
    // fade body
    const body = await waitForElement<HTMLElement>('body');
    // body.style.transition = 'opacity 2s';
    // body.style.opacity = '0.5';
    // add overlay text
    const endingMessage = document.createElement('div');
    endingMessage.textContent = gameWon ? 'YOU HAVE DEFENDED THE ISSUES STREAM!' : 'THE BUGS HAVE TAKEN OVER!';
    endingMessage.style.cssText = `
        position: fixed;
        color: ${gameWon ? colors.green : colors.red};

        opacity: 0;
        background-color: rgba(255, 255, 255, 0.5);
        left: 0;
        right: 0;
        bottom: 0;
        top: 0;
        text-align: center;
        padding-top: 50vh;

        font-size: 36px;
        text-decoration: bold;

        z-index: 10000;
        transition: opacity 5s;
    `;
    body.prepend(endingMessage);
    window.requestAnimationFrame(() =>
        setTimeout(() => {
            endingMessage.style.opacity = '1';
        })
    );
}

function gameLoop(timestamp: DOMHighResTimeStamp) {
    // GAME_OBJECTS[2].step(timestamp);
    GAME_OBJECTS.forEach(gameObject => {
        gameObject.step(timestamp);
    });
    window.requestAnimationFrame(gameLoop);
}

init();

/*
Top Level Objectives:
[*] Create Game Object Class 
    [*] Subtle gooey animation 
    [*] Destruction animation
    [] Movement to left and right
[*] Additional Game Objects (issue sub header)
[*] Introduce barrier (issue header), brick/shield texture?
[] Introduce losing when issue search bar is consumed
[] Create icon and publish
*/
