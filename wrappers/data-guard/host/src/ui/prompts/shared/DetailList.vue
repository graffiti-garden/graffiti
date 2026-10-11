<template><dl class="detail-list"><slot /></dl></template>

<style>
.detail-list { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.4rem 1rem; margin: 0; }
.detail-list > dt { font-weight: 600; }
.detail-list > dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
@media (max-width: 42rem) {
  .detail-list { grid-template-columns: minmax(0, 1fr); gap: 0.1rem; }
  .detail-list > dt:not(:first-child) { margin-top: 0.5rem; }
}
</style>
