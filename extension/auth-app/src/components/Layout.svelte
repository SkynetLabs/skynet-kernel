<script lang="ts">
    export let title = 'Skynet Kernel | Auth'
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

<section
    class="flex justify-center items-center h-screen bg-gradient-to-b from-gray-100 via-gray-300 to-gray-400 font-sourcesans"
>
    <div class="max-w-md w-full bg-white rounded shadow-md p-6 space-y-4">
        <slot />
    </div>
</section>
