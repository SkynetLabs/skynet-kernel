<script lang="ts">
    import Layout from '../components/Layout.svelte'
    import Link from '../components/Link.svelte'
    import { authUser, generateSeedPhrase, logOut } from '../lib/helpers'
    import { validSeedPhrase } from 'libskynet'
    import { v1seed } from '../lib/stores'
    import { Info, Copy } from 'akar-icons-svelte'

    // setup variables
    let v1seedValue = null
    let inputSeed = ''
    let clipboardAccess = true

    // checks if seed is valid on each update
    $: validSeed = validSeedPhrase(inputSeed)[1] === null

    // keep v1seedValue updated with App State
    v1seed.subscribe((value) => {
        v1seedValue = value
        inputSeed = ''
    })

    const fillInputWithSeedPhrase = () => {
        inputSeed = generateSeedPhrase()
    }

    // if Clipboard API doesn't exist in browser, hide icon
    if (!navigator.clipboard) {
        clipboardAccess = false
    }

    // method for copying text to clipboard
    const copy = async () => {
        await navigator.clipboard.writeText(inputSeed)
    }

    // init v1seed state with local storage value
    v1seed.update(() => window.localStorage.getItem('v1-seed'))
</script>

<Layout>
    {#if !v1seedValue}
        <div class="mb-4">
            <p class="text-palette-400 font-sora">Skynet Kernel</p>
            <div class="flex">
                <h2 class="text-xl font-semibold font-sora">
                    Authenticate with Seed
                </h2>
                <div class="pt-1 ml-3 my-auto">
                    <Link href="/about">
                        <Info size={20} strokeWidth={1.5} />
                    </Link>
                </div>
            </div>
        </div>
        <div class="flex w-full">
            <input
                bind:value={inputSeed}
                class="grow p-4 text-md bg-gray-50 focus:outline-none border border-gray-200 rounded text-gray-600"
                type="text"
                placeholder="13 Word Seed Phrase"
            />
            {#if clipboardAccess}
                <button
                    on:click={copy}
                    disabled={!validSeed}
                    class="p-3 pr-1 disabled:text-palette-200 text-palette-400 hover:text-primary active:text-primary-light active:scale-125"
                >
                    <Copy size={25} strokeWidth={1.5} />
                </button>
            {/if}
        </div>
        <div>
            <button
                disabled={!validSeed}
                on:click={() => authUser(inputSeed)}
                class="w-full py-4 disabled:bg-palette-200 bg-primary hover:bg-primary-light rounded text-md font-sora font-semibold text-palette-100 transition duration-150"
                >Sign In</button
            >
        </div>
        <div class="flex items-center justify-between">
            <div class="flex flex-row items-center" />
            <div>
                <button
                    on:click={fillInputWithSeedPhrase}
                    class="hover:underline font-sourcesans font-bold text-sm text-primary hover:text-primary-light"
                >
                    Generate New Seed
                </button>
            </div>
        </div>
    {:else}
        <div class="mb-4">
            <p class="text-palette-400 font-sora">Skynet Kernel</p>
            <h2 class="text-xl font-semibold font-sora">You are authenticated.</h2>
        </div>
        <div>
            <button
                on:click={logOut}
                class="w-full my-1 py-4 bg-primary hover:bg-primary-light rounded text-md font-sora font-semibold text-palette-100 transition duration-150"
                >Log Out</button
            >
        </div>
    {/if}
</Layout>
