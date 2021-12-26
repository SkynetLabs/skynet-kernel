// dictionary contains the word list for the mysky seed.
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
