// GENERADO por scripts/daemon-sprite.py — no editar a mano: cambiá el generador y corré
//   python3 scripts/daemon-sprite.py --ts lib/daemon-art.ts

export const SIZE = 40 as const;

export const PALETTE = {
  "o": "#161830",
  "h": "#ced2ff",
  "b": "#969df5",
  "s": "#6c72d6",
  "d": "#4c50a8",
  "H": "#fff3d2",
  "C": "#eccd94",
  "c": "#b8925c",
  "k": "#101226",
  "w": "#ffffff",
  "m": "#30142e",
  "t": "#ff7a8a",
  "p": "#ffa0b9",
  "y": "#f1e15b",
  "Y": "#fffac8",
  "r": "#ff6b5e",
  "a": "#5fd6c6",
  "f": "#ffb340",
  "l": "#a7acff",
  "L": "#e6e8ff",
  "B": "#78beff"
} as const;

export const BASE = [
  "......oo........................oo......",
  ".....oHHo......................oHHo.....",
  ".....oHco......................oHco.....",
  ".....oHco......................oHco.....",
  ".....oHCHo....................oHCco.....",
  ".....oHCco....................oHCco.....",
  ".....oHCCHoo................ooHCCco.....",
  ".....oHCCCHHo..............oHHCCCco.....",
  "......oHCCCCHoo..........ooHCCCCco......",
  "......oHCCCCCHHooooooooooHHCCCCCco......",
  ".......oHCCCCCcbhhhbbbbbbHCCCCCco.......",
  ".......oHCCCchhhhhhhhbbbbbsHCCCco.......",
  "........oHCcwwhhhhhhhhbbbbbsHCco........",
  ".........oHwwhhhhhhhhhbbbbbbsHo.........",
  ".........ohwhhhhhhhhhhbbbbbbsso.........",
  "........ohhhhhhhhhhhhhbbbbbbssso........",
  ".......obhhhhhhhhhhhhhbbbbbbsssdo...o...",
  ".......obhhhhhhhhhhhhbbbbbbbsssdo..oso..",
  ".......obhhhhhhhhhhhbbbbbbbbsssdo.ossso.",
  "......obbhhhhhhhhhhhbbbbbbbbsssddossssso",
  "......obbhhhhhhhhhbbbbbbbbbssssddossssso",
  "......obbbhhhhhhbbbbbbbbbbssssdddoooooo.",
  ".....osbbbbbbbbbbbbbbbbbbbssssdddsooso..",
  "....ossbbbbbbbbbbbbbbbbbbssssddddssosso.",
  "....osssbbbbbbbbbbbbbbbbsssssdddsssosso.",
  "....osssbbbbbbbbbbbbbbssssssddddsssosso.",
  "....ossssbbbbbbbbbbbbssssssdddddsssosso.",
  "....ossssssbbbbbbbsssssssddddddssssosso.",
  ".....ossoossssssssssssssddddddoossosso..",
  "......oo..osssssssssssdddddddooooossso..",
  "...........odssssssdddddddddossssssso...",
  "............oddddddddddddddoossssooo....",
  "............ossddddddddddsso.oooo.......",
  "...........osssssoooooossssso...........",
  "..........odddddddo..odddddddo..........",
  "..........odddddddo..odddddddo..........",
  "...........oodddoo....oodddoo...........",
  ".............ooo........ooo.............",
  "........................................",
  "........................................"
] as const;

export const BASE_MELT = [
  "......oo........................oo......",
  ".....oHHo......................oHHo.....",
  ".....oHco......................oHco.....",
  ".....oHco......................oHco.....",
  ".....oHCHo....................oHCco.....",
  ".....oHCco....................oHCco.....",
  ".....oHCCHoo................ooHCCco.....",
  ".....oHCCCHHo..............oHHCCCco.....",
  "......oHCCCCHoo..........ooHCCCCco......",
  "......oHCCCCCHHooooooooooHHCCCCCco......",
  ".......oHCCCCCcbhhhbbbbbbHCCCCCco.......",
  ".......oHCCCchhhhhhhhbbbbbsHCCCco.......",
  "........oHCcwwhhhhhhhhbbbbbsHCco........",
  ".........oHwwhhhhhhhhhbbbbbbsHo.........",
  ".........ohwhhhhhhhhhhbbbbbbsso.........",
  "........ohhhhhhhhhhhhhbbbbbbssso........",
  ".......obhhhhhhhhhhhhhbbbbbbsssdo...o...",
  ".......obhhhhhhhhhhhhbbbbbbbsssdo..oso..",
  ".......obhhhhhhhhhhhbbbbbbbbsssdo.ossso.",
  "......obbhhhhhhhhhhhbbbbbbbbsssddossssso",
  "......obbhhhhhhhhhbbbbbbbbbssssddossssso",
  "......obbbhhhhhhbbbbbbbbbbssssdddoooooo.",
  ".....osbbbbbbbbbbbbbbbbbbbssssdddsooso..",
  "....ossbbbbbbbbbbbbbbbbbbssssddddssosso.",
  "....osssbbbbbbbbbbbbbbbbsssssdddsssosso.",
  "....osssbbbbbbbbbbbbbbssssssddddsssosso.",
  "....ossssbbbbbbbbbbbbssssssdddddsssosso.",
  "....ossssssbbbbbbbsssssssddddddssssosso.",
  ".....ossoossssssssssssssddddddosssosso..",
  "......oo..osssssssssssdddddddoossossso..",
  "..........osdssssssdddddddddossssssso...",
  "..........ossddddddddddddddoossssooo....",
  "..........ossssddddddddddssssooso.......",
  "..........ossssssssoooosssssso.o........",
  "..........oddddddddo.odddddddo..........",
  "..........oddddddddo.odddddddo..........",
  "...........oodddodo...ooddddo...........",
  ".............ooo.o......oooo............",
  "........................................",
  "........................................"
] as const;

export const EYES = {
  "open": [
    ".kkk.",
    "kkkkk",
    "kwwkk",
    "kwkkk",
    "kkkkk",
    ".kkk."
  ],
  "blink": [
    ".....",
    ".....",
    ".....",
    "kkkkk",
    ".kkk.",
    "....."
  ],
  "happy": [
    ".....",
    ".kkk.",
    "k...k",
    "k...k",
    ".....",
    "....."
  ],
  "sleep": [
    ".....",
    ".....",
    "k...k",
    ".kkk.",
    ".....",
    "....."
  ],
  "tired": [
    ".....",
    "ddddd",
    "ooooo",
    "kwwkk",
    "kkkkk",
    ".kkk."
  ],
  "x": [
    "k...k",
    ".k.k.",
    "..k..",
    ".k.k.",
    "k...k",
    "....."
  ],
  "wide": [
    ".kkk.",
    "kwwwk",
    "kwkwk",
    "kwwwk",
    ".kkk.",
    "....."
  ],
  "side": [
    ".kkk.",
    "kkkkk",
    "kkwwk",
    "kkkwk",
    "kkkkk",
    ".kkk."
  ]
} as const;

export const MOUTHS = {
  "smile": [
    "m.....m",
    ".m...m.",
    "..mmm.."
  ],
  "grin": [
    "mmmmmmm",
    ".mtttm.",
    "..mmm.."
  ],
  "flat": [
    ".......",
    ".mmmmm.",
    "......."
  ],
  "yawn": [
    "..mmm..",
    ".mtttm.",
    "..mmm.."
  ],
  "wavy": [
    ".......",
    "m.m.m.m",
    ".m.m.m."
  ],
  "chew": [
    ".......",
    "..mmm..",
    "..mmm.."
  ],
  "cat": [
    ".......",
    "m..m..m",
    ".mm.mm."
  ]
} as const;

export const ACCESSORIES = {
  "sparkle": {
    "x": 31,
    "y": 2,
    "rows": [
      "...y...",
      "...y...",
      "..yYy..",
      "yyYYYyy",
      "..yYy..",
      "...y...",
      "...y..."
    ]
  },
  "stars": {
    "x": 30,
    "y": 1,
    "rows": [
      "..y.....",
      ".yYy....",
      "..y..y..",
      ".....Yy.",
      "....yYYy",
      ".....yy.",
      "........"
    ]
  },
  "zz": {
    "x": 28,
    "y": 0,
    "rows": [
      "......LLLL",
      ".........L",
      "........L.",
      ".......L..",
      "......LLLL",
      "LLL.......",
      "..L.......",
      ".L........",
      "LLL......."
    ]
  },
  "dots": {
    "x": 30,
    "y": 1,
    "rows": [
      "aaaaaaa",
      "aLLLLLa",
      "aaaaaaa",
      "aLaLaLa",
      "aaaaaaa",
      "aLaLaLa",
      "aaaaaaa"
    ]
  },
  "steam": {
    "x": 14,
    "y": 0,
    "rows": [
      ".r....r....",
      "r....r....r",
      ".r....r...r",
      "..r....r...",
      ".r....r....",
      "r....r....."
    ]
  },
  "moon": {
    "x": 31,
    "y": 1,
    "rows": [
      "..LLLL.",
      ".LLLl..",
      "LLLl...",
      "LLLl...",
      "LLLl...",
      ".LLLl..",
      "..LLLL."
    ]
  },
  "note": {
    "x": 31,
    "y": 1,
    "rows": [
      "...ffff",
      "...f..f",
      "...f..f",
      ".fff.ff",
      "ffff.ff",
      ".ff...."
    ]
  },
  "drop": {
    "x": 33,
    "y": 13,
    "rows": [
      "..B..",
      ".BBB.",
      "BBwBB",
      "BBBBB",
      ".BBB."
    ]
  }
} as const;
