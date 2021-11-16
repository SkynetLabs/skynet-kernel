// Set the header of the page.
document.title = "skynet-kernel: login";

// Define the number of entropy words used when generating the seed.
const SEED_ENTROPY_WORDS = 13;
const SEED_CHECKSUM_WORDS = 2;
const SEED_BYTES = 16;
const DICTIONARY_UNIQUE_PREFIX = 3;

// dictionary contains the word list for the mysky seed.
//
// TODO: I couldn't figure out how to get typescript imports working with
// broswer extensions, so the libraries are all inline for the time being.
const dictionary = [
  "abbey", "ablaze", "abort", "absorb", "abyss", "aces", "aching", "acidic",
  "across", "acumen", "adapt", "adept", "adjust", "adopt", "adult", "aerial",
  "afar", "affair", "afield", "afloat", "afoot", "afraid", "after", "agenda",
  "agile", "aglow", "agony", "agreed", "ahead", "aided", "aisle", "ajar",
  "akin", "alarms", "album", "alerts", "alley", "almost", "aloof", "alpine",
  "also", "alumni", "always", "amaze", "ambush", "amidst", "ammo", "among",
  "amply", "amused", "anchor", "angled", "ankle", "antics", "anvil", "apart",
  "apex", "aphid", "aplomb", "apply", "archer", "ardent", "arena", "argue",
  "arises", "army", "around", "arrow", "ascend", "aside", "asked", "asleep",
  "aspire", "asylum", "atlas", "atom", "atrium", "attire", "auburn", "audio",
  "august", "aunt", "autumn", "avatar", "avidly", "avoid", "awful", "awning",
  "awoken", "axes", "axis", "axle", "aztec", "azure", "baby", "bacon", "badge",
  "bailed", "bakery", "bamboo", "banjo", "basin", "batch", "bawled", "bays",
  "beer", "befit", "begun", "behind", "being", "below", "bested", "bevel",
  "beware", "beyond", "bias", "bids", "bikini", "birth", "bite", "blip",
  "boat", "bodies", "bogeys", "boil", "boldly", "bomb", "border", "boss",
  "both", "bovine", "boxes", "broken", "brunt", "bubble", "budget", "buffet",
  "bugs", "bulb", "bumper", "bunch", "butter", "buying", "buzzer", "byline",
  "bypass", "cabin", "cactus", "cadets", "cafe", "cage", "cajun", "cake",
  "camp", "candy", "casket", "catch", "cause", "cease", "cedar", "cell",
  "cement", "cent", "chrome", "cider", "cigar", "cinema", "circle", "claim",
  "click", "clue", "coal", "cobra", "cocoa", "code", "coffee", "cogs", "coils",
  "colony", "comb", "cool", "copy", "cousin", "cowl", "cube", "cuffs",
  "custom", "dads", "daft", "dagger", "daily", "damp", "dapper", "darted",
  "dash", "dating", "dawn", "dazed", "debut", "decay", "deftly", "deity",
  "dented", "depth", "desk", "devoid", "dice", "diet", "digit", "dilute",
  "dime", "dinner", "diode", "ditch", "divers", "dizzy", "doctor", "dodge",
  "does", "dogs", "doing", "donuts", "dosage", "dotted", "double", "dove",
  "down", "dozen", "dreams", "drinks", "drunk", "drying", "dual", "dubbed",
  "dude", "duets", "duke", "dummy", "dunes", "duplex", "dusted", "duties",
  "dwarf", "dwelt", "dying", "each", "eagle", "earth", "easy", "eating",
  "echo", "eden", "edgy", "edited", "eels", "eggs", "eight", "either", "eject",
  "elapse", "elbow", "eldest", "eleven", "elite", "elope", "else", "eluded",
  "emails", "ember", "emerge", "emit", "empty", "energy", "enigma", "enjoy",
  "enlist", "enmity", "enough", "ensign", "envy", "epoxy", "equip", "erase",
  "error", "estate", "etched", "ethics", "excess", "exhale", "exit", "exotic",
  "extra", "exult", "fading", "faked", "fall", "family", "fancy", "fatal",
  "faulty", "fawns", "faxed", "fazed", "feast", "feel", "feline", "fences",
  "ferry", "fever", "fewest", "fiat", "fibula", "fidget", "fierce", "fight",
  "films", "firm", "five", "fixate", "fizzle", "fleet", "flying", "foamy",
  "focus", "foes", "foggy", "foiled", "fonts", "fossil", "fowls", "foxes",
  "foyer", "framed", "frown", "fruit", "frying", "fudge", "fuel", "fully",
  "fuming", "fungal", "future", "fuzzy", "gables", "gadget", "gags", "gained",
  "galaxy", "gambit", "gang", "gasp", "gather", "gauze", "gave", "gawk",
  "gaze", "gecko", "geek", "gels", "germs", "geyser", "ghetto", "ghost",
  "giant", "giddy", "gifts", "gills", "ginger", "girth", "giving", "glass",
  "glide", "gnaw", "gnome", "goat", "goblet", "goes", "going", "gone",
  "gopher", "gossip", "gotten", "gown", "grunt", "guest", "guide", "gulp",
  "guru", "gusts", "gutter", "guys", "gypsy", "gyrate", "hairy", "having",
  "hawk", "hazard", "heels", "hefty", "height", "hence", "heron", "hiding",
  "hijack", "hiker", "hills", "hinder", "hippo", "hire", "hive", "hoax",
  "hobby", "hockey", "hold", "honked", "hookup", "hope", "hornet", "hotel",
  "hover", "howls", "huddle", "huge", "hull", "humid", "hunter", "huts",
  "hybrid", "hyper", "icing", "icon", "idiom", "idled", "idols", "igloo",
  "ignore", "iguana", "impel", "incur", "injury", "inline", "inmate", "input",
  "insult", "invoke", "ionic", "irate", "iris", "irony", "island", "issued",
  "itches", "items", "itself", "ivory", "jabbed", "jaded", "jagged", "jailed",
  "jargon", "jaunt", "jaws", "jazz", "jeans", "jeers", "jester", "jewels",
  "jigsaw", "jingle", "jive", "jobs", "jockey", "jogger", "joking", "jolted",
  "jostle", "joyous", "judge", "juicy", "july", "jump", "junk", "jury",
  "karate", "keep", "kennel", "kept", "kettle", "king", "kiosk", "kisses",
  "kiwi", "knee", "knife", "koala", "ladder", "lagoon", "lair", "lakes",
  "lamb", "laptop", "large", "last", "later", "lava", "layout", "lazy",
  "ledge", "leech", "left", "legion", "lemon", "lesson", "liar", "licks",
  "lids", "lied", "light", "lilac", "limits", "linen", "lion", "liquid",
  "listen", "lively", "loaded", "locker", "lodge", "lofty", "logic", "long",
  "lopped", "losing", "loudly", "love", "lower", "loyal", "lucky", "lumber",
  "lunar", "lurk", "lush", "luxury", "lymph", "lynx", "lyrics", "macro",
  "mailed", "major", "makeup", "malady", "mammal", "maps", "match", "maul",
  "mayor", "maze", "meant", "memoir", "menu", "merger", "mesh", "metro",
  "mews", "mice", "midst", "mighty", "mime", "mirror", "misery", "moat",
  "mobile", "mocked", "mohawk", "molten", "moment", "money", "moon", "mops",
  "morsel", "mostly", "mouth", "mowing", "much", "muddy", "muffin", "mugged",
  "mullet", "mumble", "muppet", "mural", "muzzle", "myriad", "myth", "nagged",
  "nail", "names", "nanny", "napkin", "nasty", "navy", "nearby", "needed",
  "neon", "nephew", "nerves", "nestle", "never", "newt", "nexus", "nibs",
  "niche", "niece", "nifty", "nimbly", "nobody", "nodes", "noises", "nomad",
  "noted", "nouns", "nozzle", "nuance", "nudged", "nugget", "null", "number",
  "nuns", "nurse", "nylon", "oaks", "oars", "oasis", "object", "occur",
  "ocean", "odds", "offend", "often", "okay", "older", "olive", "omega",
  "onion", "online", "onto", "onward", "oozed", "opened", "opus", "orange",
  "orbit", "orchid", "orders", "organs", "origin", "oscar", "otter", "ouch",
  "ought", "ounce", "oust", "oval", "oven", "owed", "owls", "owner", "oxygen",
  "oyster", "ozone", "pact", "pager", "palace", "paper", "pastry", "patio",
  "pause", "peeled", "pegs", "pencil", "people", "pepper", "pests", "petals",
  "phase", "phone", "piano", "picked", "pierce", "pimple", "pirate", "pivot",
  "pixels", "pizza", "pledge", "pliers", "plus", "poetry", "point", "poker",
  "polar", "ponies", "pool", "potato", "pouch", "powder", "pram", "pride",
  "pruned", "prying", "public", "puck", "puddle", "puffin", "pulp", "punch",
  "puppy", "purged", "push", "putty", "pylons", "python", "queen", "quick",
  "quote", "radar", "rafts", "rage", "raking", "rally", "ramped", "rapid",
  "rarest", "rash", "rated", "ravine", "rays", "razor", "react", "rebel",
  "recipe", "reduce", "reef", "refer", "reheat", "relic", "remedy", "repent",
  "reruns", "rest", "return", "revamp", "rewind", "rhino", "rhythm", "ribbon",
  "richly", "ridges", "rift", "rigid", "rims", "riots", "ripped", "rising",
  "ritual", "river", "roared", "robot", "rodent", "rogue", "roles", "roomy",
  "roped", "roster", "rotate", "rover", "royal", "ruby", "rudely", "rugged",
  "ruined", "ruling", "rumble", "runway", "rural", "sack", "safety", "saga",
  "sailor", "sake", "salads", "sample", "sanity", "sash", "satin", "saved",
  "scenic", "school", "scoop", "scrub", "scuba", "second", "sedan", "seeded",
  "setup", "sewage", "sieve", "silk", "sipped", "siren", "sizes", "skater",
  "skew", "skulls", "slid", "slower", "slug", "smash", "smog", "snake",
  "sneeze", "sniff", "snout", "snug", "soapy", "sober", "soccer", "soda",
  "soggy", "soil", "solved", "sonic", "soothe", "sorry", "sowed", "soya",
  "space", "speedy", "sphere", "spout", "sprig", "spud", "spying", "square",
  "stick", "subtly", "suede", "sugar", "summon", "sunken", "surfer", "sushi",
  "suture", "swept", "sword", "swung", "system", "taboo", "tacit", "tagged",
  "tail", "taken", "talent", "tamper", "tanks", "tasked", "tattoo", "taunts",
  "tavern", "tawny", "taxi", "tell", "tender", "tepid", "tether", "thaw",
  "thorn", "thumbs", "thwart", "ticket", "tidy", "tiers", "tiger", "tilt",
  "timber", "tinted", "tipsy", "tirade", "tissue", "titans", "today", "toffee",
  "toilet", "token", "tonic", "topic", "torch", "tossed", "total", "touchy",
  "towel", "toxic", "toyed", "trash", "trendy", "tribal", "truth", "trying",
  "tubes", "tucks", "tudor", "tufts", "tugs", "tulips", "tunnel", "turnip",
  "tusks", "tutor", "tuxedo", "twang", "twice", "tycoon", "typist", "tyrant",
  "ugly", "ulcers", "umpire", "uncle", "under", "uneven", "unfit", "union",
  "unmask", "unrest", "unsafe", "until", "unveil", "unwind", "unzip", "upbeat",
  "update", "uphill", "upkeep", "upload", "upon", "upper", "urban", "urgent",
  "usage", "useful", "usher", "using", "usual", "utmost", "utopia", "vague",
  "vain", "value", "vane", "vary", "vats", "vaults", "vector", "veered",
  "vegan", "vein", "velvet", "vessel", "vexed", "vials", "victim", "video",
  "viking", "violin", "vipers", "vitals", "vivid", "vixen", "vocal", "vogue",
  "voice", "vortex", "voted", "vowels", "voyage", "wade", "waffle", "waist",
  "waking", "wanted", "warped", "water", "waxing", "wedge", "weird", "went",
  "wept", "were", "whale", "when", "whole", "width", "wield", "wife", "wiggle",
  "wildly", "winter", "wiring", "wise", "wives", "wizard", "wobbly", "woes",
  "woken", "wolf", "woozy", "worry", "woven", "wrap", "wrist", "wrong",
  "yacht", "yahoo", "yanks",
];

// TODO: I couldn't figure out how to do imports within an extension, this is
// part of the crypto library, it gives us hashing.
var K = [
  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd,
  0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
  0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019,
  0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
  0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe,
  0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
  0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1,
  0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
  0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
  0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
  0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483,
  0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
  0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210,
  0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
  0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725,
  0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
  0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926,
  0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
  0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8,
  0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
  0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001,
  0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
  0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910,
  0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
  0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53,
  0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
  0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
  0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
  0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60,
  0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
  0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9,
  0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
  0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207,
  0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
  0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6,
  0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
  0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493,
  0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
  0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a,
  0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
];

// TODO: I couldn't figure out how to do imports within an extension, this is
// part of the crypto library, it gives us hashing.
function ts64(x, i, h, l) {
  x[i]   = (h >> 24) & 0xff;
  x[i+1] = (h >> 16) & 0xff;
  x[i+2] = (h >>  8) & 0xff;
  x[i+3] = h & 0xff;
  x[i+4] = (l >> 24)  & 0xff;
  x[i+5] = (l >> 16)  & 0xff;
  x[i+6] = (l >>  8)  & 0xff;
  x[i+7] = l & 0xff;
}

// TODO: I couldn't figure out how to do imports within an extension, this is
// part of the crypto library, it gives us hashing.
function crypto_hashblocks_hl(hh, hl, m, n) {
  var wh = new Int32Array(16), wl = new Int32Array(16),
      bh0, bh1, bh2, bh3, bh4, bh5, bh6, bh7,
      bl0, bl1, bl2, bl3, bl4, bl5, bl6, bl7,
      th, tl, i, j, h, l, a, b, c, d;

  var ah0 = hh[0],
      ah1 = hh[1],
      ah2 = hh[2],
      ah3 = hh[3],
      ah4 = hh[4],
      ah5 = hh[5],
      ah6 = hh[6],
      ah7 = hh[7],

      al0 = hl[0],
      al1 = hl[1],
      al2 = hl[2],
      al3 = hl[3],
      al4 = hl[4],
      al5 = hl[5],
      al6 = hl[6],
      al7 = hl[7];

  var pos = 0;
  while (n >= 128) {
    for (i = 0; i < 16; i++) {
      j = 8 * i + pos;
      wh[i] = (m[j+0] << 24) | (m[j+1] << 16) | (m[j+2] << 8) | m[j+3];
      wl[i] = (m[j+4] << 24) | (m[j+5] << 16) | (m[j+6] << 8) | m[j+7];
    }
    for (i = 0; i < 80; i++) {
      bh0 = ah0;
      bh1 = ah1;
      bh2 = ah2;
      bh3 = ah3;
      bh4 = ah4;
      bh5 = ah5;
      bh6 = ah6;
      bh7 = ah7;

      bl0 = al0;
      bl1 = al1;
      bl2 = al2;
      bl3 = al3;
      bl4 = al4;
      bl5 = al5;
      bl6 = al6;
      bl7 = al7;

      // add
      h = ah7;
      l = al7;

      a = l & 0xffff; b = l >>> 16;
      c = h & 0xffff; d = h >>> 16;

      // Sigma1
      h = ((ah4 >>> 14) | (al4 << (32-14))) ^ ((ah4 >>> 18) | (al4 << (32-18))) ^ ((al4 >>> (41-32)) | (ah4 << (32-(41-32))));
      l = ((al4 >>> 14) | (ah4 << (32-14))) ^ ((al4 >>> 18) | (ah4 << (32-18))) ^ ((ah4 >>> (41-32)) | (al4 << (32-(41-32))));

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      // Ch
      h = (ah4 & ah5) ^ (~ah4 & ah6);
      l = (al4 & al5) ^ (~al4 & al6);

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      // K
      h = K[i*2];
      l = K[i*2+1];

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      // w
      h = wh[i%16];
      l = wl[i%16];

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      b += a >>> 16;
      c += b >>> 16;
      d += c >>> 16;

      th = c & 0xffff | d << 16;
      tl = a & 0xffff | b << 16;

      // add
      h = th;
      l = tl;

      a = l & 0xffff; b = l >>> 16;
      c = h & 0xffff; d = h >>> 16;

      // Sigma0
      h = ((ah0 >>> 28) | (al0 << (32-28))) ^ ((al0 >>> (34-32)) | (ah0 << (32-(34-32)))) ^ ((al0 >>> (39-32)) | (ah0 << (32-(39-32))));
      l = ((al0 >>> 28) | (ah0 << (32-28))) ^ ((ah0 >>> (34-32)) | (al0 << (32-(34-32)))) ^ ((ah0 >>> (39-32)) | (al0 << (32-(39-32))));

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      // Maj
      h = (ah0 & ah1) ^ (ah0 & ah2) ^ (ah1 & ah2);
      l = (al0 & al1) ^ (al0 & al2) ^ (al1 & al2);

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      b += a >>> 16;
      c += b >>> 16;
      d += c >>> 16;

      bh7 = (c & 0xffff) | (d << 16);
      bl7 = (a & 0xffff) | (b << 16);

      // add
      h = bh3;
      l = bl3;

      a = l & 0xffff; b = l >>> 16;
      c = h & 0xffff; d = h >>> 16;

      h = th;
      l = tl;

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      b += a >>> 16;
      c += b >>> 16;
      d += c >>> 16;

      bh3 = (c & 0xffff) | (d << 16);
      bl3 = (a & 0xffff) | (b << 16);

      ah1 = bh0;
      ah2 = bh1;
      ah3 = bh2;
      ah4 = bh3;
      ah5 = bh4;
      ah6 = bh5;
      ah7 = bh6;
      ah0 = bh7;

      al1 = bl0;
      al2 = bl1;
      al3 = bl2;
      al4 = bl3;
      al5 = bl4;
      al6 = bl5;
      al7 = bl6;
      al0 = bl7;

      if (i%16 === 15) {
        for (j = 0; j < 16; j++) {
          // add
          h = wh[j];
          l = wl[j];

          a = l & 0xffff; b = l >>> 16;
          c = h & 0xffff; d = h >>> 16;

          h = wh[(j+9)%16];
          l = wl[(j+9)%16];

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          // sigma0
          th = wh[(j+1)%16];
          tl = wl[(j+1)%16];
          h = ((th >>> 1) | (tl << (32-1))) ^ ((th >>> 8) | (tl << (32-8))) ^ (th >>> 7);
          l = ((tl >>> 1) | (th << (32-1))) ^ ((tl >>> 8) | (th << (32-8))) ^ ((tl >>> 7) | (th << (32-7)));

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          // sigma1
          th = wh[(j+14)%16];
          tl = wl[(j+14)%16];
          h = ((th >>> 19) | (tl << (32-19))) ^ ((tl >>> (61-32)) | (th << (32-(61-32)))) ^ (th >>> 6);
          l = ((tl >>> 19) | (th << (32-19))) ^ ((th >>> (61-32)) | (tl << (32-(61-32)))) ^ ((tl >>> 6) | (th << (32-6)));

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;

          wh[j] = (c & 0xffff) | (d << 16);
          wl[j] = (a & 0xffff) | (b << 16);
        }
      }
    }

    // add
    h = ah0;
    l = al0;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[0];
    l = hl[0];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[0] = ah0 = (c & 0xffff) | (d << 16);
    hl[0] = al0 = (a & 0xffff) | (b << 16);

    h = ah1;
    l = al1;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[1];
    l = hl[1];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[1] = ah1 = (c & 0xffff) | (d << 16);
    hl[1] = al1 = (a & 0xffff) | (b << 16);

    h = ah2;
    l = al2;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[2];
    l = hl[2];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[2] = ah2 = (c & 0xffff) | (d << 16);
    hl[2] = al2 = (a & 0xffff) | (b << 16);

    h = ah3;
    l = al3;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[3];
    l = hl[3];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[3] = ah3 = (c & 0xffff) | (d << 16);
    hl[3] = al3 = (a & 0xffff) | (b << 16);

    h = ah4;
    l = al4;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[4];
    l = hl[4];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[4] = ah4 = (c & 0xffff) | (d << 16);
    hl[4] = al4 = (a & 0xffff) | (b << 16);

    h = ah5;
    l = al5;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[5];
    l = hl[5];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[5] = ah5 = (c & 0xffff) | (d << 16);
    hl[5] = al5 = (a & 0xffff) | (b << 16);

    h = ah6;
    l = al6;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[6];
    l = hl[6];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[6] = ah6 = (c & 0xffff) | (d << 16);
    hl[6] = al6 = (a & 0xffff) | (b << 16);

    h = ah7;
    l = al7;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[7];
    l = hl[7];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[7] = ah7 = (c & 0xffff) | (d << 16);
    hl[7] = al7 = (a & 0xffff) | (b << 16);

    pos += 128;
    n -= 128;
  }

  return n;
}

// TODO: I couldn't figure out how to do imports within an extension, this is
// part of the crypto library, it gives us hashing.
function crypto_hash(out, m, n) {
  var hh = new Int32Array(8),
      hl = new Int32Array(8),
      x = new Uint8Array(256),
      i, b = n;

  hh[0] = 0x6a09e667;
  hh[1] = 0xbb67ae85;
  hh[2] = 0x3c6ef372;
  hh[3] = 0xa54ff53a;
  hh[4] = 0x510e527f;
  hh[5] = 0x9b05688c;
  hh[6] = 0x1f83d9ab;
  hh[7] = 0x5be0cd19;

  hl[0] = 0xf3bcc908;
  hl[1] = 0x84caa73b;
  hl[2] = 0xfe94f82b;
  hl[3] = 0x5f1d36f1;
  hl[4] = 0xade682d1;
  hl[5] = 0x2b3e6c1f;
  hl[6] = 0xfb41bd6b;
  hl[7] = 0x137e2179;

  crypto_hashblocks_hl(hh, hl, m, n);
  n %= 128;

  for (i = 0; i < n; i++) x[i] = m[b-n+i];
  x[n] = 128;

  n = 256-128*(n<112?1:0);
  x[n-9] = 0;
  ts64(x, n-8,  (b / 0x20000000) | 0, b << 3);
  crypto_hashblocks_hl(hh, hl, x, n);

  for (i = 0; i < 8; i++) ts64(out, 8*i, hh[i], hl[i]);

  return 0;
}

// seedToChecksumWords will compute the two checksum words for the provided
// seed.
var seedToChecksumWords = function(seed: Uint8Array): string[] {
	// Input validation.
	if (seed.length !== 16) {
		throw "seed has the wrong length";
	}

	// Get the hash.
	let h = new Uint8Array(64);
	crypto_hash(h, seed, seed.length);

	// Turn the hash into two words.
	let word1 = h[0] << 8;
	word1 += h[1];
	word1 >>= 6;
	let word2 = h[1] << 10;
	word2 &= 0xffff;
	word2 += h[2] << 2;
	word2 >>= 6;
	return [dictionary[word1], dictionary[word2]];
}

// validSeed will determine whether a provided seed is valid.
var validSeed = function(seedPhrase: string) {
	// Pull the seed into its respective parts.
	let seedWordsAndChecksum = seedPhrase.split(" ");
	let seedWords = seedWordsAndChecksum.slice(0, SEED_ENTROPY_WORDS);
	let checksumWords = seedWordsAndChecksum.slice(SEED_ENTROPY_WORDS, SEED_ENTROPY_WORDS+SEED_CHECKSUM_WORDS);

	// Convert the seedWords to a seed.
	//
	// TODO: I'm not sure how to declare an empty variable, we don't
	// actually need to call 'new' here.
	let seed = new Uint8Array(SEED_BYTES);
	try {
		seed = seedWordsToSeed(seedWords);
	} catch(err) {
		throw "unable to parse seed phrase: " + err;
	}

	let checksumWordsVerify = ["", ""];
	try {
		checksumWordsVerify = seedToChecksumWords(seed);
	} catch(err) {
		throw "could not compute checksum words:" + err;
	}
	if (checksumWords[0].slice(0, DICTIONARY_UNIQUE_PREFIX) !== checksumWordsVerify[0].slice(0, DICTIONARY_UNIQUE_PREFIX)) {
		throw "first checksum word is invalid";
	}
	if (checksumWords[1].slice(0, DICTIONARY_UNIQUE_PREFIX) !== checksumWordsVerify[1].slice(0, DICTIONARY_UNIQUE_PREFIX)) {
		throw "second checksum word is invalid";
	}
}

// seedWordsToSeed will convert a provided seed phrase to to a Uint8Array that
// represents the cryptographic seed in bytes.
var seedWordsToSeed = function(seedWords: string[]): Uint8Array {
	if (seedWords.length !== SEED_ENTROPY_WORDS) {
		throw `Input seed words should be length '${SEED_ENTROPY_WORDS}', was '${seedWords.length}'`;
	}

	// We are getting 16 bytes of entropy.
	const bytes = new Uint8Array(SEED_BYTES);
	let curByte = 0;
	let curBit = 0;
	for (let i = 0; i < SEED_ENTROPY_WORDS; i++) {
		// Determine which number corresponds to the next word.
		let word = -1;
		for (let j = 0; j < dictionary.length; j++) {
			if (seedWords[i].slice(0, DICTIONARY_UNIQUE_PREFIX) === dictionary[j].slice(0, DICTIONARY_UNIQUE_PREFIX)) {
				word = j;
				break;
			}
		}
		if (word === -1) {
			throw "seed word not found in dictionary";
		}
		let wordBits = 10;
		if (i === SEED_ENTROPY_WORDS - 1) {
			wordBits = 8;
		}

		// Iterate over the bits of the 10- or 8-bit word.
		for (let j = 0; j < wordBits; j++) {
			const bitSet = (word & (1 << (wordBits - j - 1))) > 0;

			if (bitSet) {
				bytes[curByte] |= 1 << (8 - curBit - 1);
			}

			curBit += 1;
			if (curBit >= 8) {
				// Current byte has 8 bits, go to the next byte.
				curByte += 1;
				curBit = 0;
			}
		}
	}

	return bytes;
}

// generateSeedPhrase will generate and verify a seed phrase for the user.
var generateSeedPhrase = function() {
	// Get the random numbers for the seed phrase. Typically, you need to
	// have code that avoids bias by checking the random results and
	// re-rolling the random numbers if the result is outside of the range
	// of numbers that would produce no bias. Because the search space
	// (1024) evenly divides the random number space (2^16), we can skip
	// this step and just use a modulus instead. The result will have no
	// bias, but only because the search space is a power of 2.
	let randNums = new Uint16Array(SEED_ENTROPY_WORDS);
	crypto.getRandomValues(randNums);
	// Consistency check to verify the above statement.
	if (dictionary.length !== 1024) {
		document.getElementById("errorText").textContent = "ERROR: the dictionary is the wrong length!";
		return;
	}

	// Generate the seed phrase from the randNums.
	//
	// TODO: I'm not sure how to make an empty array, so I did it by hand.
	let seedWords = ["", "", "", "", "", "", "", "", "", "", "", "", ""];
	for (let i = 0; i < SEED_ENTROPY_WORDS; i++) {
		let wordIndex = randNums[i] % dictionary.length;
		seedWords[i] = dictionary[wordIndex];
	}
	// Convert the seedWords to a seed.
	//
	// TODO: I'm not sure how to declare an empty variable, we don't
	// actually need to call 'new' here.
	let seed = new Uint8Array(SEED_BYTES);
	try {
		seed = seedWordsToSeed(seedWords);
	} catch(err) {
		throw "unable to parse seed phrase: " + err;
	}

	// Compute the checksum.
	let checksumWords = ["", ""];
	try {
		checksumWords = seedToChecksumWords(seed);
	} catch(err) {
		throw "could not compute checksum words:" + err;
	}

	// Assemble the seedPhrase using the seedWords and the checksumWords.
	let seedPhrase = "";
	for (let i = 0; i < SEED_ENTROPY_WORDS; i++) {
		if (i !== 0) {
			seedPhrase += " ";
		}
		seedPhrase += seedWords[i];
	}
	for (let i = 0; i < SEED_CHECKSUM_WORDS; i++) {
		seedPhrase += " ";
		seedPhrase += checksumWords[i];
	}

	// Set the text field that contains the seed phrase.
	document.getElementById("seedText").textContent = seedPhrase;
}

// authUser is a function which will inspect the value of the input field to
// find the seed, and then will set the user's local seed to that value.
var authUser = function() {
	// Check that the user has provided a seed.
	var userSeed = <HTMLInputElement>document.getElementById("seedInput");
	if (userSeed === null) {
		console.log("ERROR: user seed field not found");
		return;
	}

	// Validate the seed.
	try {
		validSeed(userSeed.value)
	} catch (err) {
		document.getElementById("errorText").textContent = "Seed is not valid: " + err;
		return;
	}

	// Take the seed and store it in localstorage.
	// 
	// TODO: switch to using just the v1-seed.
	window.localStorage.setItem("seed", userSeed.value);
	window.localStorage.setItem("v1-seed", userSeed.value);

	// Send a postmessage back to the caller that auth was successful.
	window.opener.postMessage({kernelMethod: "authCompleted"}, "*");
	window.close();
}

// Create the auth form and perform authentication.
//
// TODO: Figure out how to clean this up. I'm not sure how to import pretty
// HTML+CSS within an extension, so for now it's all DOM manipulation.
var seedInput = document.createElement("input");
seedInput.type = "text";
seedInput.placeholder = "Enter seed phrase here";
seedInput.id = "seedInput";
var submitButton = document.createElement("input");
submitButton.type = "button";
submitButton.value = "Submit";
submitButton.onclick = authUser;
var errorText = document.createElement("p");
errorText.id = "errorText";
errorText.textContent = "";
var generateSeedButton = document.createElement("input");
generateSeedButton.type = "button";
generateSeedButton.value = "Generate Seed";
generateSeedButton.onclick = generateSeedPhrase;
var seedText = document.createElement("p");
seedText.id = "seedText";
seedText.textContent = "";
document.body.appendChild(seedInput);
document.body.appendChild(submitButton);
document.body.appendChild(errorText);
document.body.appendChild(generateSeedButton);
document.body.appendChild(seedText);
