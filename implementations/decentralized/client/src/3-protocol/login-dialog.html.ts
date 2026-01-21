export const template = `<template id="graffiti-login-welcome">
  <h1>
    <a target="_blank" href="https://graffiti.garden">Graffiti Log&nbsp;In</a>
  </h1>

  <ul>
    <li><a type="button" id="graffiti-login-new">Create&nbsp;new Graffiti&nbsp;identity</a></li>
    <li><button class="secondary" id="graffiti-login-existing">Use&nbsp;existing Graffiti&nbsp;identity</button></li>
  </ul>

  <aside>
    This application is built with
    <a target="_blank" href="https://graffiti.garden">Graffiti</a>.
  </aside>
</template>

<template id="graffiti-login-handle">
<h1>
  <a target="_blank" href="https://graffiti.garden">Graffiti Log&nbsp;In</a>
</h1>

  <form id="graffiti-login-handle-form">
    <label for="username">Graffiti handle:</label>
    <input
      type="text"
      name="username"
      id="username"
      autocomplete="username"
      autocapitalize="none"
      spellcheck="false"
      inputmode="url"
      placeholder="you.graffiti.actor"
      required
    >
    <button id="graffiti-login-handle-submit" type="submit">
      Log In
    </button>
  </form>

  <p>
    Don't&nbsp;have&nbsp;a Graffiti&nbsp;handle? <a id="graffiti-login-new">Create&nbsp;one</a>.
  </p>
</template>`;
