import Transclude from './transclude.js';

customElements.define('hc-transclude', Transclude);

// theia
// a link with name theia,
// I can filter content by:
// type (e.g. hcml)
// rel (e.g. main/comment)
// signature
// timestamp
//
// as for rel:
// comments on a dynamic page seem pretty useless...
// my comment on it means nothing to your comment.
//
// Where should comments point if I name a page "theia" and then change it.
//
// The version I see is dependent on my social distance from the author...?
// but what about timestamp.
// What if both are equally distant.
//
// hctp://Computer Lib#?main=Whatever mn"
//
// hctp://facebook.hcml

// theia.hcml

// hyper community markup language
//
// theia.hcml:
//
// <template>
// </temlate>
//
// <children num=1 type="main" reload="live">
// </children>

// Whenever you add content you give it parents.
// name=theia.hcml, rel=main, 
// name=theia.hcml, rel=comment, 
//
// I can get all data from a particular address:
// the content type is implicit in the name.
// I can filter by type
// (rel),
// timestamp
// and signature.
// everything else happens in post.
//
// how can i talk about something that doesn't have a "main" tag?
// everything is given an implicit hash, which I can also fetch.

// THERE ARE NO ADDRESSES
//
// address "theia" just means: Show me the last thing that someone attached to theia.
// address "theia's website/my_public_key" means: show me the last thing that someone:
//
// theia#?focus=theias-books
// theia#?focus=theias-music
//
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
