<template><dl class="detail-list"><slot /></dl></template>

<style>
.detail-list { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.4rem 1rem; margin: 0; }
.detail-list > dt { font-weight: 600; }
.detail-list > dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
</style>
