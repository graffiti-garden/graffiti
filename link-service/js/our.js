import OurNamespace  from  './namespace.js';
import OurTransclude from './transclude.js';

customElements.define('our-namespace' , OurNamespace );
customElements.define('our-transclude', OurTransclude);

// TODO
//
// The top level uris have the form:
// uuid#target?repl1=uuid&repl2=uuid&repl3=uuid
//
//
// The repl strings replace other link elements:
//
// <a href="#?repl1=some-uuid">button 1</a>
// <a href="#?repl1=another-uuid">button 2</a>
//
// <transclude src="%repl1">
//   Fallback
// </transclude>
//
// or perhaps the syntax could be:
// src="[repl1]"
// (like in mavo)
//
// <children src="%repl2">
//   <transclude src="%"> <-- single % refers to the child address
//   </transclude>
//
//   <a href="#?repl3=%">visit child<a>
// </children>
//
// or perhaps the rather than the single %,
// the children could define the variable name:
// 
// <children src="%repl2" property="asdf">
//   <transclude src="%asdf">
//   </transclude>
// </children>
//
// (This latter case helps make recursion easier)
//
//
// The children can be filtered, sorted and cropped.
// For example this shows the most recent content by me posted to the uuid:
//
// <children src="uuid" filter="only-by-me" sort="chronological" num=1>
//   <transclude src="%"></transclude>
// </children>
//
// or filter="most-endorsed-post"
// or sort="endorsements"
// or sort="manual ordering, last-writer-wins"
//
// Transclusions should be croppable from previews:
// <transclude src="uuid" charlim=10>
// </transclude>
// (or perhaps just do {overflow: hidden; text-overflow: ellipsis;}
//
// Or maybe transclude in a way that strips to text only
// <transclude strip="text">
// </transclude>
//
//
// How should you handle combining content from multiple uuids?
// uuid1+uuid2?
//
// More TODO:
// like/endorse counters
// comment box
// like/endorse button
// identity
// build out filters/sorting/slicing
