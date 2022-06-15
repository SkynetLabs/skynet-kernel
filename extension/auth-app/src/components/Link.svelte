<script context="module" lang="ts">
    import { goto } from 'svelte-pathfinder'
</script>

<script lang="ts">
    export let href: string
    export let className =
        $$props.class ||
        'text-palette-400 hover:text-primary hover:underline active:text-primary-light'
</script>

<button on:click={() => goto(href)} class={className}>
    <slot />
</button>
