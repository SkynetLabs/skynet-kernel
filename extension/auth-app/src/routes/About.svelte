<script context="module" lang="ts">
    import Layout from '../components/Layout.svelte'
    import {goto} from 'svelte-pathfinder';
</script>

<Layout>
        <!-- <div class="px-2 pt-4 pb-2 bg-white font-semibold font-sora text-lg">
            What is Skynet Kernel?
        </div>

        <div class="px-2 bg-white text-sm">
            The Skynet Kernel is the basis for an ecosystem of decentralized web app where users own their data.
        </div> -->

        <div class="px-2 pt-4 pb-2 bg-white font-semibold font-sora text-lg">
            What is a seed phrase?
        </div>

        <div class="px-2 bg-white text-md font-sourcesans">
            Your seed phrase encrypts and unlocks access to all of your data across Skynet. <span class="font-bold">You must not lose or share this secret phrase</span>. You will not be able to recover your account.
        </div>

        <div class="pt-2 px-2 bg-white text-right">
            <button on:click|once={()=>goto('/')} class="bg-primary shadow-md text-sm text-palette-100 font-sora font-bold py-3 md:px-8 px-4 hover:bg-primary-light active:bg-primary rounded transition duration-150" 
                href="#">Back</button>
        </div>

</Layout>
