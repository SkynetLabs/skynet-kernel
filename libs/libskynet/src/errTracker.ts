// errTracker.ts defines an 'ErrTracker' type which keeps track of historical
// errors. When the number of errors gets too large, it randomly starts pruning
// errors. It always keeps 250 of the most recent errors, and then keeps up to
// 500 historic errors, where the first few errors after runtime are always
// kept, and the ones in the middle are increasingly likely to be omitted from
// the history.

import { Err } from "./types.js";

// MAX_ERRORS defines the maximum number of errors that will be held in the
// HistoricErr object.
const MAX_ERRORS = 1000;

// HistoricErr is a wrapper that adds a date to the Err type.
interface HistoricErr {
  err: Err;
  date: Date;
}

// ErrTracker keeps track of errors that have happened, randomly dropping
// errors to prevent the tracker from using too much memory if there happen to
// be a large number of errors.
interface ErrTracker {
  recentErrs: HistoricErr[];
  oldErrs: HistoricErr[];

  addErr: (err: Err) => void;
  viewErrs: () => HistoricErr[];
}

// newErrTracker returns an ErrTracker object that is ready to have errors
// added to it.
function newErrTracker(): ErrTracker {
  const et: ErrTracker = {
    recentErrs: [],
    oldErrs: [],

    addErr: function (err: Err): void {
      addHistoricErr(et, err);
    },
    viewErrs: function (): HistoricErr[] {
      return viewErrs(et);
    },
  };
  return et;
}

// addHistoricErr is a function that will add an error to a set of historic
// errors. It uses randomness to prune errors once the error object is too
// large.
function addHistoricErr(et: ErrTracker, err: Err): void {
  // Add this error to the set of most recent errors.
  et.recentErrs.push({
    err,
    date: new Date(),
  });

  // Determine whether some of the most recent errors need to be moved into
  // logTermErrs. If the length of the mostRecentErrs is not at least half of
  // the MAX_ERRORS, we don't need to do anything.
  if (et.recentErrs.length < MAX_ERRORS / 2) {
    return;
  }

  // Iterate through the recentErrs. For the first half of the recentErrs, we
  // will use randomness to either toss them or move them to oldErrs. The
  // second half of the recentErrs will be kept as the new recentErrs array.
  const newRecentErrs = [];
  for (let i = 0; i < et.recentErrs.length; i++) {
    // If we are in the second half of the array, add the element to
    // newRecentErrs.
    if (i > et.recentErrs.length / 2) {
      newRecentErrs.push(et.recentErrs[i]);
      continue;
    }

    // We are in the first half of the array, use a random number to add the
    // error oldErrs probabilistically.
    const rand = Math.random();
    const target = et.oldErrs.length / (MAX_ERRORS / 2);
    if (rand > target || et.oldErrs.length < 25) {
      et.oldErrs.push(et.recentErrs[i]);
    }
  }
  et.recentErrs = newRecentErrs;
}

// viewErrs returns the list of errors that have been retained by the
// HistoricErr object.
function viewErrs(et: ErrTracker): HistoricErr[] {
  const finalErrs: HistoricErr[] = [];
  for (let i = 0; i < et.oldErrs.length; i++) {
    finalErrs.push(et.oldErrs[i]);
  }
  for (let i = 0; i < et.recentErrs.length; i++) {
    finalErrs.push(et.recentErrs[i]);
  }
  return finalErrs;
}

export { ErrTracker, HistoricErr, newErrTracker };
