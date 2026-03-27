// === Fun Status Messages ===
// Shown while waiting for AI responses — rotated randomly for variety

const STATUS_PREPARING = [
  'Preparing context…',
  'Gathering ingredients…',
  'Setting the table…',
  'Warming up the oven…',
  'Sharpening the quill…',
  'Brewing the ink…',
  'Tuning the instruments…',
  'Unfurling the scrolls…',
  'Stoking the creative fires…',
  'Lining up the dominoes…',
  'Threading the needle…',
  'Mixing the palette…',
  'Calibrating the muse…',
  'Dusting off the manuscript…',
  'Loading the kiln…',
  'Stretching the canvas…',
  'Sorting the library…',
  'Lighting the lantern…',
  'Oiling the gears…',
  'Setting the stage…',
  'Clearing the desk…',
  'Weighing the words…',
  'Mapping the territory…',
  'Plotting the course…',
  'Cracking the spine…',
  'Annotating the margins…',
  'Trimming the wick…',
  'Centering the clay…',
  'Winding the clock…',
  'Consulting the oracle…',
  'Priming the pump…',
  'Counting the syllables…',
  'Polishing the lens…',
  'Arranging the notes…',
  'Pressing the flowers…',
  'Checking the index cards…',
  'Laying the groundwork…',
  'Folding the paper cranes…',
  'Reading the room…',
  'Sharpening the chisel…',
  'Drawing the curtain…',
  'Dipping the candle…',
  'Laying the first stone…',
  'Steeping the tea…',
  'Charting the stars…',
] as const;

const STATUS_WAITING = [
  'Waiting for response…',
  'Baking your story…',
  'Simmering the plot…',
  'Letting the ideas rise…',
  'Marinating the prose…',
  'Kneading the narrative…',
  'Steeping the subtext…',
  'Whipping up some magic…',
  'Slow-roasting the drama…',
  'Folding in the details…',
  'Reducing the sauce…',
  'Glazing the final draft…',
  'Tempering the dialogue…',
  'Proofing the dough…',
  'Caramelizing the conflict…',
  'Letting the flavors meld…',
  'Resting the dough…',
  'Emulsifying the themes…',
  'Clarifying the broth…',
  'Seasoning to taste…',
  'Curing in the dark…',
  'Cold-smoking the subplots…',
  'Fermenting the backstory…',
  'Whisking in the symbolism…',
  'Poaching the plot points…',
  'Braising the first act…',
  'Candying the climax…',
  'Infusing the atmosphere…',
  'Pressing the cider…',
  'Pickling the side characters…',
  'Blooming the spices…',
  'Deglazing the pan…',
  'Aerating the narrative…',
  'Chilling the tension…',
  'Flambéing the finale…',
  'Crisping the edges…',
  'Soaking the chapters…',
  'Distilling the essence…',
  'Resting the roast…',
  'Torching the crème brûlée…',
  'Brining the dialogue…',
  'Rendering the drama…',
  'Blanching the exposition…',
  'Churning the plot butter…',
  'Charring the second act…',
] as const;

const STATUS_RESPONDING = [
  'Responding…',
  'Plating the words…',
  'Pouring the first draft…',
  'Uncorking the story…',
  'Fresh out of the oven…',
  'Serving it up…',
  'Words incoming…',
  'Ink hitting the page…',
  'The muse speaks…',
  'Assembling the prose…',
  'Composing a reply…',
  'Setting type…',
  'Here it comes…',
  'Spinning the yarn…',
  'Rolling out the words…',
  'Garnishing the plate…',
  'Ringing the bell…',
  'Words take flight…',
  'The pen moves…',
  'Thoughts crystallize…',
  'Lines are forming…',
  'The story unfolds…',
  'Sentences arrive…',
  'The voice emerges…',
  'Prose flows…',
  'Letters find their place…',
  'Dishing it up…',
  'Hot off the press…',
  'Fresh from the forge…',
  'Delivering the goods…',
  'Arriving on the page…',
  'Making its entrance…',
  'The draft descends…',
  'Weaving the final thread…',
  'The chapter breathes…',
  'Laying down the prose…',
  'A story takes shape…',
  'Transcribing the dream…',
  'The narrative lands…',
  'Pulling back the curtain…',
  'Bringing it to the table…',
  'Straight from the source…',
  'Pages materialize…',
  'The words are here…',
  'Committing to the page…',
] as const;

// === Pitch Room Flavor Text ===
// Shown in the empty state of the Pitch Room — rotated for personality

const PITCH_ROOM_FLAVOR = [
  'Every great novel starts with a "what if…"',
  'Spark is ready. Got a story itching to be told?',
  'The blank page isn\'t empty — it\'s full of possibility.',
  'What world are we building today?',
  'A character walks into a room. What happens next?',
  'The best ideas sound a little crazy at first.',
  'Tell me about the book only you can write.',
  'Genre? Mood? A single image? Start anywhere.',
  'No commitment, no pressure — just ideas.',
  'Every bestseller was once a weird thought at 2 AM.',
  'Let\'s find the story that won\'t leave you alone.',
  'The muse is in. Take a seat.',
  'What story has been keeping you up at night?',
  'Pitch me something wild.',
  'First thought, best thought. What have you got?',
  'The Pitch Room is open. Spark is listening.',
] as const;

function pickRandom(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Returns a random fun status message for the "preparing context" phase. */
export function randomPreparingStatus(): string {
  return pickRandom(STATUS_PREPARING);
}

/** Returns a random fun status message for the "waiting for response" phase. */
export function randomWaitingStatus(): string {
  return pickRandom(STATUS_WAITING);
}

/** Returns a random fun status message for the "responding" phase (shown in renderer stores). */
export function randomRespondingStatus(): string {
  return pickRandom(STATUS_RESPONDING);
}

/** Returns a random Pitch Room flavor line for the empty state. */
export function randomPitchRoomFlavor(): string {
  return pickRandom(PITCH_ROOM_FLAVOR);
}
