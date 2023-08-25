interface GameGlobals {
    headerBarrierBroken: boolean;
    headerBarrierBottom: number;
    searchBarBottom: number;
    leftBound: number;
    rightBound: number;
    damageBarrier: () => void;
    damageSearchBar: () => void;
    gameWon: boolean;
    gameLost: boolean;
}

let gameGlobals = {
    headerBarrierBroken: false,
    headerBarrierBottom: 0,
    searchBarBottom: 0,
    leftBound: 0,
    rightBound: 0,
    damageBarrier: () => {},
    damageSearchBar: () => {},
    gameWon: false,
    gameLost: false,
}

export function getGameGlobals(): GameGlobals {
    return gameGlobals;
}

export function setGameGlobals(modifiedGlobals: Partial<GameGlobals>) {
    gameGlobals = {
        ...gameGlobals,
        ...modifiedGlobals
    }
}

export const colors = {
    red: '#e03c32',
    yellow: '#ffd301',
    green: '#006b3d'
}