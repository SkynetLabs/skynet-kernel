import {
    SEED_ENTROPY_WORDS,
    seedWordsToSeed,
    seedToChecksumWords,
} from './skynet'

import { dictionary, validSeedPhrase, bufToHex } from 'libskynet'

import { v1seed, errors } from '../lib/stores'

export const generateSeedPhrase = function () {
    // Get the random numbers for the seed phrase. Typically, you need to
    // have code that avoids bias by checking the random results and
    // re-rolling the random numbers if the result is outside of the range
    // of numbers that would produce no bias. Because the search space
    // (1024) evenly divides the random number space (2^16), we can skip
    // this step and just use a modulus instead. The result will have no
    // bias, but only because the search space is a power of 2.
    let randNums = new Uint16Array(SEED_ENTROPY_WORDS)
    crypto.getRandomValues(randNums)
    // Consistency check to verify the above statement.
    if (dictionary.length !== 1024) {
        const errorText = 'ERROR: the dictionary is the wrong length!'
        errors.update((errorList) => [...errorList, errorText])
        return
    }
    // Generate the seed phrase from the randNums.
    let seedWords = []
    for (let i = 0; i < SEED_ENTROPY_WORDS; i++) {
        let wordIndex = randNums[i] % dictionary.length
        if (i === 12) {
            wordIndex = randNums[i] % (dictionary.length / 4)
        }
        seedWords.push(dictionary[wordIndex])
    }
    // Convert the seedWords to a seed.
    let [seed, err1] = seedWordsToSeed(seedWords)
    if (err1 !== null) {
        const errorText = 'ERROR: Unable to parse generated seed: ' + err1
        errors.update((errorList) => [...errorList, errorText])
        return
    }
    // Compute the checksum.
    let [checksumOne, checksumTwo, err2] = seedToChecksumWords(seed)
    if (err2 !== null) {
        const errorText = 'ERROR: Unable to compute checksum: ' + err2
        errors.update((errorList) => [...errorList, errorText])
        return
    }
    // Assemble the final seed phrase and set the text field.
    let allWords = [...seedWords, checksumOne, checksumTwo]
    let seedPhrase = allWords.join(' ')
    // document.getElementById("seedText").textContent = seedPhrase;
    // generatedSeedPhrase = seedPhrase;
    return seedPhrase
}

// authUser is a function which will inspect the value of the input field to
// find the seed, and then will set the user's local seed to that value.
export const authUser = function (inputSeed) {
    // Check that the user has provided a seed.
    // var userSeed = document.getElementById("seedInput");
    var userSeed = inputSeed

    if (userSeed === null) {
        const errorText = 'ERROR: user seed field not found'
        errors.update((errorList) => [...errorList, errorText])
        return
    }
    // Validate the seed.
    let [seed, errVSP] = validSeedPhrase(userSeed)
    if (errVSP !== null) {
        const errorText = 'Seed is not valid: ' + errVSP
        errors.update((errorList) => [...errorList, errorText])
        return
    }
    // Take the seed and store it in localStorage.
    // let seedStr = String.fromCharCode(...seed)

    // Take the seed and store it in localStorage.
    let seedStr = bufToHex(seed)

    window.localStorage.setItem('v1-seed', seedStr)

    // update app state
    v1seed.update(() => seedStr)

    // If there was a window opener, we should send a message to
    // the opener indicating that auth was successful, and then close
    // this window. Otherwise, we should just refresh the page.
    if (window.opener) {
        // Send a postmessage back to the caller that auth was successful. This
        // is one of the few places where a wildcard can be used by the
        // postMessage because we are comfortable declaring to all pages that
        // the user has logged into the kernel.
        try {
            window.opener.postMessage({ kernelMethod: 'authCompleted' }, '*')
            window.close()
        } catch (errC) {
            const errorText =
                'Unable to report that authentication suceeded: ' + errC
            errors.update((errorList) => [...errorList, errorText])
        }
    } else {
        // location.reload()
    }
}

export const logOut = function () {
    // Log out by clearing localstorage.
    window.localStorage.clear()

    // clear from app state
    v1seed.update(() => '')

    // If there was a window opener, we should send a message to
    // the opener indicating that auth was successful, and then close
    // this window. Otherwise, we should just refresh the page.
    if (window.opener) {
        // Send a postmessage back to the caller that auth was successful. This
        // is one of the few places where a wildcard can be used by the
        // postMessage because we are comfortable declaring to all pages that
        // the user has logged into the kernel.
        try {
            window.opener.postMessage({ kernelMethod: 'logOutSucces' }, '*')
            window.close()
        } catch (errC) {
            const errorText =
                'Unable to report that authentication suceeded: ' + errC
            errors.update((errorList) => [...errorList, errorText])
        }
    } else {
        // location.reload()
    }
}
