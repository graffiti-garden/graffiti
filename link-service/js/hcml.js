import Transclude from './transclude.js';

customElements.define('hc-transclude', Transclude)

// Create a global transclusion tree
window.root = TransclusionNode(location.pathname)

// Any time a link is clicked *[href]
// Add a history item
// history.push_state({}, whatever, 

// More TODO:
// like/endorse counters
// comment box
// like/endorse button
// identity
// build out filters/sorting/slicing
