// Set the header of the page.
document.title = "skynet-kernel: login";

// Define the number of entropy words used when generating the seed.
const SEED_ENTROPY_WORDS = 13;
const SEED_BYTES = 16;

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


// validSeed will determine whether a provided seed is valid.
// 
// TODO: Finish the function.
var validSeed = function(seedPhrase: string) {
	// Convert the seedPhrase in to a seed.
	//
	// TODO: I'm not sure how to declare an empty variable, we don't
	// actually need to call 'new' here.
	let seed = new Uint8Array(SEED_BYTES);
	try {
		seed = seedPhraseToSeed(seedPhrase);
	} catch(err) {
		throw "unable to parse seed phrase: " + err;
	}

	/*
	let words = seed.split(" ");
	if (words.length !== 1) {
		return false;
	}
	for (let i = 0; i < dictionary.length; i++) {
		if (dictionary[i] === words[0]) {
			document.getElementById("errorText").textContent = "the seed was found inthe dict";
			return false;
		}
	}
	document.getElementById("errorText").textContent = "word not found in dict";
	*/

	// TODO: Throw a valid string just so we can debug easier as we code the
	// function up.
	document.getElementById("errorText").textContent = JSON.stringify(seed);
	throw `seed is valid: ${seed.length}`;
}

// seedPhraseToSeed will convert a provided seed phrase to to a Uint8Array that
// represents the cryptographic seed in bytes.
//
// TODO: Need to fix the error handling here.
function seedPhraseToSeed(seedPhrase: string): Uint8Array {
	let seedWords = seedPhrase.split(" ");
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
			if (seedWords[i].slice(0, 3) === dictionary[j].slice(0, 3)) {
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
	}

	// Generate the seed phrase from the randNums.
	let seedPhrase = ""
	for (let i = 0; i < SEED_ENTROPY_WORDS; i++) {
		let wordIndex = randNums[i] % dictionary.length;
		if (i !== 0) {
			seedPhrase += " ";
		}
		seedPhrase += dictionary[wordIndex];
	}
	document.getElementById("seedText").textContent = seedPhrase;

	// TODO: compute the checksum.
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
// TODO: We also need to handle creating a new seed for the user.
//
// TODO: Obviously we can clean this up and make it prettier. I'm not sure how
// to load a file here without going to the network, but surely there's some
// way to get this page rendering without building the whole DOM by hand in js.
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
